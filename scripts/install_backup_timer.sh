#!/bin/bash
set -e

# Must be run as root
if [ "$(id -u)" -ne 0 ]; then
    echo "ERROR: This script must be run as root (sudo)." >&2
    exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKUP_SCRIPT="${SCRIPT_DIR}/backup_postgres.sh"

if [ ! -f "$BACKUP_SCRIPT" ]; then
    echo "ERROR: backup_postgres.sh not found at $BACKUP_SCRIPT" >&2
    exit 1
fi

chmod +x "$BACKUP_SCRIPT"

# ─── Create systemd service ────────────────────────────────────────────────────
SERVICE_FILE="/etc/systemd/system/aivora-backup.service"

cat > "$SERVICE_FILE" <<EOF
[Unit]
Description=Aivora HC PostgreSQL Backup
After=network-online.target docker.service
Requires=docker.service

[Service]
Type=oneshot
ExecStart=${BACKUP_SCRIPT}
StandardOutput=journal
StandardError=journal
SyslogIdentifier=aivora-backup

# Security hardening
NoNewPrivileges=true
ProtectSystem=strict
ReadWritePaths=/tmp

[Install]
WantedBy=multi-user.target
EOF

echo "Created: $SERVICE_FILE"

# ─── Create systemd timer ──────────────────────────────────────────────────────
TIMER_FILE="/etc/systemd/system/aivora-backup.timer"

cat > "$TIMER_FILE" <<EOF
[Unit]
Description=Aivora HC PostgreSQL Nightly Backup Timer
Requires=aivora-backup.service

[Timer]
# Nightly at 21:00 UTC
OnCalendar=*-*-* 21:00:00 UTC
Persistent=true
RandomizedDelaySec=300

[Install]
WantedBy=timers.target
EOF

echo "Created: $TIMER_FILE"

# ─── Reload systemd and enable timer ──────────────────────────────────────────
systemctl daemon-reload
systemctl enable --now aivora-backup.timer

echo ""
echo "✓ aivora-backup.timer installed and enabled"
echo ""
echo "Timer status:"
systemctl status aivora-backup.timer --no-pager

echo ""
echo "Next scheduled runs:"
systemctl list-timers aivora-backup.timer --no-pager

echo ""
echo "To run a manual backup now:  sudo systemctl start aivora-backup.service"
echo "To view backup logs:         journalctl -u aivora-backup.service -f"
echo "To disable the timer:        sudo systemctl disable --now aivora-backup.timer"
