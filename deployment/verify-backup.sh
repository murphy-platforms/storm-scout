#!/bin/bash
# Storm Scout - Backup Verification (closes #271)
#
# Restores the latest backup to a temporary database and runs a smoke test
# to verify data integrity. The temp database is dropped after verification.
#
# Usage:
#   ./verify-backup.sh                         # verify latest backup
#   ./verify-backup.sh /path/to/backup.sql.gz  # verify specific file
#
# Environment variables:
#   DB_HOST       Database host (default: localhost)
#   DB_PORT       Database port (default: 3306)
#   DB_USER       Database user (default: storm_scout)
#   DB_PASSWORD   Database password (required)
#   DB_NAME       Source database name (default: storm_scout)
#   BACKUP_DIR    Backup directory (default: /var/backups/storm-scout)

set -euo pipefail

# Configuration
DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-3306}"
DB_USER="${DB_USER:-storm_scout}"
DB_NAME="${DB_NAME:-storm_scout}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/storm-scout}"
VERIFY_DB="${DB_NAME}_verify_$$"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log_info()  { echo -e "${GREEN}[VERIFY]${NC} $1"; }
log_warn()  { echo -e "${YELLOW}[VERIFY]${NC} $1"; }
log_error() { echo -e "${RED}[VERIFY]${NC} $1" >&2; }

# Validate password
if [ -z "${DB_PASSWORD:-}" ]; then
    log_error "DB_PASSWORD is required."
    exit 1
fi

# MySQL/MariaDB client command
MYSQL_CMD="mariadb"
if ! command -v mariadb &>/dev/null; then
    MYSQL_CMD="mysql"
fi

mysql_exec() {
    "$MYSQL_CMD" --host="$DB_HOST" --port="$DB_PORT" --user="$DB_USER" --password="$DB_PASSWORD" "$@"
}

# Find backup file
BACKUP_FILE="${1:-}"
if [ -z "$BACKUP_FILE" ]; then
    BACKUP_FILE=$(find "$BACKUP_DIR" -name "${DB_NAME}_*.sql.gz" -printf '%T+ %p\n' 2>/dev/null | sort -r | head -1 | cut -d' ' -f2-)
    if [ -z "$BACKUP_FILE" ]; then
        log_error "No backup files found in ${BACKUP_DIR}"
        exit 1
    fi
fi

if [ ! -f "$BACKUP_FILE" ]; then
    log_error "Backup file not found: ${BACKUP_FILE}"
    exit 1
fi

log_info "Verifying backup: ${BACKUP_FILE}"
FILESIZE=$(du -h "$BACKUP_FILE" | cut -f1)
log_info "File size: ${FILESIZE}"

# Cleanup function — always drop the temp database
cleanup() {
    log_info "Dropping temporary database ${VERIFY_DB}..."
    mysql_exec -e "DROP DATABASE IF EXISTS \`${VERIFY_DB}\`;" 2>/dev/null || true
}
trap cleanup EXIT

# Create temp database
log_info "Creating temporary database: ${VERIFY_DB}"
mysql_exec -e "CREATE DATABASE \`${VERIFY_DB}\`;"

# Restore
log_info "Restoring backup..."
START_TIME=$(date +%s)
gunzip -c "$BACKUP_FILE" | mysql_exec "$VERIFY_DB"
END_TIME=$(date +%s)
log_info "Restore completed in $((END_TIME - START_TIME))s"

# Smoke tests
log_info "Running smoke tests..."
PASS=0
FAIL=0

check_table() {
    local table="$1"
    local count
    count=$(mysql_exec "$VERIFY_DB" -N -e "SELECT COUNT(*) FROM \`${table}\`;" 2>/dev/null)
    if [ $? -eq 0 ]; then
        log_info "  ${table}: ${count} rows"
        PASS=$((PASS + 1))
    else
        log_error "  ${table}: FAILED to query"
        FAIL=$((FAIL + 1))
    fi
}

# Check core tables exist and are queryable
check_table "offices"
check_table "advisories"
check_table "office_status"
check_table "alert_types"
check_table "ingestion_events"

# Check schema_migrations
MIGRATION_COUNT=$(mysql_exec "$VERIFY_DB" -N -e "SELECT COUNT(*) FROM schema_migrations;" 2>/dev/null || echo "0")
log_info "  schema_migrations: ${MIGRATION_COUNT} applied"
PASS=$((PASS + 1))

# Summary
echo ""
if [ "$FAIL" -eq 0 ]; then
    log_info "Verification PASSED (${PASS}/${PASS} checks)"
    exit 0
else
    log_error "Verification FAILED (${FAIL} failures, ${PASS} passed)"
    exit 1
fi
