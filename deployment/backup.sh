#!/bin/bash
# Storm Scout - Automated Database Backup (closes #271)
#
# Creates a compressed MariaDB/MySQL dump with rotation.
# Designed to run via cron (daily) or systemd timer.
#
# Usage:
#   ./backup.sh                      # uses defaults
#   BACKUP_DIR=/mnt/backups ./backup.sh  # custom backup dir
#
# Environment variables:
#   DB_HOST       Database host (default: localhost)
#   DB_PORT       Database port (default: 3306)
#   DB_USER       Database user (default: storm_scout)
#   DB_PASSWORD   Database password (required)
#   DB_NAME       Database name (default: storm_scout)
#   BACKUP_DIR    Backup destination (default: /var/backups/storm-scout)
#   RETENTION_DAYS  Days to keep backups (default: 30)

set -euo pipefail

# Configuration
DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-3306}"
DB_USER="${DB_USER:-storm_scout}"
DB_NAME="${DB_NAME:-storm_scout}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/storm-scout}"
RETENTION_DAYS="${RETENTION_DAYS:-30}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="${BACKUP_DIR}/${DB_NAME}_${TIMESTAMP}.sql.gz"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log_info()  { echo -e "${GREEN}[BACKUP]${NC} $1"; }
log_warn()  { echo -e "${YELLOW}[BACKUP]${NC} $1"; }
log_error() { echo -e "${RED}[BACKUP]${NC} $1" >&2; }

# Validate password is set
if [ -z "${DB_PASSWORD:-}" ]; then
    log_error "DB_PASSWORD is required. Set it in the environment or .env file."
    exit 1
fi

# Create backup directory
mkdir -p "$BACKUP_DIR"

log_info "Starting backup of ${DB_NAME}@${DB_HOST}:${DB_PORT}"
log_info "Destination: ${BACKUP_FILE}"

# Run mariadb-dump (falls back to mysqldump if mariadb-dump unavailable)
DUMP_CMD="mariadb-dump"
if ! command -v mariadb-dump &>/dev/null; then
    DUMP_CMD="mysqldump"
fi

if ! command -v "$DUMP_CMD" &>/dev/null; then
    log_error "Neither mariadb-dump nor mysqldump found in PATH"
    exit 1
fi

START_TIME=$(date +%s)

"$DUMP_CMD" \
    --host="$DB_HOST" \
    --port="$DB_PORT" \
    --user="$DB_USER" \
    --password="$DB_PASSWORD" \
    --single-transaction \
    --routines \
    --triggers \
    --quick \
    --lock-tables=false \
    "$DB_NAME" | gzip > "$BACKUP_FILE"

END_TIME=$(date +%s)
DURATION=$((END_TIME - START_TIME))
FILESIZE=$(du -h "$BACKUP_FILE" | cut -f1)

log_info "Backup completed in ${DURATION}s (${FILESIZE})"

# Rotate old backups
DELETED=$(find "$BACKUP_DIR" -name "${DB_NAME}_*.sql.gz" -mtime +"$RETENTION_DAYS" -delete -print | wc -l)
if [ "$DELETED" -gt 0 ]; then
    log_info "Rotated ${DELETED} backups older than ${RETENTION_DAYS} days"
fi

# List current backups
BACKUP_COUNT=$(find "$BACKUP_DIR" -name "${DB_NAME}_*.sql.gz" | wc -l)
log_info "Total backups on disk: ${BACKUP_COUNT}"

log_info "Backup complete: ${BACKUP_FILE}"
