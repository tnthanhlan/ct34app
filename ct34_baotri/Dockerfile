ARG BUILD_FROM=node:20-alpine
FROM $BUILD_FROM

ARG BUILD_ARCH=amd64

RUN apk add --no-cache jq tzdata curl python3 make g++

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

WORKDIR /app
COPY app/package*.json ./
RUN npm install --omit=dev

COPY app/ ./
COPY run.sh /run.sh
RUN chmod +x /run.sh

EXPOSE 8100

CMD [ "/run.sh" ]
