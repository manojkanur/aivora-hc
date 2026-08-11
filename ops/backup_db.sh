#!/usr/bin/env bash
# AIVORA HC - nightly PostgreSQL backup.
# Dumps the aivora_hc database (gzip), keeps 14 days, logs to backup.log.
set -euo pipefail

BACKUP_DIR=/opt/aivora/backups
LOG=/opt/aivora/backups/backup.log
RETENTION_DAYS=14
CONTAINER=aivora-postgres-1
DB=aivora_hc
DB_USER=aivora
STAMP=$(date +%Y%m%d_%H%M%S)
OUT="${BACKUP_DIR}/aivora_hc_${STAMP}.sql.gz"

mkdir -p "$BACKUP_DIR"
echo "[$(date -Is)] starting backup -> $OUT" >> "$LOG"

if docker exec "$CONTAINER" pg_dump -U "$DB_USER" -d "$DB" --clean --if-exists 2>>"$LOG" | gzip > "$OUT"; then
  SIZE=$(du -h "$OUT" | cut -f1)
  echo "[$(date -Is)] OK backup complete ($SIZE)" >> "$LOG"
else
  echo "[$(date -Is)] ERROR backup FAILED" >> "$LOG"
  rm -f "$OUT"
  exit 1
fi

# Prune old backups
find "$BACKUP_DIR" -name 'aivora_hc_*.sql.gz' -mtime +$RETENTION_DAYS -delete 2>>"$LOG" || true
COUNT=$(find "$BACKUP_DIR" -name 'aivora_hc_*.sql.gz' | wc -l)
echo "[$(date -Is)] retention pruned; $COUNT backups on disk" >> "$LOG"
