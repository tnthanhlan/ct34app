const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');

/* ---------------- Tự động đẩy file xuất lên OneDrive (dùng rclone) ----------------
   Y hệt cơ chế đã dùng cho add-on Chấm công CT34: ngay sau khi xuất xong file Excel
   (dù là lịch tự động hằng tuần hay bấm "Xuất Excel ngay"), server tự đẩy thẳng file đó
   lên thư mục OneDrive đã cấu hình, qua Internet, không cần máy tính nào bật hay cùng
   mạng LAN với Home Assistant.

   Cách lấy ONEDRIVE_TOKEN (làm 1 lần duy nhất, trên máy có trình duyệt - ví dụ máy Windows):
   1. Cài rclone trên máy đó: https://rclone.org/downloads/
   2. Mở PowerShell/CMD, chạy: rclone authorize "onedrive"
   3. Trình duyệt sẽ mở ra, đăng nhập đúng tài khoản Microsoft đang chứa thư mục cần đẩy lên.
   4. Sau khi đăng nhập xong, terminal sẽ in ra 1 đoạn JSON (bắt đầu bằng {"access_token":...).
      Copy NGUYÊN VĂN đoạn JSON đó (cả dấu { và cuối }), dán vào ô "onedrive_token" trong tab
      Configuration của add-on này.
   5. Điền "onedrive_remote_path" = đường dẫn (tính từ gốc OneDrive) tới đúng thư mục cần lưu.
      Kiểm tra trước bằng: rclone lsd onedrive: (rồi lsd tiếp vào từng cấp) để biết chính xác tên.
   Nếu bạn đã cấu hình OneDrive cho app Chấm công rồi, dùng lại đúng onedrive_token / onedrive_drive_id
   / onedrive_drive_type đó — chỉ cần đổi onedrive_remote_path sang thư mục riêng cho Bảo trì. */

const ONEDRIVE_ENABLED = process.env.ONEDRIVE_BACKUP_ENABLED === 'true';
const ONEDRIVE_REMOTE_PATH = process.env.ONEDRIVE_REMOTE_PATH || '';
const RCLONE_CONF_DIR = '/data/rclone';
const RCLONE_CONF_PATH = path.join(RCLONE_CONF_DIR, 'rclone.conf');
const ONEDRIVE_LOG = []; // vài dòng log gần nhất, hiện trong tab Dữ liệu để dễ kiểm tra không cần SSH

function onedriveLog(msg) {
  const line = `${new Date().toLocaleString('vi-VN')} - ${msg}`;
  console.log('[onedrive]', msg);
  ONEDRIVE_LOG.unshift(line);
  if (ONEDRIVE_LOG.length > 30) ONEDRIVE_LOG.length = 30;
}

function setupRcloneConfig() {
  if (!ONEDRIVE_ENABLED) return false;
  const token = process.env.ONEDRIVE_TOKEN;
  if (!token) {
    onedriveLog('Đã bật "onedrive_backup_enabled" nhưng chưa dán "onedrive_token" trong Configuration — bỏ qua đồng bộ OneDrive.');
    return false;
  }
  if (!ONEDRIVE_REMOTE_PATH) {
    onedriveLog('Đã bật OneDrive nhưng chưa điền "onedrive_remote_path" — bỏ qua đồng bộ OneDrive.');
    return false;
  }
  const driveId = process.env.ONEDRIVE_DRIVE_ID;
  if (!driveId) {
    onedriveLog('Đã bật OneDrive nhưng chưa điền "onedrive_drive_id" (rclone bản mới bắt buộc phải có) — bỏ qua đồng bộ OneDrive.');
    return false;
  }
  const driveType = process.env.ONEDRIVE_DRIVE_TYPE || 'personal';
  try {
    if (!fs.existsSync(RCLONE_CONF_DIR)) fs.mkdirSync(RCLONE_CONF_DIR, { recursive: true });
    const confContent = `[onedrive]\ntype = onedrive\ntoken = ${token}\ndrive_id = ${driveId}\ndrive_type = ${driveType}\n`;
    fs.writeFileSync(RCLONE_CONF_PATH, confContent, { encoding: 'utf8', mode: 0o600 });
    onedriveLog('Đã sẵn sàng đồng bộ OneDrive (rclone.conf đã tạo).');
    return true;
  } catch (e) {
    onedriveLog('Không ghi được rclone.conf: ' + e.message);
    return false;
  }
}

const onedriveReady = setupRcloneConfig();

function syncFileToOnedrive(localFilePath) {
  if (!onedriveReady) return;
  if (!fs.existsSync(localFilePath)) return;
  const args = ['--config', RCLONE_CONF_PATH, 'copy', localFilePath, `onedrive:${ONEDRIVE_REMOTE_PATH}`, '--onedrive-no-versions'];
  execFile('rclone', args, { timeout: 120000 }, (err, stdout, stderr) => {
    if (err) {
      // Lay toan bo noi dung loi that su (khong chi dong dau - dong dau chi la dong lenh da chay,
      // khong phai ly do loi), cat bot cho gon neu qua dai.
      const raw = (stderr && stderr.toString().trim()) || err.message || String(err);
      const detail = raw.replace(/\s+/g, ' ').trim().slice(0, 400);
      onedriveLog(`LỖI khi đồng bộ "${path.basename(localFilePath)}": ${detail}`);
    } else {
      onedriveLog(`Đã đồng bộ "${path.basename(localFilePath)}" lên OneDrive (${ONEDRIVE_REMOTE_PATH}).`);
    }
  });
}

function getOnedriveStatus() {
  return {
    enabled: ONEDRIVE_ENABLED,
    ready: onedriveReady,
    remotePath: ONEDRIVE_REMOTE_PATH,
    log: ONEDRIVE_LOG,
  };
}

module.exports = { syncFileToOnedrive, getOnedriveStatus };
