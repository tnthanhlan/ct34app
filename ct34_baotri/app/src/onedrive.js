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

// File xuất của add-on này luôn có dạng "baotri_ct34_YYYY-MM-DD_HHmm.xlsx" - chỉ dọn những file
// khớp đúng dạng này trên OneDrive, không đụng tới file nào khác người dùng tự để trong cùng thư
// mục (phòng khi thư mục onedrive_remote_path không phải thư mục riêng chỉ để chứa file xuất).
const EXPORT_FILENAME_RE = /^baotri_ct34_\d{4}-\d{2}-\d{2}_\d{4}\.xlsx$/i;

// Sau khi đồng bộ xong 1 file lên OneDrive, xoá hết các file xuất CŨ khác đang có trong cùng thư
// mục, chỉ giữ lại đúng file vừa đồng bộ - vì file này đã gồm toàn bộ lịch sử mọi năm rồi (xem
// exportWeekly.js), không cần giữ nhiều bản cũ chồng nhau làm nặng OneDrive.
function pruneOldRemoteFiles(keepFilename) {
  return new Promise((resolve) => {
    execFile('rclone', ['--config', RCLONE_CONF_PATH, 'lsf', `onedrive:${ONEDRIVE_REMOTE_PATH}`, '--files-only'],
      { timeout: 30000, maxBuffer: 5 * 1024 * 1024 }, (err, stdout) => {
        if (err) {
          onedriveLog(`Không liệt kê được file trên OneDrive để dọn bớt bản cũ: ${err.message}`);
          return resolve();
        }
        const staleFiles = stdout.split('\n').map(f => f.trim()).filter(Boolean)
          .filter(f => f !== keepFilename && EXPORT_FILENAME_RE.test(f));
        if (!staleFiles.length) return resolve();
        (async () => {
          for (const f of staleFiles) {
            await new Promise((res) => {
              execFile('rclone', ['--config', RCLONE_CONF_PATH, 'deletefile', `onedrive:${ONEDRIVE_REMOTE_PATH}/${f}`],
                { timeout: 30000 }, (delErr) => {
                  if (delErr) onedriveLog(`Không xoá được file cũ "${f}" trên OneDrive: ${delErr.message}`);
                  else onedriveLog(`Đã xoá file cũ "${f}" trên OneDrive (chỉ giữ lại bản mới nhất).`);
                  res();
                });
            });
          }
          resolve();
        })();
      });
  });
}

// Tra ve Promise (khong bao gio reject - luon resolve, loi thi da tu ghi vao ONEDRIVE_LOG roi)
// de noi goi co the "await" tung file mot thay vi ban dong loat.
function syncFileToOnedrivePromise(localFilePath) {
  return new Promise((resolve) => {
    if (!onedriveReady) return resolve();
    if (!fs.existsSync(localFilePath)) return resolve();
    // --contimeout/--timeout: bat rclone tu bao loi nhanh (15-30s) neu ket noi toi Microsoft bi
    // treo/cham, thay vi im lang treo mai toi khi bi ep dung (luc do khong con lay duoc ly do that).
    // -vv de ep rclone in chi tiet khi co loi.
    const args = [
      '--config', RCLONE_CONF_PATH, 'copy', localFilePath, `onedrive:${ONEDRIVE_REMOTE_PATH}`,
      '--onedrive-no-versions', '--contimeout', '15s', '--timeout', '30s', '--low-level-retries', '3', '-vv',
    ];
    // Timeout wrapper cao hon nhieu so voi --timeout cua rclone, de rclone luon la ben tu bao loi
    // truoc (co ly do ro rang), khong bi Node giet ngang giua chung (mat het thong tin loi that).
    execFile('rclone', args, { timeout: 180000, maxBuffer: 10 * 1024 * 1024 }, async (err, stdout, stderr) => {
      if (err) {
        // Uu tien lay cac dong co chua tu khoa loi (ERROR/Failed/Fatal) - vi log -vv rat dai va
        // phan lon la dong debug khoi dong o dau, ly do loi that thuong nam o CUOI log.
        function usefulLines(text) {
          if (!text) return '';
          const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
          const errLines = lines.filter(l => /error|fatal|failed|denied|unauthor/i.test(l));
          return (errLines.length ? errLines.slice(-6) : lines.slice(-8)).join(' | ');
        }
        const errTxt = (stderr && stderr.toString()) || '';
        const outTxt = (stdout && stdout.toString()) || '';
        const parts = [];
        const usefulErr = usefulLines(errTxt);
        const usefulOut = usefulLines(outTxt);
        if (usefulErr) parts.push('stderr: ' + usefulErr);
        if (usefulOut) parts.push('stdout: ' + usefulOut);
        parts.push(`exitCode=${err.code !== undefined ? err.code : '?'}${err.signal ? ' signal=' + err.signal : ''}`);
        if (!usefulErr && !usefulOut) parts.push('msg: ' + err.message);
        const detail = parts.join(' || ').replace(/\s+/g, ' ').trim().slice(0, 1200);
        onedriveLog(`LỖI khi đồng bộ "${path.basename(localFilePath)}": ${detail}`);
      } else {
        onedriveLog(`Đã đồng bộ "${path.basename(localFilePath)}" lên OneDrive (${ONEDRIVE_REMOTE_PATH}).`);
        // Chỉ dọn bớt file cũ khi đồng bộ file MỚI thành công, và chỉ với file đúng tên xuất tự
        // động (bỏ qua nếu ai đó đồng bộ 1 file lẻ tên khác, tránh dọn nhầm).
        if (EXPORT_FILENAME_RE.test(path.basename(localFilePath))) {
          await pruneOldRemoteFiles(path.basename(localFilePath));
        }
      }
      resolve();
    });
  });
}

// Ham cu (fire-and-forget) - dung cho truong hop chi co 1 file (xuat hang tuan / "Xuat Excel ngay"),
// khong can cho ket qua.
function syncFileToOnedrive(localFilePath) {
  syncFileToOnedrivePromise(localFilePath);
}

// Dong bo NHIEU file LAN LUOT tung file mot (khong ban song song) - tranh bi Microsoft tra ve
// "serviceNotAvailable" khi nhieu tien trinh rclone cung goi toi cung 1 o dia OneDrive mot luc
// (gap phai khi bam "Dong bo OneDrive ngay" voi nhieu file ton dong cung luc).
async function syncFilesSequentially(localFilePaths) {
  for (const p of localFilePaths) {
    await syncFileToOnedrivePromise(p);
    await new Promise((r) => setTimeout(r, 800)); // nghi ngan giua cac file, de nhe tay voi API
  }
}

function getOnedriveStatus() {
  return {
    enabled: ONEDRIVE_ENABLED,
    ready: onedriveReady,
    remotePath: ONEDRIVE_REMOTE_PATH,
    log: ONEDRIVE_LOG,
  };
}

module.exports = { syncFileToOnedrive, syncFilesSequentially, getOnedriveStatus };
