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
  export ONEDRIVE_BACKUP_ENABLED=$(jq -r '.onedrive_backup_enabled // false' "$OPTIONS")
  export ONEDRIVE_TOKEN=$(jq -r '.onedrive_token // ""' "$OPTIONS")
  export ONEDRIVE_REMOTE_PATH=$(jq -r '.onedrive_remote_path // ""' "$OPTIONS")
  export ONEDRIVE_DRIVE_ID=$(jq -r '.onedrive_drive_id // ""' "$OPTIONS")
  export ONEDRIVE_DRIVE_TYPE=$(jq -r '.onedrive_drive_type // "personal"' "$OPTIONS")
else
  export ADMIN_EMAIL="tnthanhlan@gmail.com"
  export ADMIN_PASSWORD="changeme"
  export USER_EMAIL="doisuachuact34@gmail.com"
  export USER_PASSWORD="changeme"
  export SESSION_SECRET="changeme-secret"
  export TZ="Asia/Ho_Chi_Minh"
  export CF_TOKEN=""
  export ONEDRIVE_BACKUP_ENABLED="false"
  export ONEDRIVE_TOKEN=""
  export ONEDRIVE_REMOTE_PATH=""
  export ONEDRIVE_DRIVE_ID=""
  export ONEDRIVE_DRIVE_TYPE="personal"
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
    echo "[baotri_ct34] KET QUA TU KIEM TRA (127.0.0.1): THANH CONG - lan thu $i"
    READY=1
    break
  fi
done
if [ "$READY" -eq 0 ]; then
  echo "[baotri_ct34] KET QUA TU KIEM TRA (127.0.0.1): THAT BAI sau 15 giay"
fi

if curl -sf -o /dev/null "http://localhost:8100/" 2>/dev/null; then
  echo "[baotri_ct34] KET QUA TU KIEM TRA (chu localhost): THANH CONG"
else
  echo "[baotri_ct34] KET QUA TU KIEM TRA (chu localhost): THAT BAI - day co the la nguyen nhan that su"
fi

if [ -n "$CF_TOKEN" ]; then
  echo "[baotri_ct34] Khoi dong Cloudflare Tunnel (chay nen trong container nay, tu dong khoi dong lai neu bi thoat)..."
  # cloudflared doi khi mat ket noi voi edge thi no tu dong retry, NHUNG neu no that bai ngay
  # tu luc ket noi lan dau (vi du mang chap chon dung luc container vua khoi dong) thi no se
  # THOAT HAN (exit) thay vi retry mai - luc do neu khong co gi khoi dong lai no thi tunnel
  # coi nhu chet han, web se bao loi 1033 cho toi khi ai do tu tay restart ca add-on. Boc no
  # trong 1 vong lap vo han de tu dong khoi dong lai bat ke ly do thoat la gi.
  (
    while true; do
      # "|| CODE=$?" (khong phai dong rieng "CODE=$?") la de "set -e" o dau file khong hieu
      # nham la ca vong lap nay that bai roi thoat subshell ngay khi cloudflared exit != 0
      cloudflared tunnel --protocol http2 run --token "$CF_TOKEN" || CODE=$?
      echo "[baotri_ct34] Cloudflare Tunnel bi thoat (ma loi: ${CODE:-0}) - tu khoi dong lai sau 5 giay..."
      CODE=
      sleep 5
    done
  ) &
else
  echo "[baotri_ct34] Chua cau hinh cloudflare_tunnel_token, bo qua buoc chay Cloudflare Tunnel."
fi

wait $NODE_PID
