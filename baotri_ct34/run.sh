#!/bin/sh
set -e

OPTIONS=/data/options.json

if [ -f "$OPTIONS" ]; then
  export ADMIN_EMAIL=$(jq -r '.admin_email // "tnthanhlan@gmail.com"' "$OPTIONS")
  export ADMIN_PASSWORD=$(jq -r '.admin_password // "changeme"' "$OPTIONS")
  export USER_EMAIL=$(jq -r '.user_email // "doisuachuact34@gmail.com"' "$OPTIONS")
  export USER_PASSWORD=$(jq -r '.user_password // "changeme"' "$OPTIONS")
  export SESSION_SECRET=$(jq -r '.session_secret // "changeme-secret"' "$OPTIONS")
  export TZ=$(jq -r '.timezone // "Asia/Ho_Chi_Minh"' "$OPTIONS")
else
  export ADMIN_EMAIL="tnthanhlan@gmail.com"
  export ADMIN_PASSWORD="changeme"
  export USER_EMAIL="doisuachuact34@gmail.com"
  export USER_PASSWORD="changeme"
  export SESSION_SECRET="changeme-secret"
  export TZ="Asia/Ho_Chi_Minh"
fi

export DB_PATH="/data/baotri.db"
export EXPORT_DIR="/share/baotri_exports"
export PORT="8099"

mkdir -p "$EXPORT_DIR"
mkdir -p "/data"

echo "[baotri_ct34] Khoi dong app, timezone=$TZ, export=$EXPORT_DIR"

cd /app
exec node server.js
