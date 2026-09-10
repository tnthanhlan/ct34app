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
    curl -fSL --connect-timeout 15 --max-time 120 --retry 3 --retry-delay 5 --retry-connrefused \
      -o /usr/local/bin/cloudflared \
      "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-${CF_ARCH}"; \
    chmod +x /usr/local/bin/cloudflared

# Cài rclone - dùng để tự động đẩy file Excel vừa xuất lên OneDrive, giống hệt cách add-on
# Chấm công đang làm (xem src/onedrive.js). Thử downloads.rclone.org trước (có sẵn "current" alias,
# đỡ phải dò version); nếu mạng của máy build không tới được host đó (bị chặn/lỗi DNS/timeout) thì
# tự chuyển sang tải qua GitHub releases (cùng nhà với cloudflared ở trên, đã xác nhận tải được ổn định),
# thay vì để lệnh curl treo mãi không có giới hạn thời gian như trước - đó là nguyên nhân gây "kẹt ở 0%".
RUN set -eux; \
    case "${BUILD_ARCH}" in \
      amd64)   RC_ARCH="amd64" ;; \
      aarch64) RC_ARCH="arm64" ;; \
      armv7)   RC_ARCH="arm-v7" ;; \
      armhf)   RC_ARCH="arm" ;; \
      i386)    RC_ARCH="386" ;; \
      *)       RC_ARCH="amd64" ;; \
    esac; \
    if curl -fSL --connect-timeout 15 --max-time 90 --retry 2 --retry-delay 5 --retry-connrefused \
         -o /tmp/rclone.zip "https://downloads.rclone.org/rclone-current-linux-${RC_ARCH}.zip"; then \
      echo "Da tai rclone tu downloads.rclone.org"; \
    else \
      echo "Khong tai duoc tu downloads.rclone.org, chuyen sang GitHub releases..."; \
      RCLONE_TAG=$(curl -fsSL --connect-timeout 15 --max-time 30 --retry 2 --retry-delay 5 \
        https://api.github.com/repos/rclone/rclone/releases/latest | jq -r '.tag_name'); \
      curl -fSL --connect-timeout 15 --max-time 90 --retry 2 --retry-delay 5 --retry-connrefused \
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

EXPOSE 8100

CMD [ "/run.sh" ]
