# Backups & Restore

Your books live in **two** places. A backup must capture both:

1. **PostgreSQL** — books, pages, text, structure, viewers, analytics.
2. **`uploads/`** — the image files. The DB only stores *paths*; the bytes are
   on disk. (See `src/db/schema.ts`: "Media bytes NEVER live in Postgres.")

The app *code* is already safe in git/GitHub. These scripts back up the **data**
that is **not** in git (and is what a guest editor could accidentally delete).

## Make a backup now (manual)

```bash
cd /var/www/werbz-stories
bash scripts/backup.sh
```

Writes a timestamped folder under `backups/` containing:
- `database.dump`   (compressed pg_dump, custom format)
- `uploads.tar.gz`  (all image files)
- `manifest.txt`    (when/where/which git commit)

Old backups are auto-pruned; the newest 14 are kept (`BACKUP_KEEP` to change).

## Schedule daily backups on the VPS

Add a cron job (runs 03:00 every day):

```bash
crontab -e
```

Add this line:

```cron
0 3 * * * cd /var/www/werbz-stories && bash scripts/backup.sh >> /var/log/werbz-backup.log 2>&1
```

Check it ran:

```bash
tail -n 30 /var/log/werbz-backup.log
ls -lt /var/www/werbz-stories/backups
```

## Restore from a backup

```bash
cd /var/www/werbz-stories
bash scripts/restore.sh backups/2026-06-04_030000
pm2 restart werbz-stories
```

This is destructive (it overwrites current DB + uploads) and asks you to type
`restore` to confirm. The previous `uploads/` folder is moved aside as
`uploads.pre-restore.*` rather than deleted, just in case.

## IMPORTANT: get one copy OFF the server

Backups in `backups/` sit on the same VPS as the live data. If that server is
lost, so are the backups. At minimum, periodically pull a copy to your Mac:

```bash
# run on your Mac
scp -r user@your-vps:/var/www/werbz-stories/backups/<folder> ~/werbz-backups/
```

(or rclone/restic to cloud storage). I can wire that up if you want it automated.

## Note on preventing deletion

A backup lets you *undo* a mistake after the fact — it does not stop a guest
from deleting books in the moment, and Studio uses one shared password. If you
want the guest to be physically unable to delete other people's books, that's a
separate app change (disable delete, or soft-delete). Ask and I'll add it.
