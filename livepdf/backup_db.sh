#!/bin/bash
# Load environment secrets or production env
if [ -f /home/ubuntu/.env ]; then
  source /home/ubuntu/.env
fi

TIMESTAMP=$(date +"%Y-%m-%d-%H%M%S")
BACKUP_DIR="/home/ubuntu/db_backups"
BACKUP_FILE="$BACKUP_DIR/livepdf-$TIMESTAMP.sql.gz"
S3_BUCKET_NAME=${AWS_BACKUPS_BUCKET:-"livepdf-backups-bucket"}

mkdir -p $BACKUP_DIR

echo "Starting PostgreSQL backup..."
PGPASSWORD=$DB_PASSWORD pg_dump -h ${DB_HOST:-"localhost"} -p ${DB_PORT:-5432} -U ${DB_USER:-"postgres"} -d ${DB_NAME:-"livepdf"} | gzip > $BACKUP_FILE

if [ $? -eq 0 ]; then
  echo "Backup successfully created: $BACKUP_FILE"
  
  # Check if AWS CLI is installed
  if command -v aws &> /dev/null; then
    echo "Uploading backup to AWS S3 bucket: s3://$S3_BUCKET_NAME/"
    aws s3 cp $BACKUP_FILE s3://$S3_BUCKET_NAME/livepdf-$TIMESTAMP.sql.gz
    if [ $? -eq 0 ]; then
      echo "Backup successfully uploaded to S3."
      rm $BACKUP_FILE
    else
      echo "⚠️ S3 upload failed."
    fi
  else
    echo "⚠️ AWS CLI not installed. Backup remains locally at $BACKUP_FILE"
  fi
else
  echo "❌ Database backup dump failed."
fi
