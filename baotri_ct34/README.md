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

Add-on chạy ở cổng nội bộ **8099**. Vì CT34 (chấm công) đã dùng Cloudflare Tunnel để đưa ra ngoài internet,
bạn chỉ cần thêm 1 **Public Hostname** mới trong cùng Tunnel đó, cấu hình dạng bên dưới rồi Save:

```
Subdomain: baotrict34
Domain:    tnthanhlan.trade
Path:      (để trống)
Service:   HTTP
URL:       homeassistant.local:8099   (hoặc IP nội bộ của máy HA, ví dụ 192.168.1.x:8099)
```

Vào **Cloudflare Zero Trust dashboard → Networks → Tunnels → (tên tunnel đang dùng cho CT34) →
Public Hostname → Add a public hostname** để thêm mục trên.

Nếu bạn không nhớ tunnel đang trỏ vào IP hay hostname nào, mở mục **Public Hostname** hiện có của
CT34 (chấm công) để xem chính xác giá trị Service/URL đang dùng, rồi copy y hệt phần host, chỉ đổi port
thành `8099`.

## 4. Nhập dữ liệu lần đầu (400 động cơ + lịch bảo trì)

App **không bắt buộc file Excel phải đúng khuôn mẫu có sẵn** — vào tab **Dữ liệu** (chỉ admin thấy):

1. Chọn file `.xlsx`, chọn "Danh sách động cơ" hoặc "Lịch bảo trì".
2. Bấm **Tải lên & xem trước** — hệ thống đọc tên các cột trong file của bạn.
3. Với mỗi trường (Mã động cơ, Tên thiết bị, Vị trí...), chọn cột Excel tương ứng trong file của bạn
   (hệ thống có đoán sẵn, bạn chỉ cần kiểm tra/sửa lại).
4. Bấm **Nhập dữ liệu**.

Nhập file động cơ trước, rồi mới nhập file lịch bảo trì (vì lịch bảo trì cần khớp theo **Mã động cơ**
đã có trong hệ thống).

## 5. Dùng hằng ngày

- **Tab Tổng quan**: số lượng động cơ, việc quá hạn / chờ xử lý / đã xong.
- **Tab Động cơ**: tìm kiếm, xem/sửa thông số, thêm việc bảo trì ngay từ trang chi tiết.
- **Tab Bảo trì**: lọc theo loại (Vệ sinh / Bảo dưỡng / Bảo trì) và trạng thái, bấm vào việc để xem
  lịch sử và **"Đánh dấu đã làm hôm nay"** — hệ thống tự tính ngày đến hạn kế tiếp theo chu kỳ.
- **Tab Dữ liệu** (admin): nhập thêm Excel, xuất Excel ngay, tải file đã xuất tuần trước.

File Excel tự động xuất lúc 23h50 Chủ nhật hàng tuần được lưu ở `/share/baotri_exports/` trên máy chủ
HA — bạn có thể lấy qua add-on **Samba** hoặc **File editor**, giữ tối đa 30 file gần nhất.

## 6. Cài lên màn hình chính điện thoại (không cần app store)

Mở `https://baotrict34.tnthanhlan.trade` bằng trình duyệt điện thoại →

- **Android (Chrome)**: menu ⋮ → "Thêm vào Màn hình chính".
- **iPhone (Safari)**: nút Chia sẻ → "Thêm vào MH chính".

App sẽ hiện như 1 icon riêng, mở toàn màn hình như app thật.
