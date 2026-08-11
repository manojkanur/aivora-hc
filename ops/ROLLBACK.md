# AIVORA HC - Backup, Restore & Rollback Runbook

## Automated backups
- Nightly at 02:30 UTC via cron: /opt/aivora/scripts/backup_db.sh
- Location: /opt/aivora/backups/aivora_hc_<timestamp>.sql.gz  (gzipped pg_dump --clean --if-exists)
- Retention: 14 days. Log: /opt/aivora/backups/backup.log

## Manual backup (before any risky change)
    /opt/aivora/scripts/backup_db.sh

## Restore the database from a backup
    /opt/aivora/scripts/restore_db.sh /opt/aivora/backups/aivora_hc_<timestamp>.sql.gz
    docker restart aivora-backend-1
(The restore script takes a safety backup first and requires typing RESTORE.)

## Application rollback (code)
Backend and frontend deploy by copying files into containers.
- Frontend: previous build lives in git (branch history). Rebuild the desired commit,
  rsync dist/ to /opt/aivora/frontend-dark/dist, docker cp into ac-frontend, nginx -s reload.
- Backend: check out the previous commit, re-sync app/ into aivora-backend-1 via tar+docker cp,
  then docker restart aivora-backend-1.

## Caddy / routing rollback
- Caddyfile: /opt/agency-compass/Caddyfile  (timestamped .bak files kept alongside).
  To roll back routing: restore the desired .bak, then: docker exec ac-caddy caddy reload --config /etc/caddy/Caddyfile
