const cron = require('node-cron');
const { runWeeklyExport } = require('./exportWeekly');

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

  console.log('[cron] Da dat lich xuat Excel: 23:50 Chu nhat hang tuan (' + (process.env.TZ || 'Asia/Ho_Chi_Minh') + ')');
}

module.exports = { startCron };
