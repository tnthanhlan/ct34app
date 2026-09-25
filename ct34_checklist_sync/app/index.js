const cron = require('node-cron');
const { fetchAndSaveExport } = require('./src/fetchExport');
const { syncFileToOnedrivePromise, getOnedriveStatus } = require('./src/onedrive');

async function runSyncOnce(reason) {
  console.log('[ct34_checklist_sync] Bắt đầu (' + reason + ')...');
  try {
    const filePath = await fetchAndSaveExport();
    console.log('[ct34_checklist_sync] Đã tải báo cáo về:', filePath);
    await syncFileToOnedrivePromise(filePath);
    console.log('[ct34_checklist_sync] Xong.');
  } catch (e) {
    console.error('[ct34_checklist_sync] LỖI:', e.message);
  }
}

const SYNC_CRON = process.env.SYNC_CRON || '35 23 * * 0';
const TZ = process.env.TZ || 'Asia/Ho_Chi_Minh';

console.log('[ct34_checklist_sync] Lịch: "' + SYNC_CRON + '" (' + TZ + ') - CỐ Ý lệch giờ với lịch 23:50 CN của add-on Bảo trì/Chấm công, tránh nhiều tiến trình cùng gọi OneDrive 1 lúc (gây lỗi serviceNotAvailable đã gặp khi test trước đây).');
console.log('[ct34_checklist_sync] Trạng thái OneDrive:', JSON.stringify(getOnedriveStatus()));

cron.schedule(SYNC_CRON, function () { runSyncOnce('lịch hàng tuần'); }, { timezone: TZ });

// Chạy thử 1 lần ngay khi add-on khởi động (đợi 10s cho log ổn định) - để kiểm tra kết quả ngay
// không cần đợi tới lịch: chỉ cần bấm "Restart" add-on trong Home Assistant là chạy thử lại được,
// xem log ngay trong tab Log của add-on (không cần SSH).
setTimeout(function () { runSyncOnce('kiểm tra lúc khởi động add-on'); }, 10000);

// Không có web server nào khác giữ tiến trình sống - giữ event loop chạy để cron hoạt động.
setInterval(function () {}, 1 << 30);
