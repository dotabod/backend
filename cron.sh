#!/bin/bash

set -a; source .env.prod; set +a
set -a; source .env.local; set +a

# PostgreSQL Backup util
# Automatic backup utility, run in cron job under postgres user
# Example cron line:
# 0 * * * * /path/to/backup/cron.sh

# Set the number of backups to keep
num_backups=1

# Set the name of the database to back up
db_name=dotabod

# Set the directory to store the backups
backup_dir="$HOME/psql_backups"
mkdir -p "$backup_dir"

# Create a timestamp for the current backup
timestamp=$(date +%Y-%m-%d-%H-%M)

# Create the backup file name
backup_file="$backup_dir/$db_name-$timestamp.sql"

# Use pg_dump to create a backup of the database
pg_dump -d "${DATABASE_URL%\?*}" \
    --no-comments \
    -N supabase_functions \
    -N auth \
    -N realtime \
    > "$backup_file"

# Compress the backup file using gzip
gzip -f "$backup_file"

# Check if the number of backups in the directory exceeds the limit
if [ "$(ls -1 "$backup_dir" | wc -l)" -gt $num_backups ]; then
  # Remove the oldest backup
  rm "$backup_dir/$(ls -1t "$backup_dir" | tail -1)"
fi
