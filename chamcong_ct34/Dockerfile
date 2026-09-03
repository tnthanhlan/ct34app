ARG BUILD_FROM=ghcr.io/home-assistant/amd64-base:latest
FROM $BUILD_FROM
ARG BUILD_ARCH=amd64

# Cai Node.js + jq (doc file config) + curl (tai cloudflared) + unzip (giai nen rclone)
RUN apk add --no-cache nodejs npm jq curl unzip

# Tai san cloudflared rieng cho CT34 - hoan toan doc lap voi add-on Cloudflared cua Home Assistant
RUN CF_ARCH="amd64" \
  && if [ "$BUILD_ARCH" = "aarch64" ]; then CF_ARCH="arm64"; fi \
  && if [ "$BUILD_ARCH" = "armv7" ] || [ "$BUILD_ARCH" = "armhf" ]; then CF_ARCH="arm"; fi \
  && curl -fsSL -o /usr/local/bin/cloudflared \
     "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-${CF_ARCH}" \
  && chmod +x /usr/local/bin/cloudflared

# Tai rclone - dung de tu dong day file xuat len OneDrive (thu muc Shared) ngay khi co ban xuat moi
RUN RC_ARCH="amd64" \
  && if [ "$BUILD_ARCH" = "aarch64" ]; then RC_ARCH="arm64"; fi \
  && if [ "$BUILD_ARCH" = "armv7" ]; then RC_ARCH="arm-v7"; fi \
  && if [ "$BUILD_ARCH" = "armhf" ]; then RC_ARCH="arm"; fi \
  && if [ "$BUILD_ARCH" = "i386" ]; then RC_ARCH="386"; fi \
  && curl -fsSL -o /tmp/rclone.zip "https://downloads.rclone.org/rclone-current-linux-${RC_ARCH}.zip" \
  && unzip -q /tmp/rclone.zip -d /tmp/rclone-extract \
  && mv /tmp/rclone-extract/rclone-*/rclone /usr/local/bin/rclone \
  && chmod +x /usr/local/bin/rclone \
  && rm -rf /tmp/rclone.zip /tmp/rclone-extract

WORKDIR /app

COPY server/package.json ./server/package.json
RUN cd server && npm install --omit=dev --no-audit --no-fund

COPY server/ ./server/
COPY public/ ./public/
COPY run.sh /run.sh
RUN chmod +x /run.sh

ENV DATA_DIR=/data
ENV NODE_ENV=production

CMD ["/run.sh"]
