const fs = require('fs');
const path = require('path');

// Gọi action 'exportNow' (admin-only, thêm vào Code.gs ngày 2026-09-25) của Apps Script Checklist
// CT34 - action này xuất báo cáo mới nhất ngay khi gọi, không cần đợi email hay đúng giờ trigger
// 23:50 CN của chính Apps Script. Trả về JSON {filename, base64}, lưu thành file thật trong
// EXPORT_DIR để onedrive.js đẩy lên OneDrive.
async function fetchAndSaveExport() {
  const apiUrl = process.env.API_URL;
  const email = process.env.ADMIN_EMAIL || 'tnthanhlan@gmail.com';
  const exportDir = process.env.EXPORT_DIR || '/share/checklist_ct34_reports';
  if (!apiUrl) throw new Error('Chưa điền "api_url" trong Configuration của add-on.');

  const url = apiUrl + '?action=exportNow&email=' + encodeURIComponent(email);
  const res = await fetch(url, { signal: AbortSignal.timeout(30000) });
  if (!res.ok) throw new Error('HTTP ' + res.status + ' khi gọi Apps Script (action=exportNow)');

  const data = await res.json();
  if (data.error) throw new Error('Apps Script báo lỗi: ' + data.error);
  if (!data.filename || !data.base64) {
    throw new Error('Phản hồi thiếu filename/base64 - kiểm tra lại action "exportNow" đã có trong Code.gs đang deploy chưa.');
  }

  fs.mkdirSync(exportDir, { recursive: true });
  const filePath = path.join(exportDir, data.filename);
  fs.writeFileSync(filePath, Buffer.from(data.base64, 'base64'));
  return filePath;
}

module.exports = { fetchAndSaveExport };
