# Chấm công & lương — CT34 (bản server thật)

Bản này khác hẳn file HTML cũ: có **server thật** chạy trên Mini PC của bạn (cùng máy đang chạy Home Assistant OS), có **đăng nhập bằng mật khẩu thật** (không phải chỉ gõ email), dữ liệu lưu **chung trên server** nên mở từ điện thoại, laptop, máy tính nào cũng thấy y hệt nhau — và server tự động xuất file CSV vào lúc 00:05 ngày 1 hằng tháng, hoàn toàn không cần bấm nút gì.

## Có gì mới ở bản 1.2.0
- Bảng Công: bỏ hết màu nền các ô ngày cho đỡ rối mắt, chỉ còn chữ đen/xám đơn giản.
- Common: thu gọn các cột dữ liệu ngắn, mở rộng các cột có dropdown, thêm cột "Tổng lương + PC".
- Tab mới **"Tổng hợp năm"**: theo dõi số công phép (F) từng tháng + luỹ kế cả năm, và bật/tắt phụ cấp M3/5% riêng theo từng tháng (khác mặc định ở Common nếu tháng đó có thay đổi).
- Ăn ca: thu gọn cột, thêm cột **Ghi chú**, các cột số cho phép sửa tay đè lên số tự tính.
- Cài được như **app trên điện thoại** (PWA) — xem mục "Cài lên điện thoại" bên dưới.

---

## Cách 1 (khuyên dùng): Cài làm Local Add-on trong Home Assistant

Vì bạn đang chạy Home Assistant OS trên Mini PC, đây là cách "đúng bài" nhất — Supervisor tự lo việc chạy nền, tự khởi động lại khi mất điện, không cần bạn quản lý Docker thủ công.

### Bước 1 — Copy thư mục này vào đúng chỗ
Bạn cần thấy được thư mục `/addons` trên Mini PC. Cách dễ nhất: cài add-on **"Samba share"** (nếu chưa có) từ Add-on Store, bật lên, rồi từ Windows/máy tính bạn mở:
```
\\<địa-chỉ-IP-mini-pc>\addons
```
Tạo một thư mục con tên `chamcong_ct34`, rồi chép **toàn bộ nội dung** của gói này (file `config.yaml`, `build.yaml`, `Dockerfile`, và 2 thư mục `server/`, `public/`) vào trong đó. **Không cần** chép `docker-compose.yml` và `.env.example` (2 file đó chỉ dùng cho Cách 2).

### Bước 2 — Cài đặt add-on
1. Home Assistant → **Cài đặt (Settings) → Add-ons → Add-on Store**.
2. Bấm dấu **⋮** (góc trên phải) → **Check for updates** (hoặc **Reload**) để Supervisor quét thấy add-on local mới.
3. Kéo xuống mục **"Local add-ons"**, bạn sẽ thấy **"Chấm công & lương - CT34"** → bấm vào → **Install**.

### Bước 3 — Cấu hình mật khẩu (chỉ làm 1 lần)
Vào tab **Configuration** của add-on, điền:
- `jwt_secret`: một chuỗi dài ngẫu nhiên bất kỳ (vd gõ bừa 40-50 ký tự linh tinh, càng random càng tốt) — đây là "chìa khoá" ký phiên đăng nhập, giữ bí mật.
- `admin_password`: mật khẩu thật cho tài khoản Admin (`tnthanhlan@gmail.com`).
- `user_password`: mật khẩu thật cho tài khoản User (`doisuachuact34@gmail.com`).
- `export_dir`: để mặc định `/share/chamcong_exports` là được (xem giải thích ở mục "Lấy file CSV hằng tháng ở đâu" bên dưới).

Bấm **Save**.

### Bước 4 — Khởi động
Qua tab **Info** → bấm **Start**. Xem tab **Log** thấy dòng `✓ Đã tự tạo 2 tài khoản...` là thành công. (Nếu đổi mật khẩu sau này: xoá 2 dòng user trong `data/db.json` qua Samba rồi khởi động lại add-on, hoặc dùng tính năng đổi mật khẩu nếu bạn nhờ mình bổ sung thêm sau).

### Bước 5 — Tạo Cloudflare Tunnel RIÊNG cho CT34 (an toàn, không đụng gì tới Home Assistant)

⚠️ **Quan trọng:** KHÔNG dùng chung tunnel/add-on Cloudflared đang chạy cho Home Assistant. CT34 giờ tự mang theo Cloudflare Tunnel riêng, chạy ngay bên trong container của chính nó — nếu tunnel này có lỗi gì, chỉ CT34 bị ảnh hưởng, Home Assistant không bao giờ bị đụng tới.

**5.1 — Tạo tunnel mới trên Cloudflare (làm trên trang web, không phải trong Home Assistant):**
1. Vào **dash.cloudflare.com** (Zero Trust dashboard) → **Networks → Tunnels**.
2. Bấm **Create a tunnel**.
3. Chọn loại **Cloudflared** → đặt tên bất kỳ, ví dụ `ct34`.
4. Ở bước "Install and run a connector", Cloudflare sẽ hiện ra dòng lệnh dạng:
   ```
   cloudflared tunnel run --token eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.................
   ```
   Bạn **chỉ cần copy đúng đoạn token** (chuỗi dài sau chữ `--token`), không cần chạy lệnh này ở đâu cả — CT34 sẽ tự chạy nó.
5. Bấm **Next**, tới bước **Public Hostname** → thêm:
   - Subdomain: `chamcong`
   - Domain: `tnthanhlan.trade`
   - Service Type: **HTTP**
   - URL: `localhost:8099`
6. **Save tunnel**.

**5.2 — Dán token vào cấu hình CT34 (làm trong Home Assistant):**
1. Vào add-on **"Chấm công & lương - CT34"** → tab **Configuration**.
2. Tìm ô mới **`cloudflare_tunnel_token`** → dán đúng token đã copy ở bước 5.1.
3. **Save**.
4. Qua tab **Info** → **Restart** add-on.
5. Qua tab **Log**, phải thấy dòng:
   ```
   [CT34] Dang khoi dong Cloudflare Tunnel rieng cho CT34 (doc lap voi Home Assistant)...
   [CT34] Cloudflare Tunnel rieng dang chay (PID ...)
   Chấm công server đang chạy ở cổng 8099
   ```

**5.3 — Thử:**
Mở `https://chamcong.tnthanhlan.trade` (tốt nhất bật 4G) — phải vào được màn hình đăng nhập CT34.

Nếu sau này tunnel này có lỗi gì (chamcong.tnthanhlan.trade không vào được), **Home Assistant và `homeassistant.tnthanhlan.trade` hoàn toàn không bị ảnh hưởng** — vì đây là 2 tunnel, 2 container, 2 add-on hoàn toàn tách biệt.

---

## Cách 2 (thay thế): Chạy bằng Docker Compose thường

Dùng khi bạn chạy trên 1 máy Linux có Docker thường (không phải HAOS), hoặc muốn thử trên máy tính cá nhân trước.

```bash
cp .env.example .env
# mo file .env len, dien JWT_SECRET / SEED_ADMIN_PASSWORD / SEED_USER_PASSWORD that vao
docker compose up -d --build
```
Sau đó tự trỏ Cloudflare Tunnel (hoặc Nginx/Caddy reverse proxy) vào cổng `8099` của máy này, tương tự Bước 5 ở Cách 1.

---

## Lấy file CSV hằng tháng ở đâu?

Add-on tự ghi file `ChamCong_2026_07.csv` vào thư mục `/share/chamcong_exports` bên trong Home Assistant — thư mục `/share` chính là thư mục bạn đã quen thấy qua add-on Samba (`\\<ip>\share\chamcong_exports\`). Cứ mở thư mục đó từ Windows Explorer là thấy file mới nhất, kéo thả vào OneDrive/thư mục bạn muốn là xong.

Lưu ý nhỏ: Home Assistant OS là Linux, bản thân nó không tự chạy được OneDrive client của Windows. Nếu bạn muốn file tự nhảy thẳng vào OneDrive mà không cần bạn kéo thả, cách đơn giản nhất là: trên máy Windows nào đó đang chạy sẵn OneDrive, thiết lập đồng bộ thư mục Samba `\\<ip>\share\chamcong_exports` vào một thư mục local rồi để OneDrive tự đồng bộ thư mục local đó (Windows không đồng bộ trực tiếp thư mục mạng SMB vào OneDrive được) — hoặc nói mình biết, mình viết thêm 1 script nhỏ (robocopy + Task Scheduler) chạy trên máy Windows đó để tự copy mỗi ngày.

Server cũng tự ghi đè lại file CSV của **tháng hiện tại** mỗi ngày lúc 23:50, nên file luôn cập nhật gần nhất, không cần đợi tới cuối tháng.

---

## Đăng nhập lần đầu

- Admin: `tnthanhlan@gmail.com` + mật khẩu bạn đã đặt ở `admin_password`.
- User: `doisuachuact34@gmail.com` + mật khẩu bạn đã đặt ở `user_password`.

Admin sửa được mọi thứ (Common, Bảng Công, tài khoản...). User chỉ thao tác được: chọn tháng/năm, bấm "Sinh lịch", chấm F/đổi ca trong tab Chấm công — mọi thao tác khác bị **server** chặn (trả lỗi 403), không chỉ ẩn trên giao diện, nên đây là bảo mật thật chứ không phải chỉ che trên màn hình.

---

## Cấu trúc thư mục

```
├── config.yaml        # khai bao add-on cho Home Assistant Supervisor
├── build.yaml          # anh nen Docker theo tung kien truc CPU
├── Dockerfile
├── run.sh               # tu khoi dong Cloudflare Tunnel rieng (neu co token) + chay server
├── docker-compose.yml  # phuong an chay ngoai HA (Cach 2)
├── .env.example
├── server/
│   ├── server.js        # Express app: API, xac thuc, cron tu dong xuat file
│   ├── auth.js           # hash mat khau (bcrypt), phien dang nhap (JWT + cookie)
│   ├── db.js              # kho du lieu dang file JSON (data/db.json)
│   ├── seed.js            # script tao tai khoan thu cong (khi khong dung HA add-on options)
│   └── package.json
├── public/
│   ├── index.html         # giao dien
│   ├── styles.css
│   └── app.js               # toan bo logic frontend, goi API thay vi localStorage
├── data/                    # noi luu db.json (persistent, KHONG xoa khi cap nhat add-on)
└── exports/                  # noi luu CSV khi chay Cach 2 (Cach 1 dung /share/chamcong_exports)
```

## Sao lưu dữ liệu

Toàn bộ dữ liệu nằm trong 1 file duy nhất: `data/db.json`. Thỉnh thoảng chép file này ra chỗ khác (qua Samba) là đủ để backup toàn bộ hệ thống.

---

## Cài lên điện thoại như 1 app (PWA)

Từ bản 1.2.0, trang web này có thể "cài" thẳng vào màn hình chính điện thoại, có icon riêng, mở fullscreen như app thật — không cần lên App Store/CH Play.

**Trên Android (Chrome):**
1. Mở `https://chamcong.tnthanhlan.trade` trên Chrome.
2. Bấm menu **⋮** (góc trên phải) → **"Add to Home screen"** (hoặc Chrome có thể tự hiện banner gợi ý cài đặt).
3. Xác nhận → icon CT34 xuất hiện ngay trên màn hình chính.

**Trên iPhone (Safari):**
1. Mở `https://chamcong.tnthanhlan.trade` trên Safari (bắt buộc dùng Safari, Chrome trên iOS không hỗ trợ mục này).
2. Bấm nút **Share** (hình vuông có mũi tên) ở thanh dưới.
3. Chọn **"Add to Home Screen"**.
4. Xác nhận → icon CT34 xuất hiện trên màn hình chính.

Sau khi cài, mở app từ icon sẽ không còn thanh địa chỉ trình duyệt, trông giống hệt app thật. Vẫn cần đăng nhập lại nếu phiên hết hạn, dữ liệu vẫn nằm hoàn toàn trên server như bản web thường — chỉ là cách mở nhanh hơn thôi.
