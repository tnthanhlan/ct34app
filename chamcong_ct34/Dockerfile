ARG BUILD_FROM=ghcr.io/home-assistant/amd64-base:latest
FROM $BUILD_FROM

# Cai Node.js (Alpine-based HA base image dung apk)
RUN apk add --no-cache nodejs npm

WORKDIR /app

COPY server/package.json ./server/package.json
RUN cd server && npm install --omit=dev --no-audit --no-fund

COPY server/ ./server/
COPY public/ ./public/

ENV DATA_DIR=/data
ENV NODE_ENV=production

CMD ["node", "server/server.js"]
