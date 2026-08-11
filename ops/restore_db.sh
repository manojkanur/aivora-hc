#!/usr/bin/env bash
# AIVORA HC - restore PostgreSQL from a backup produced by backup_db.sh.
# Usage: restore_db.sh <backup_file.sql.gz>
# Safety: makes a fresh pre-restore backup first, then requires typing RESTORE.
set -euo pipefail

CONTAINER=aivora-postgres-1
DB=aivora_hc
DB_USER=aivora
FILE=${1:-}

if [[ -z "$FILE" || ! -f "$FILE" ]]; then
  echo "Usage: $0 <backup_file.sql.gz>"
  echo "Available backups:"; ls -1t /opt/aivora/backups/*.sql.gz 2>/dev/null || echo '  (none)'
  exit 1
fi

echo "About to restore $DB from: $FILE"
echo "This OVERWRITES the current database. A safety backup will be taken first."
read -r -p 'Type RESTORE to proceed: ' CONFIRM
[[ "$CONFIRM" == 'RESTORE' ]] || { echo 'Aborted.'; exit 1; }

echo 'Taking a pre-restore safety backup...'
/opt/aivora/scripts/backup_db.sh

echo 'Restoring...'
zcat "$FILE" | docker exec -i "$CONTAINER" psql -U "$DB_USER" -d "$DB"
echo 'Restore complete. Restart the backend to clear caches:'
echo '  docker restart aivora-backend-1'
