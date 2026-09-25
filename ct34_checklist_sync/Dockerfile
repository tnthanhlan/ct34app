ARG BUILD_FROM=node:20-alpine
FROM $BUILD_FROM

ARG BUILD_ARCH=amd64

RUN apk add --no-cache jq tzdata curl unzip

# Cài rclone - y hệt cách add-on Bảo trì/Chấm công đang làm (xem app/src/onedrive.js, copy nguyên
# văn từ add-on Bảo trì). Add-on này dùng RCLONE_CONF riêng ở /data/rclone/rclone.conf (mỗi add-on
# có /data riêng biệt, không đụng tới config của 2 add-on kia) - nhưng có thể dán CHUNG đúng
# "onedrive_token" đã lấy 1 lần cho add-on Bảo trì/Chấm công vào ô Configuration của add-on này,
# không cần chạy lại "rclone authorize" lần nữa.
RUN set -eux; \
    case "${BUILD_ARCH}" in \
      amd64)   RC_ARCH="amd64" ;; \
      aarch64) RC_ARCH="arm64" ;; \
      armv7)   RC_ARCH="arm-v7" ;; \
      armhf)   RC_ARCH="arm" ;; \
      i386)    RC_ARCH="386" ;; \
      *)       RC_ARCH="amd64" ;; \
    esac; \
    if curl -fSL -C - --connect-timeout 15 --speed-limit 1000 --speed-time 60 \
         --retry 30 --retry-delay 5 --retry-connrefused \
         -o /tmp/rclone.zip "https://downloads.rclone.org/rclone-current-linux-${RC_ARCH}.zip"; then \
      echo "Da tai rclone tu downloads.rclone.org"; \
    else \
      echo "Khong tai duoc tu downloads.rclone.org, chuyen sang GitHub releases..."; \
      RCLONE_TAG=$(curl -fsSL --connect-timeout 15 --max-time 30 --retry 3 --retry-delay 5 \
        https://api.github.com/repos/rclone/rclone/releases/latest | jq -r '.tag_name'); \
      curl -fSL -C - --connect-timeout 15 --speed-limit 1000 --speed-time 60 \
        --retry 30 --retry-delay 5 --retry-connrefused \
        -o /tmp/rclone.zip \
        "https://github.com/rclone/rclone/releases/download/${RCLONE_TAG}/rclone-${RCLONE_TAG}-linux-${RC_ARCH}.zip"; \
    fi; \
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

CMD [ "/run.sh" ]
