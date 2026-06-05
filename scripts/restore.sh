#!/usr/bin/env bash
#
# werbz-stories restore
# ---------------------
# Restores a backup created by scripts/backup.sh: the database AND the uploads.
#
# Usage:
#   bash scripts/restore.sh backups/2026-06-04_030000
#
# This is DESTRUCTIVE: it overwrites the current database contents and the
# uploads/ folder with the snapshot. It asks for confirmation first.
#
# Env (read from .env automatically):
#   DATABASE_URL   required
#   UPLOADS_DIR    optional — defaults to ./uploads

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$ROOT_DIR"

if [ -f "$ROOT_DIR/.env" ]; then
  set -a
  # shellcheck disable=SC1091
  . "$ROOT_DIR/.env"
  set +a
fi

UPLOADS_DIR="${UPLOADS_DIR:-./uploads}"

SRC="${1:-}"
if [ -z "$SRC" ] || [ ! -d "$SRC" ]; then
  echo "Usage: bash scripts/restore.sh <backup-folder>" >&2
  echo "Available backups:" >&2
  ls -1dt "${BACKUP_DIR:-$ROOT_DIR/backups}"/*/ 2>/dev/null >&2 || echo "  (none found)" >&2
  exit 1
fi

if [ -z "${DATABASE_URL:-}" ]; then
  echo "ERROR: DATABASE_URL is not set." >&2
  exit 1
fi

echo "About to RESTORE from: $SRC"
[ -f "$SRC/manifest.txt" ] && { echo "---"; cat "$SRC/manifest.txt"; echo "---"; }
echo "This OVERWRITES the current database and uploads folder."
read -r -p "Type 'restore' to continue: " confirm
if [ "$confirm" != "restore" ]; then
  echo "Aborted."
  exit 1
fi

# --- 1. database ---
if [ -f "$SRC/database.dump" ]; then
  echo "==> restoring database..."
  # --clean drops existing objects first; --if-exists avoids errors on first run
  pg_restore --clean --if-exists --no-owner --no-privileges \
    --dbname="$DATABASE_URL" \
    "$SRC/database.dump"
  echo "    database restored."
else
  echo "WARN: no database.dump in $SRC — skipping DB restore." >&2
fi

# --- 2. uploads ---
if [ -f "$SRC/uploads.tar.gz" ]; then
  echo "==> restoring uploads to $UPLOADS_DIR..."
  PARENT="$(dirname "$UPLOADS_DIR")"
  BASE="$(basename "$UPLOADS_DIR")"
  # move current aside rather than delete, just in case
  if [ -d "$UPLOADS_DIR" ]; then
    mv "$UPLOADS_DIR" "$PARENT/${BASE}.pre-restore.$(date +%s)"
  fi
  tar -xzf "$SRC/uploads.tar.gz" -C "$PARENT"
  echo "    uploads restored (previous folder kept as ${BASE}.pre-restore.*)."
else
  echo "WARN: no uploads.tar.gz in $SRC — skipping uploads restore." >&2
fi

echo "==> restore complete. Restart the app:  pm2 restart werbz-stories"
