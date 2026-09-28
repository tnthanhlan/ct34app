const cron = require('node-cron');
const fs = require('fs');
const path = require('path');
const { runWeeklyExport } = require('./exportWeekly');

function cleanupOldUploads() {
  const dir = '/tmp/uploads';
  if (!fs.existsSync(dir)) return;
  const cutoff = Date.now() - 24 * 60 * 60 * 1000; // 24 gio
  for (const f of fs.readdirSync(dir)) {
    const p = path.join(dir, f);
    try {
      const stat = fs.statSync(p);
      if (stat.mtimeMs < cutoff) fs.unlinkSync(p);
    } catch (e) { /* bo qua */ }
  }
}

function startCron() {
  // Chạy 23:50 mỗi Chủ nhật (0 = Chủ nhật), theo giờ Việt Nam
  cron.schedule('50 23 * * 0', async () => {
    try {
      const filePath = await runWeeklyExport();
      console.log('[cron] Da xuat file Excel hang tuan:', filePath);
    } catch (e) {
      console.error('[cron] Loi xuat Excel:', e.message);
    }
  }, { timezone: process.env.TZ || 'Asia/Ho_Chi_Minh' });

  // Don file Excel tam da upload de xem truoc, cu hon 24 gio thi xoa - moi gio kiem tra 1 lan
  cron.schedule('0 * * * *', () => {
    try { cleanupOldUploads(); } catch (e) { /* bo qua */ }
  }, { timezone: process.env.TZ || 'Asia/Ho_Chi_Minh' });

  console.log('[cron] Da dat lich xuat Excel: 23:50 Chu nhat hang tuan (' + (process.env.TZ || 'Asia/Ho_Chi_Minh') + ')');
}

module.exports = { startCron };
