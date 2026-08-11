#!/usr/bin/env bash
# AIVORA HC - lightweight health monitor. Checks public site, API and core
# containers; logs status and appends ALERT lines on failure (grep-friendly for
# any external alerting or a quick tail). Runs every 5 min via cron.
set -uo pipefail
LOG=/opt/aivora/backups/health.log
SITE='https://srv1272089.hstgr.cloud/'
API='https://srv1272089.hstgr.cloud/api/v1/auth/linkedin/status'
ts=$(date -Is)
fail=0

code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 15 "$SITE" || echo 000)
[[ "$code" == 200 ]] || { echo "[$ts] ALERT site $SITE returned $code" >> "$LOG"; fail=1; }

# API is auth-gated; 200/401/403 all mean the backend is answering. 5xx/000 = down.
acode=$(curl -s -o /dev/null -w '%{http_code}' --max-time 15 "$API" || echo 000)
case "$acode" in 200|401|403) : ;; *) echo "[$ts] ALERT api $API returned $acode" >> "$LOG"; fail=1 ;; esac

for c in aivora-backend-1 aivora-postgres-1 aivora-redis-1 ac-caddy ac-frontend; do
  st=$(docker inspect -f '{{.State.Running}}' "$c" 2>/dev/null || echo missing)
  [[ "$st" == true ]] || { echo "[$ts] ALERT container $c not running ($st)" >> "$LOG"; fail=1; }
done

# disk space guard (alert over 85%)
disk=$(df / | awk 'NR==2{gsub(/%/,"",$5); print $5}')
[[ "$disk" -lt 85 ]] || echo "[$ts] ALERT disk usage ${disk}%" >> "$LOG"

if [[ "$fail" == 0 ]]; then echo "[$ts] OK site=$code api=$acode disk=${disk}%" >> "$LOG"; fi
# keep log bounded
tail -n 2000 "$LOG" > "$LOG.tmp" && mv "$LOG.tmp" "$LOG"
