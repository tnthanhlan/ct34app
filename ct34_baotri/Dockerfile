ARG BUILD_FROM=node:20-alpine
FROM $BUILD_FROM

ARG BUILD_ARCH=amd64

RUN apk add --no-cache jq tzdata curl unzip python3 make g++

# Cài cloudflared để tự chạy Cloudflare Tunnel ngay trong container này,
# giống hệt cách add-on Chấm công đang làm (không cần mở cổng ra ngoài).
RUN set -eux; \
    case "${BUILD_ARCH}" in \
      amd64)   CF_ARCH="amd64" ;; \
      aarch64) CF_ARCH="arm64" ;; \
      armv7)   CF_ARCH="arm" ;; \
      armhf)   CF_ARCH="arm" ;; \
      i386)    CF_ARCH="386" ;; \
      *)       CF_ARCH="amd64" ;; \
    esac; \
    curl -fsSL -o /usr/local/bin/cloudflared \
      "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-${CF_ARCH}"; \
    chmod +x /usr/local/bin/cloudflared

# Cài rclone - dùng để tự động đẩy file Excel vừa xuất lên OneDrive, giống hệt cách add-on
# Chấm công đang làm (xem src/onedrive.js).
RUN set -eux; \
    case "${BUILD_ARCH}" in \
      amd64)   RC_ARCH="amd64" ;; \
      aarch64) RC_ARCH="arm64" ;; \
      armv7)   RC_ARCH="arm-v7" ;; \
      armhf)   RC_ARCH="arm" ;; \
      i386)    RC_ARCH="386" ;; \
      *)       RC_ARCH="amd64" ;; \
    esac; \
    curl -fsSL -o /tmp/rclone.zip "https://downloads.rclone.org/rclone-current-linux-${RC_ARCH}.zip"; \
    unzip -q /tmp/rclone.zip -d /tmp/rclone-extract; \
    mv /tmp/rclone-extract/rclone-*/rclone /usr/local/bin/rclone; \
    chmod +x /usr/local/bin/rclone; \
    rm -rf /tmp/rclone.zip /tmp/rclone-extract

WORKDIR /app
COPY app/package*.json ./
RUN npm install --omit=dev

COPY app/ ./
COPY run.sh /run.sh
RUN chmod +x /run.sh

EXPOSE 8100

CMD [ "/run.sh" ]
