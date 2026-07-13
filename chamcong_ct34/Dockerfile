ARG BUILD_FROM=ghcr.io/home-assistant/amd64-base:latest
FROM $BUILD_FROM
ARG BUILD_ARCH=amd64

# Cai Node.js + jq (doc file config) + curl (tai cloudflared)
RUN apk add --no-cache nodejs npm jq curl

# Tai san cloudflared rieng cho CT34 - hoan toan doc lap voi add-on Cloudflared cua Home Assistant
RUN CF_ARCH="amd64" \
  && if [ "$BUILD_ARCH" = "aarch64" ]; then CF_ARCH="arm64"; fi \
  && if [ "$BUILD_ARCH" = "armv7" ] || [ "$BUILD_ARCH" = "armhf" ]; then CF_ARCH="arm"; fi \
  && curl -fsSL -o /usr/local/bin/cloudflared \
     "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-${CF_ARCH}" \
  && chmod +x /usr/local/bin/cloudflared

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
