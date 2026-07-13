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
  export CF_TOKEN=$(jq -r '.cloudflare_tunnel_token // ""' "$OPTIONS")
else
  export ADMIN_EMAIL="tnthanhlan@gmail.com"
  export ADMIN_PASSWORD="changeme"
  export USER_EMAIL="doisuachuact34@gmail.com"
  export USER_PASSWORD="changeme"
  export SESSION_SECRET="changeme-secret"
  export TZ="Asia/Ho_Chi_Minh"
  export CF_TOKEN=""
fi

export DB_PATH="/data/baotri.db"
export EXPORT_DIR="/share/baotri_exports"
export PORT="8100"

mkdir -p "$EXPORT_DIR"
mkdir -p "/data"

if [ -n "$CF_TOKEN" ]; then
  echo "[baotri_ct34] Se khoi dong Cloudflare Tunnel sau khi xac nhan app san sang..."
fi

echo "[baotri_ct34] Khoi dong app, timezone=$TZ, export=$EXPORT_DIR"

cd /app
node server.js &
NODE_PID=$!

echo "[baotri_ct34] Dang tu kiem tra localhost:8100 tu ben trong container..."
READY=0
for i in $(seq 1 15); do
  sleep 1
  if curl -sf -o /dev/null "http://127.0.0.1:8100/" 2>/dev/null; then
    echo "[baotri_ct34] KET QUA TU KIEM TRA: THANH CONG - app dang tra loi tai 127.0.0.1:8100 (lan thu $i)"
    READY=1
    break
  fi
done
if [ "$READY" -eq 0 ]; then
  echo "[baotri_ct34] KET QUA TU KIEM TRA: THAT BAI - sau 15 giay van khong ket noi duoc toi 127.0.0.1:8100 tu chinh container nay"
fi

if [ -n "$CF_TOKEN" ]; then
  echo "[baotri_ct34] Khoi dong Cloudflare Tunnel (chay nen trong container nay)..."
  cloudflared tunnel run --token "$CF_TOKEN" &
else
  echo "[baotri_ct34] Chua cau hinh cloudflare_tunnel_token, bo qua buoc chay Cloudflare Tunnel."
fi

wait $NODE_PID
