# Bảo trì & Vệ sinh - CT34

Add-on Home Assistant để quản lý thông số ~400 động cơ và theo dõi lịch vệ sinh - bảo dưỡng - bảo trì.
Tự động xuất file Excel (.xlsx) vào **23h50 mỗi Chủ nhật** vào thư mục chia sẻ `/share/baotri_exports`.

## 1. Thêm vào Home Assistant

Add-on này nằm trong cùng repo `ct34app` với add-on Chấm công, nên nếu bạn đã thêm repo đó rồi thì
**không cần làm lại bước thêm Repository** — chỉ cần:

1. Home Assistant → **Settings → Apps → App Store**.
2. Bấm nút **⟳ (làm mới / reload)** ở góc trên bên phải, hoặc đóng mở lại App Store.
3. Kéo xuống mục **"CT34 Apps"**, giờ sẽ thấy thêm app **"Bảo trì & Vệ sinh - CT34"** → **Install**.

Nếu bạn dùng repo mới / máy khác chưa có repo `ct34app`:
1. Settings → Apps → App Store → bấm **⋮** (góc trên phải) → **Repositories**.
2. Dán: `https://github.com/tnthanhlan/ct34app` → **Add**.
3. Làm theo bước 2-3 ở trên.

## 2. Cấu hình trước khi khởi động

Vào tab **Configuration** của add-on, điền:

| Trường | Ý nghĩa |
|---|---|
| `admin_email` | Email admin — mặc định `tnthanhlan@gmail.com` |
| `admin_password` | Mật khẩu admin — **đổi ngay** trước khi Start lần đầu |
| `user_email` | Email nhân viên nhập liệu — mặc định `doisuachuact34@gmail.com` |
| `user_password` | Mật khẩu nhân viên — **đổi ngay** |
| `session_secret` | Chuỗi bí mật bất kỳ, càng dài càng random càng tốt |
| `timezone` | Giữ nguyên `Asia/Ho_Chi_Minh` |

⚠️ Đổi 2 mật khẩu mặc định trước khi bấm **Start** — nếu đổi sau khi đã chạy, tài khoản sẽ tự cập nhật
mật khẩu mới ở lần khởi động lại kế tiếp (không cần xóa dữ liệu cũ).

Sau khi Start, vào tab **Info** → bật **Show in sidebar** để có icon truy cập nhanh trong Home Assistant.

## 3. Truy cập qua domain ngoài (baotrict34.tnthanhlan.trade)

App này **tự chạy sẵn 1 Cloudflare Tunnel bên trong chính nó** — y hệt cách add-on Chấm công đang làm — nên bạn **không cần** vào Cloudflare Dashboard để trỏ Public Hostname vào IP/port nội bộ nữa, và cũng không cần đụng gì tới router hay firewall cả.

**Bước 1 — Tạo 1 Tunnel riêng cho app Bảo trì:**
1. Vào **one.dash.cloudflare.com** (Zero Trust) → **Networks → Tunnels → Create a tunnel**.
2. Chọn **Cloudflared** → đặt tên, ví dụ `baotri-ct34` → **Save tunnel**.
3. Ở bước "Install and run a connector", đừng làm theo hướng dẫn cài lên máy — bạn chỉ cần **copy đoạn Token** (chuỗi dài sau `--token`, hoặc dùng nút copy token riêng nếu có) → giữ lại, dùng ở bước 3 dưới đây.
4. Bấm **Next**, ở phần **Public Hostname**, điền:
   - Subdomain: `baotrict34`
   - Domain: `tnthanhlan.trade`
   - Service Type: HTTP
   - URL: `localhost:8100`
5. Bấm **Save tunnel**.

**Bước 2 — Dán token vào add-on:**
1. Trong Home Assistant, vào add-on **Bảo trì & Vệ sinh - CT34** → tab **Configuration**.
2. Dán chuỗi Token vừa copy vào trường **`cloudflare_tunnel_token`**.
3. **Save** → **Restart** add-on.

**Bước 3 — Kiểm tra:**
- Vào tab **Log**, sẽ thấy dòng `Khoi dong Cloudflare Tunnel...` và log của cloudflared báo kết nối thành công.
- Mở `https://baotrict34.tnthanhlan.trade` — giờ sẽ vào được thẳng màn hình đăng nhập, không còn Bad Gateway nữa.

Cổng 8100 trong `ports` giờ chỉ là tùy chọn phụ, dùng khi bạn muốn truy cập qua IP nội bộ trong mạng nhà (`http://<IP-máy-HA>:8100`) — không bắt buộc phải mở gì thêm cho việc truy cập từ bên ngoài.

## 4. Tự thêm/sửa/xóa cột thông tin động cơ (không cần code)

Vào tab **Dữ liệu → ⚙ Quản lý trường dữ liệu**, bạn có thể:
- Thêm cột mới (vd sau này muốn theo dõi "Ngày bảo trì gần nhất" cho từng động cơ).
- Đổi tên, xóa, hoặc sắp xếp lại thứ tự cột.
- Đánh dấu ★ 1 cột dùng làm "tên hiển thị" trong danh sách/lịch bảo trì.

Khi nhập Excel, nếu file có cột nào chưa có trường tương ứng, màn hình chọn cột sẽ cho bấm
**"+ Tạo trường mới từ cột này"** để tạo ngay tại chỗ, không cần quay lại đây trước.

## 5. Nhập dữ liệu (động cơ + lịch sử bảo trì)

App tự nhận diện được cả file có **tiêu đề nhiều tầng và ô gộp thật** (kiểu file kỹ thuật thật, ví dụ
nhóm cột "ĐỘNG CƠ" gộp chung rồi mới tách Type/P/U/I/n/Cosφ...), và file có **nhiều sheet** — không cần
bạn phải sửa lại file gốc hay tách riêng từng sheet ra.

**Nhập danh sách động cơ:**
1. Vào tab **Dữ liệu** (chỉ admin thấy) → chọn file `.xlsx` → chọn **"Danh sách động cơ"**.
2. Bấm **Tải lên & xem trước**. Nếu file có nhiều sheet, chọn đúng sheet ở ô đầu tiên.
3. Chọn cột Excel tương ứng với từng trường bên trái (Mã thiết bị, Tên gọi, Hãng...). Cột nào file
   chưa có trường tương ứng, bấm nút "+ Tên cột" để tạo trường mới ngay tại chỗ.
4. Bấm **Nhập dữ liệu**.

**Nhập lịch sử bảo trì — có 2 kiểu file:**
- **Bảng thường**: mỗi dòng là 1 lần ghi nhận (có cột Mã thiết bị, Ngày, Hạng mục, Người làm...) → chọn
  **"Lịch sử bảo trì - dạng bảng thường"**.
- **Nhiều hạng mục theo cột** (kiểu file "Đợt kiểm tra", mỗi hạng mục có 2 cột riêng "Ngày làm"/"Người
  làm" nằm cạnh nhau) → chọn **"Lịch sử bảo trì - dạng nhiều hạng mục theo cột"**. App tự dò ra từng
  hạng mục, bạn chỉ cần chọn cột mã thiết bị và tích chọn hạng mục nào muốn nhập — mỗi ô có ngày sẽ
  thành 1 dòng lịch sử riêng, ô nào bỏ trống (chưa làm) sẽ tự bỏ qua.

Nhập file động cơ trước, rồi mới nhập lịch sử bảo trì (vì cần khớp theo **Mã thiết bị** đã có sẵn).

## 6. Dùng hằng ngày

- **Tab Tổng quan**: số động cơ, tổng số lần ghi nhận bảo trì, số lần trong 30 ngày qua, số động cơ
  chưa có lịch sử nào, và danh sách hoạt động gần đây.
- **Tab Động cơ**: tìm kiếm, xem/sửa thông số, xem lịch sử bảo trì và ghi nhận công việc mới ngay từ
  trang chi tiết.
- **Tab Bảo trì**: sổ lịch sử tự do — lọc theo hạng mục, tìm theo mã thiết bị/nội dung, bấm **"+"** để
  ghi nhận 1 lần bảo trì mới (chọn động cơ, hạng mục, ngày, người làm, ghi chú). Hạng mục là chữ tự do
  có gợi ý theo những gì đã dùng trước đó, không giới hạn danh sách cố định.
- **Tab Dữ liệu** (admin): quản lý trường dữ liệu động cơ, nhập thêm Excel, xuất Excel ngay, tải file
  đã xuất tuần trước.

> Lưu ý: bản hiện tại tập trung vào **lưu lại lịch sử đã làm gì, khi nào, ai làm** — chưa tính chu kỳ/
> ngày đến hạn tự động (sẽ bổ sung sau khi lịch sử đã đầy đủ và ổn định).

File Excel tự động xuất lúc 23h50 Chủ nhật hàng tuần được lưu ở `/share/baotri_exports/` trên máy chủ
HA — bạn có thể lấy qua add-on **Samba** hoặc **File editor**, giữ tối đa 30 file gần nhất.

## 7. Cài lên màn hình chính điện thoại (không cần app store)

Mở `https://baotrict34.tnthanhlan.trade` bằng trình duyệt điện thoại →

- **Android (Chrome)**: menu ⋮ → "Thêm vào Màn hình chính".
- **iPhone (Safari)**: nút Chia sẻ → "Thêm vào MH chính".

App sẽ hiện như 1 icon riêng, mở toàn màn hình như app thật.
