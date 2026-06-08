#!/bin/bash
set -e

# ─── Logging ───────────────────────────────────────────────────────────────────
TIMESTAMP=$(date '+%Y-%m-%d_%H-%M-%S')
LOG_PREFIX="[${TIMESTAMP}] [aivora-backup]"

log()     { echo "${LOG_PREFIX} $1"; }
success() { echo "${LOG_PREFIX} ✓ $1"; }
error()   { echo "${LOG_PREFIX} ✗ $1" >&2; }

# ─── Load config from .env.prod (no source) ────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="${SCRIPT_DIR}/../.env.prod"

if [ ! -f "$ENV_FILE" ]; then
    error ".env.prod not found at $ENV_FILE"
    exit 1
fi

POSTGRES_USER=""
POSTGRES_PASSWORD=""
POSTGRES_DB=""
B2_ENDPOINT=""
B2_BUCKET=""
B2_KEY_ID=""
B2_APPLICATION_KEY=""

while IFS='=' read -r key value; do
    [[ -z "$key" || "$key" == \#* ]] && continue
    key="${key// /}"
    value="${value// /}"
    case "$key" in
        POSTGRES_USER)        POSTGRES_USER="$value" ;;
        POSTGRES_PASSWORD)    POSTGRES_PASSWORD="$value" ;;
        POSTGRES_DB)          POSTGRES_DB="$value" ;;
        B2_ENDPOINT)          B2_ENDPOINT="$value" ;;
        B2_BUCKET)            B2_BUCKET="$value" ;;
        B2_KEY_ID)            B2_KEY_ID="$value" ;;
        B2_APPLICATION_KEY)   B2_APPLICATION_KEY="$value" ;;
    esac
done < "$ENV_FILE"

# ─── Validate required vars ────────────────────────────────────────────────────
for var in POSTGRES_USER POSTGRES_PASSWORD POSTGRES_DB B2_ENDPOINT B2_BUCKET B2_KEY_ID B2_APPLICATION_KEY; do
    if [ -z "${!var}" ]; then
        error "Required variable $var is not set in .env.prod"
        exit 1
    fi
done

# ─── Backup ────────────────────────────────────────────────────────────────────
BACKUP_FILE="aivora_hc_${TIMESTAMP}.sql.gz"
BACKUP_PATH="/tmp/${BACKUP_FILE}"

log "Starting PostgreSQL backup for database: $POSTGRES_DB"

# Dump the database from the running postgres container and gzip
if ! PGPASSWORD="$POSTGRES_PASSWORD" docker exec -i \
    "$(docker compose -f "${SCRIPT_DIR}/../docker-compose.prod.yml" ps -q postgres)" \
    pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB" | gzip > "$BACKUP_PATH"; then
    error "pg_dump failed"
    rm -f "$BACKUP_PATH"
    exit 1
fi

BACKUP_SIZE=$(du -sh "$BACKUP_PATH" | cut -f1)
success "Backup created: $BACKUP_PATH ($BACKUP_SIZE)"

# ─── Upload to Backblaze B2 ────────────────────────────────────────────────────
log "Uploading backup to Backblaze B2 bucket: $B2_BUCKET"

if ! AWS_ACCESS_KEY_ID="$B2_KEY_ID" \
   AWS_SECRET_ACCESS_KEY="$B2_APPLICATION_KEY" \
   aws s3 cp "$BACKUP_PATH" \
       "s3://${B2_BUCKET}/postgres/${BACKUP_FILE}" \
       --endpoint-url "$B2_ENDPOINT" \
       --no-progress; then
    error "Upload to B2 failed"
    rm -f "$BACKUP_PATH"
    exit 1
fi

success "Backup uploaded to s3://${B2_BUCKET}/postgres/${BACKUP_FILE}"

# ─── Clean up local temp file ─────────────────────────────────────────────────
rm -f "$BACKUP_PATH"
log "Local temp file removed"

# ─── Prune B2 backups older than 7 days ──────────────────────────────────────
log "Pruning backups older than 7 days from B2..."

CUTOFF_EPOCH=$(date -d '7 days ago' '+%s' 2>/dev/null || date -v-7d '+%s' 2>/dev/null || echo "0")

if [ "$CUTOFF_EPOCH" = "0" ]; then
    log "Could not determine cutoff date for pruning — skipping prune step"
else
    DELETED_COUNT=0
    while IFS= read -r line; do
        # line format: "2024-01-01 00:00:00  12345  s3://bucket/postgres/aivora_hc_2024-01-01_00-00-00.sql.gz"
        FILE_DATE=$(echo "$line" | awk '{print $1 " " $2}')
        FILE_PATH=$(echo "$line" | awk '{print $NF}')
        FILE_EPOCH=$(date -d "$FILE_DATE" '+%s' 2>/dev/null || date -j -f '%Y-%m-%d %H:%M:%S' "$FILE_DATE" '+%s' 2>/dev/null || echo "9999999999")

        if [ "$FILE_EPOCH" -lt "$CUTOFF_EPOCH" ]; then
            if AWS_ACCESS_KEY_ID="$B2_KEY_ID" \
               AWS_SECRET_ACCESS_KEY="$B2_APPLICATION_KEY" \
               aws s3 rm "$FILE_PATH" \
                   --endpoint-url "$B2_ENDPOINT" --quiet; then
                log "  Deleted old backup: $FILE_PATH"
                DELETED_COUNT=$((DELETED_COUNT + 1))
            fi
        fi
    done < <(
        AWS_ACCESS_KEY_ID="$B2_KEY_ID" \
        AWS_SECRET_ACCESS_KEY="$B2_APPLICATION_KEY" \
        aws s3 ls "s3://${B2_BUCKET}/postgres/" \
            --endpoint-url "$B2_ENDPOINT" 2>/dev/null \
        | awk '{print $0}' \
        | while read -r date time size fname; do
            echo "$date $time $size s3://${B2_BUCKET}/postgres/$fname"
          done
    )
    success "Pruned $DELETED_COUNT old backup(s)"
fi

# ─── Done ─────────────────────────────────────────────────────────────────────
success "PostgreSQL backup completed successfully at $TIMESTAMP"
exit 0
