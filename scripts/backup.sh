#!/usr/bin/env bash
#
# werbz-stories backup
# --------------------
# Captures BOTH things that hold your books:
#   1. the PostgreSQL database (storybooks, pages, assets, viewers, analytics)
#   2. the uploads/ folder (the actual image bytes — these are NOT in Postgres)
#
# Code lives in git/GitHub already; this script backs up the DATA that isn't.
#
# Usage (manual):
#   bash scripts/backup.sh
#
# Usage (cron, daily — see scripts/BACKUP.md):
#   0 3 * * *  cd /var/www/werbz-stories && bash scripts/backup.sh >> /var/log/werbz-backup.log 2>&1
#
# Env (read from .env automatically):
#   DATABASE_URL   required — Postgres connection string
#   UPLOADS_DIR    optional — defaults to ./uploads
#   BACKUP_DIR     optional — where backups are written; defaults to ./backups
#   BACKUP_KEEP    optional — how many backups to retain; defaults to 14

set -euo pipefail

# --- locate project root (this script lives in <root>/scripts) ---
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$ROOT_DIR"

# --- load .env (so DATABASE_URL etc. are available) ---
if [ -f "$ROOT_DIR/.env" ]; then
  set -a
  # shellcheck disable=SC1091
  . "$ROOT_DIR/.env"
  set +a
fi

UPLOADS_DIR="${UPLOADS_DIR:-./uploads}"
BACKUP_DIR="${BACKUP_DIR:-$ROOT_DIR/backups}"
BACKUP_KEEP="${BACKUP_KEEP:-14}"

if [ -z "${DATABASE_URL:-}" ]; then
  echo "ERROR: DATABASE_URL is not set (checked .env and environment)." >&2
  exit 1
fi

if ! command -v pg_dump >/dev/null 2>&1; then
  echo "ERROR: pg_dump not found. Install the Postgres client tools." >&2
  exit 1
fi

STAMP="$(date +%Y-%m-%d_%H%M%S)"
DEST="$BACKUP_DIR/$STAMP"
mkdir -p "$DEST"

echo "==> werbz-stories backup @ $STAMP"
echo "    project : $ROOT_DIR"
echo "    dest    : $DEST"

# --- 1. database dump (custom format = compressed + restorable selectively) ---
echo "==> dumping database..."
pg_dump --format=custom --no-owner --no-privileges \
  --dbname="$DATABASE_URL" \
  --file="$DEST/database.dump"
echo "    db dump : $(du -h "$DEST/database.dump" | cut -f1)"

# --- 2. uploads archive (the image bytes) ---
if [ -d "$UPLOADS_DIR" ]; then
  echo "==> archiving uploads ($UPLOADS_DIR)..."
  tar -czf "$DEST/uploads.tar.gz" -C "$(dirname "$UPLOADS_DIR")" "$(basename "$UPLOADS_DIR")"
  echo "    uploads : $(du -h "$DEST/uploads.tar.gz" | cut -f1)"
else
  echo "WARN: uploads dir '$UPLOADS_DIR' not found — skipping (no image files backed up)." >&2
fi

# --- manifest: makes a backup self-describing for restore ---
cat > "$DEST/manifest.txt" <<EOF
werbz-stories backup
created    : $STAMP
host       : $(hostname)
git_commit : $(git rev-parse --short HEAD 2>/dev/null || echo "n/a")
uploads_src: $UPLOADS_DIR
EOF

# --- prune old backups, keep newest $BACKUP_KEEP ---
echo "==> pruning old backups (keeping newest $BACKUP_KEEP)..."
cd "$BACKUP_DIR"
ls -1dt */ 2>/dev/null | tail -n +"$((BACKUP_KEEP + 1))" | while read -r old; do
  echo "    removing $old"
  rm -rf "$old"
done

echo "==> done. Latest backups:"
ls -1dt "$BACKUP_DIR"/*/ 2>/dev/null | head -n 5
