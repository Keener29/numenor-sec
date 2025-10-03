#!/bin/bash

# Database backup script for Numenor Security
# This script creates automated backups of the PostgreSQL database

set -e

# Configuration
BACKUP_DIR="/app/backups"
DB_NAME="${DB_NAME:-numenor_security}"
DB_USER="${DB_USER:-numenor_user}"
DB_HOST="${DB_HOST:-postgres}"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_FILE="${BACKUP_DIR}/backup_${DB_NAME}_${TIMESTAMP}.sql"

# Create backup directory if it doesn't exist
mkdir -p "$BACKUP_DIR"

echo "Starting database backup..."
echo "Database: $DB_NAME"
echo "Host: $DB_HOST"
echo "Backup file: $BACKUP_FILE"

# Create database backup
pg_dump -h "$DB_HOST" -U "$DB_USER" -d "$DB_NAME" > "$BACKUP_FILE"

# Compress the backup
gzip "$BACKUP_FILE"
BACKUP_FILE="${BACKUP_FILE}.gz"

echo "Backup completed: $BACKUP_FILE"

# Keep only the last 7 days of backups
find "$BACKUP_DIR" -name "backup_${DB_NAME}_*.sql.gz" -mtime +7 -delete

echo "Old backups cleaned up (keeping last 7 days)"
echo "Backup completed successfully"
