#!/bin/sh
# Script khoi dong cho add-on CT34.
# Neu co cau hinh cloudflare_tunnel_token, tu khoi dong 1 tien trinh Cloudflare Tunnel
# RIENG BIET hoan toan voi add-on Cloudflared chinh cua Home Assistant - chay ngay trong
# container nay, khong dung chung file cau hinh, khong dung chung tunnel nao ca.
# Neu tunnel nay co loi gi, chi CT34 bi anh huong, khong dam gi toi Home Assistant.
set -e

OPTIONS_FILE=/data/options.json
TOKEN=""

if [ -f "$OPTIONS_FILE" ]; then
  TOKEN=$(jq -r '.cloudflare_tunnel_token // empty' "$OPTIONS_FILE" 2>/dev/null || echo "")
fi

if [ -n "$TOKEN" ]; then
  echo "[CT34] Dang khoi dong Cloudflare Tunnel rieng cho CT34 (doc lap voi Home Assistant)..."
  cloudflared tunnel --no-autoupdate run --token "$TOKEN" &
  CF_PID=$!
  echo "[CT34] Cloudflare Tunnel rieng dang chay (PID $CF_PID)."
else
  echo "[CT34] Chua cau hinh 'cloudflare_tunnel_token' - bo qua buoc tunnel, chi chay server noi bo tren cong 8099."
fi

exec node server/server.js
