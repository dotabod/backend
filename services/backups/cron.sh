#!/bin/bash

# PostgreSQL and MongoDB Backup util
# Automatic backup utility, run in cron job under postgres user
# Example cron line:
# cron every day
# 0 0 * * * doppler run --scope $HOME/dotabod -- /bin/bash $HOME/dotabod/cron.sh

# Set the number of backups to keep
num_backups=24

# Set the directory to store the backups
backup_dir="$HOME/psql_backups"
mkdir -p "$backup_dir"

# Create a timestamp for the current backup
timestamp=$(date +%Y-%m-%d-%H-%M)

# Create the backup file name
backup_file="$backup_dir/$timestamp.sql.gz"

# Use pg_dump to create a backup of the PostgreSQL database
# Specific arguments just for supabase
pg_dump -d "${DATABASE_URL%\?*}" \
  --no-comments \
  -F c \
  -N supabase_functions |
  gzip >"$backup_file"

# Use mongodump to create a backup of the MongoDB database
mongodump --uri="$MONGO_URL" --archive="$backup_dir/$timestamp.mongodb.gz" --gzip

# Use the `tar` command to combine the two backup files into a single compressed file
tar -czf "$backup_dir/$timestamp.tar.gz" "$backup_file" "$backup_dir/$timestamp.mongodb.gz"

# Use the `aws` CLI to upload the backup file to S3
aws s3 cp "$backup_dir/$timestamp.tar.gz" "s3://$AWS_BUCKET_NAME/$timestamp.tar.gz"

# Check if the number of backups in the S3 bucket exceeds the limit
if [ "$(aws s3 ls "s3://$AWS_BUCKET_NAME" | wc -l)" -gt $num_backups ]; then
  # Remove the oldest backup
  oldest_backup=$(aws s3 ls "s3://$AWS_BUCKET_NAME" | sort | head -n 1 | awk '{print $4}')
  aws s3 rm "s3://$AWS_BUCKET_NAME/$oldest_backup"
fi

# Delete the local backup files
rm "$backup_file"
rm "$backup_dir/$timestamp.mongodb.gz"
rm "$backup_dir/$timestamp.tar.gz"
