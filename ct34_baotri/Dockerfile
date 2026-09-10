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
    curl -fSL -C - --connect-timeout 15 --speed-limit 1000 --speed-time 60 \
      --retry 30 --retry-delay 5 --retry-connrefused \
      -o /usr/local/bin/cloudflared \
      "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-${CF_ARCH}"; \
    chmod +x /usr/local/bin/cloudflared

# Cài rclone - dùng để tự động đẩy file Excel vừa xuất lên OneDrive, giống hệt cách add-on
# Chấm công đang làm (xem src/onedrive.js). Thử downloads.rclone.org trước (có sẵn "current" alias,
# đỡ phải dò version); nếu mạng của máy build không tới được host đó thì tự chuyển sang GitHub releases.
#
# Ghi chú quan trọng (rút kinh nghiệm từ bản 7.8.1): mạng tải về của máy build có lúc rất chậm
# (~30-50 KB/s) nhưng VẪN đang chạy, không phải bị treo hẳn. Dùng --max-time cứng (bản 7.8.1) sẽ
# cắt ngang những lượt tải chậm-nhưng-vẫn-chạy này giữa chừng, và mỗi lần curl --retry lại tải lại
# từ đầu (không tiếp tục dở dang) nên không bao giờ tải xong nổi trong vài lần thử - đây chính là
# nguyên nhân 7.8.1 build lỗi hẳn (exit code 28), không phải do add-on "kẹt ở 0%" một cách vô hại.
# Cách đúng: dùng -C - để mỗi lần thử lại sẽ tải tiếp từ chỗ dở dang (không mất công đã tải), và
# dùng --speed-limit/--speed-time để chỉ hủy khi thực sự đứng hình (0 tốc độ liên tục 60 giây),
# thay vì hủy chỉ vì tổng thời gian tải hơi lâu.
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

EXPOSE 8100

CMD [ "/run.sh" ]
