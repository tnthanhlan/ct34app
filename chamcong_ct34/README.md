# Chấm công & lương — CT34 (bản server thật)

Bản này khác hẳn file HTML cũ: có **server thật** chạy trên Mini PC của bạn (cùng máy đang chạy Home Assistant OS), có **đăng nhập bằng mật khẩu thật** (không phải chỉ gõ email), dữ liệu lưu **chung trên server** nên mở từ điện thoại, laptop, máy tính nào cũng thấy y hệt nhau — và server tự động xuất file CSV vào lúc 00:05 ngày 1 hằng tháng, hoàn toàn không cần bấm nút gì.

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

### Bước 5 — Trỏ Cloudflare Tunnel vào add-on này
Bạn đã có Cloudflare Tunnel chạy cho Home Assistant rồi, giờ thêm 1 **Public Hostname** mới trỏ vào add-on:
1. Vào **Cloudflare Zero Trust dashboard → Networks → Tunnels** → chọn tunnel bạn đang dùng.
2. **Public Hostname** → **Add a public hostname**.
3. Subdomain: ví dụ `chamcong` (ra `chamcong.tnthanhlan.trade`).
4. Service: **Type = HTTP**, **URL = `localhost:8099`** (hoặc địa chỉ IP nội bộ Mini PC + cổng 8099 nếu tunnel không chạy cùng máy).
5. Save.

Xong — mở `https://chamcong.tnthanhlan.trade` từ điện thoại, laptop, ở đâu cũng vào được, có ổ khoá HTTPS thật do Cloudflare cấp.

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
