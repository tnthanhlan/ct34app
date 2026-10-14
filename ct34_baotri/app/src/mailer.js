const fs = require('fs');
const path = require('path');
const nodemailer = require('nodemailer');

/* ---------------- Tự động gửi email kèm file Excel mỗi khi xuất ----------------
   Ngay sau khi xuất xong file Excel (dù là lịch tự động hằng tuần Chủ nhật 23h50, hay bấm
   "Xuất Excel ngay"), server tự gửi email đính kèm file đó tới danh sách người nhận đã cấu
   hình - y hệt cơ chế OneDrive (src/onedrive.js), chạy song song, không chặn nhau.

   Gửi qua Gmail SMTP, dùng LUÔN tài khoản admin (ADMIN_EMAIL) làm người gửi - cần 1
   "Mật khẩu ứng dụng" (App Password) riêng cho việc gửi email, KHÔNG PHẢI mật khẩu đăng
   nhập app (admin_password) và cũng không phải mật khẩu Gmail thường.

   Cách lấy App Password (làm 1 lần, trên tài khoản Gmail dùng làm admin_email):
   1. Bật "Xác minh 2 bước" cho tài khoản Google đó nếu chưa bật (bắt buộc phải có mới tạo
      được App Password): myaccount.google.com/security
   2. Vào myaccount.google.com/apppasswords, tạo 1 mật khẩu ứng dụng mới (đặt tên tuỳ ý,
      vd "Bao tri CT34"). Google sẽ cho ra 1 chuỗi 16 ký tự (có thể có dấu cách).
   3. Dán chuỗi đó (bỏ dấu cách nếu có) vào ô "weekly_email_app_password" trong tab
      Configuration của add-on này, rồi bật "weekly_email_enabled" và điền
      "weekly_email_recipients" (nhiều email cách nhau bằng dấu phẩy). */

const EMAIL_ENABLED = process.env.WEEKLY_EMAIL_ENABLED === 'true';
const EMAIL_APP_PASSWORD = process.env.WEEKLY_EMAIL_APP_PASSWORD || '';
const EMAIL_RECIPIENTS = (process.env.WEEKLY_EMAIL_RECIPIENTS || '')
  .split(',').map(s => s.trim()).filter(Boolean);
const SENDER_EMAIL = process.env.ADMIN_EMAIL || '';
const EMAIL_LOG = []; // vài dòng log gần nhất, hiện trong tab Dữ liệu để dễ kiểm tra không cần SSH

function emailLog(msg) {
  const line = `${new Date().toLocaleString('vi-VN')} - ${msg}`;
  console.log('[email]', msg);
  EMAIL_LOG.unshift(line);
  if (EMAIL_LOG.length > 30) EMAIL_LOG.length = 30;
}

function isReady() {
  return EMAIL_ENABLED && !!SENDER_EMAIL && !!EMAIL_APP_PASSWORD && EMAIL_RECIPIENTS.length > 0;
}

let transporter = null;
function getTransporter() {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: { user: SENDER_EMAIL, pass: EMAIL_APP_PASSWORD },
    });
  }
  return transporter;
}

if (EMAIL_ENABLED) {
  if (!SENDER_EMAIL) emailLog('Đã bật "weekly_email_enabled" nhưng chưa cấu hình admin_email — bỏ qua gửi email.');
  else if (!EMAIL_APP_PASSWORD) emailLog('Đã bật "weekly_email_enabled" nhưng chưa điền "weekly_email_app_password" trong Configuration — bỏ qua gửi email.');
  else if (!EMAIL_RECIPIENTS.length) emailLog('Đã bật "weekly_email_enabled" nhưng chưa điền "weekly_email_recipients" — bỏ qua gửi email.');
  else emailLog(`Đã sẵn sàng gửi email hằng tuần (gửi từ ${SENDER_EMAIL}) tới: ${EMAIL_RECIPIENTS.join(', ')}`);
}

// Trả về Promise (không bao giờ reject - lỗi thì đã tự ghi vào EMAIL_LOG rồi), để nơi gọi có
// thể "await" khi cần biết kết quả ngay (vd nút "Gửi email ngay"), hoặc bỏ qua khi chỉ cần
// chạy nền (xuất hàng tuần tự động).
async function sendWeeklyReportEmailPromise(filePath, opts = {}) {
  if (!isReady()) return { sent: false, reason: 'Chưa bật/cấu hình xong gửi email (xem tab Configuration của add-on).' };
  if (!fs.existsSync(filePath)) return { sent: false, reason: 'Không tìm thấy file để gửi' };
  try {
    const tx = getTransporter();
    await tx.sendMail({
      from: `"Bảo trì CT34" <${SENDER_EMAIL}>`,
      to: EMAIL_RECIPIENTS.join(', '),
      subject: `[Bảo trì CT34] Báo cáo bảo trì - ${path.basename(filePath)}`,
      text: opts.text || 'File Excel báo cáo bảo trì CT34 (danh sách động cơ + lịch sử bảo trì) được đính kèm trong email này — hệ thống tự động gửi, không cần trả lời email này.',
      attachments: [{ filename: path.basename(filePath), path: filePath }],
    });
    emailLog(`Đã gửi email kèm "${path.basename(filePath)}" tới ${EMAIL_RECIPIENTS.join(', ')}`);
    return { sent: true };
  } catch (e) {
    emailLog(`LỖI khi gửi email "${path.basename(filePath)}": ${e.message}`);
    return { sent: false, reason: e.message };
  }
}

// Hàm cũ (fire-and-forget) - dùng cho trường hợp xuất tự động/thủ công, không cần chờ kết quả.
function sendWeeklyReportEmail(filePath) {
  sendWeeklyReportEmailPromise(filePath);
}

function getEmailStatus() {
  return {
    enabled: EMAIL_ENABLED,
    ready: isReady(),
    sender: SENDER_EMAIL,
    recipients: EMAIL_RECIPIENTS,
    log: EMAIL_LOG,
  };
}

module.exports = { sendWeeklyReportEmail, sendWeeklyReportEmailPromise, getEmailStatus };
