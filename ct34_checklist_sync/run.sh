#!/bin/sh
set -e

OPTIONS=/data/options.json

if [ -f "$OPTIONS" ]; then
  export ADMIN_EMAIL=$(jq -r '.admin_email // "tnthanhlan@gmail.com"' "$OPTIONS")
  export API_URL=$(jq -r '.api_url // ""' "$OPTIONS")
  export SYNC_CRON=$(jq -r '.sync_cron // "35 23 * * 0"' "$OPTIONS")
  export TZ=$(jq -r '.timezone // "Asia/Ho_Chi_Minh"' "$OPTIONS")
  export ONEDRIVE_BACKUP_ENABLED=$(jq -r '.onedrive_backup_enabled // false' "$OPTIONS")
  export ONEDRIVE_TOKEN=$(jq -r '.onedrive_token // ""' "$OPTIONS")
  export ONEDRIVE_REMOTE_PATH=$(jq -r '.onedrive_remote_path // ""' "$OPTIONS")
  export ONEDRIVE_DRIVE_ID=$(jq -r '.onedrive_drive_id // ""' "$OPTIONS")
  export ONEDRIVE_DRIVE_TYPE=$(jq -r '.onedrive_drive_type // "personal"' "$OPTIONS")
else
  export ADMIN_EMAIL="tnthanhlan@gmail.com"
  export API_URL=""
  export SYNC_CRON="35 23 * * 0"
  export TZ="Asia/Ho_Chi_Minh"
  export ONEDRIVE_BACKUP_ENABLED="false"
  export ONEDRIVE_TOKEN=""
  export ONEDRIVE_REMOTE_PATH=""
  export ONEDRIVE_DRIVE_ID=""
  export ONEDRIVE_DRIVE_TYPE="personal"
fi

export EXPORT_DIR="/share/checklist_ct34_reports"
mkdir -p "$EXPORT_DIR"
mkdir -p "/data/rclone"

echo "[ct34_checklist_sync] Khoi dong. TZ=$TZ, lich=$SYNC_CRON, export_dir=$EXPORT_DIR"

cd /app
exec node index.js
