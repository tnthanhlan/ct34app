const ExcelJS = require('exceljs');
const path = require('path');
const fs = require('fs');
const os = require('os');
const dayjs = require('dayjs');
const db = require('./db');
const { getEngineFields, parseData, displayLabel } = require('./engineFields');
const { applyStandardStyle } = require('./excelStyle');
const { syncFileToOnedrive } = require('./onedrive');
const { sendWeeklyReportEmailPromise } = require('./mailer');

// Email chỉ gửi lịch sử bảo trì trong N ngày gần nhất (đỡ nặng hộp mail) - bản ĐẦY ĐỦ mọi năm
// vẫn được lưu nguyên trên OneDrive và file tải thủ công ("Xuất Excel ngay"), không mất dữ liệu.
const EMAIL_HISTORY_DAYS = 7;

// Dựng workbook Excel (danh sách động cơ + lịch sử bảo trì). sinceDate (dạng 'YYYY-MM-DD'):
// nếu truyền vào thì chỉ lấy các lần bảo trì có ngay_thuc_hien >= sinceDate; truyền null/undefined
// thì lấy TOÀN BỘ lịch sử (dùng cho bản lưu trữ đầy đủ OneDrive/tải thủ công).
async function buildWorkbook(sinceDate) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Baotri CT34';
  wb.created = new Date();

  // Sheet 1: Danh sách động cơ - cột theo đúng danh sách trường admin đã định nghĩa
  const wsEngines = wb.addWorksheet('Danh sach dong co');
  const engineFields = getEngineFields();
  wsEngines.columns = [
    { header: 'Mã thiết bị', key: 'ma_thiet_bi', width: 16 },
    ...engineFields.map(f => ({ header: f.label, key: f.field_key, width: 18 })),
  ];
  wsEngines.getRow(1).font = { bold: true };

  const engineRows = db.prepare('SELECT * FROM engines ORDER BY id ASC').all();
  engineRows.forEach(e => {
    const data = parseData(e.data_json);
    wsEngines.addRow({ ma_thiet_bi: e.ma_thiet_bi, ...data });
  });

  // Sheet 2: Lịch sử vệ sinh / bảo dưỡng / bảo trì
  const wsTasks = wb.addWorksheet('Lich su bao tri');
  wsTasks.columns = [
    { header: 'Mã thiết bị', key: 'ma_thiet_bi', width: 16 },
    { header: 'Tên gọi', key: 'ten_goi', width: 26 },
    { header: 'Hạng mục', key: 'hang_muc', width: 30 },
    { header: 'Ngày thực hiện', key: 'ngay_thuc_hien', width: 16 },
    { header: 'Người thực hiện', key: 'nguoi_thuc_hien', width: 18 },
    { header: 'Nội dung', key: 'noi_dung', width: 40 },
  ];
  wsTasks.getRow(1).font = { bold: true };

  const logs = sinceDate
    ? db.prepare(`
        SELECT t.*, e.ma_thiet_bi, e.data_json AS engine_data_json FROM maintenance_logs t
        JOIN engines e ON e.id = t.engine_id
        WHERE t.ngay_thuc_hien >= ?
        ORDER BY t.ngay_thuc_hien DESC
      `).all(sinceDate)
    : db.prepare(`
        SELECT t.*, e.ma_thiet_bi, e.data_json AS engine_data_json FROM maintenance_logs t
        JOIN engines e ON e.id = t.engine_id
        ORDER BY t.ngay_thuc_hien DESC
      `).all();

  logs.forEach(t => {
    wsTasks.addRow({
      ma_thiet_bi: t.ma_thiet_bi,
      ten_goi: displayLabel(t.engine_data_json),
      hang_muc: t.hang_muc,
      ngay_thuc_hien: t.ngay_thuc_hien,
      nguoi_thuc_hien: t.nguoi_thuc_hien,
      noi_dung: t.noi_dung,
    });
  });

  applyStandardStyle(wsEngines);
  applyStandardStyle(wsTasks);
  return wb;
}

// Dựng bản Excel NHẸ (chỉ EMAIL_HISTORY_DAYS ngày gần nhất) và gửi email ngay - dùng chung cho
// cả xuất tự động hằng tuần lẫn nút "Gửi email ngay" trong tab Dữ liệu. File tạm nằm ngoài
// EXPORT_DIR (không lẫn vào danh sách file đã xuất) và tự xoá ngay sau khi gửi xong.
async function sendLightweightEmail() {
  let tmpPath = null;
  try {
    const sinceDate = dayjs().subtract(EMAIL_HISTORY_DAYS, 'day').format('YYYY-MM-DD');
    const wbLight = await buildWorkbook(sinceDate);
    // Thêm hậu tố ngẫu nhiên: hàm này có thể bị gọi gần như cùng lúc từ 2 nơi (vd xuất tự động
    // VÀ bấm "Gửi email ngay" trong cùng 1 phút) - nếu không có hậu tố, 2 lần gọi sẽ trùng tên
    // file tạm và có thể tự xoá file tạm của nhau giữa chừng (1 lần gửi sẽ báo lỗi "không tìm
    // thấy file" dù dữ liệu/kết nối hoàn toàn bình thường).
    const unique = `${process.pid}_${Math.random().toString(36).slice(2, 8)}`;
    const filename = `baotri_ct34_${EMAIL_HISTORY_DAYS}ngay_${dayjs().format('YYYY-MM-DD_HHmmss')}_${unique}.xlsx`;
    tmpPath = path.join(os.tmpdir(), filename);
    await wbLight.xlsx.writeFile(tmpPath);
    return await sendWeeklyReportEmailPromise(tmpPath, {
      text: `File Excel đính kèm gồm: danh sách động cơ (đầy đủ) và lịch sử bảo trì ${EMAIL_HISTORY_DAYS} ngày gần nhất (từ ${sinceDate}). Dữ liệu đầy đủ mọi năm vẫn được lưu nguyên trên OneDrive và trong file "Xuất Excel ngay" của add-on, không mất dữ liệu. Email này hệ thống tự động gửi, không cần trả lời.`,
    });
  } finally {
    if (tmpPath) fs.unlink(tmpPath, () => {});
  }
}

async function runWeeklyExport() {
  const exportDir = process.env.EXPORT_DIR || '/share/baotri_exports';
  fs.mkdirSync(exportDir, { recursive: true });

  // Bản ĐẦY ĐỦ (mọi năm) - lưu trong /share để tải thủ công + đồng bộ OneDrive, làm bản lưu
  // trữ/backup đầy đủ, không giới hạn ngày.
  const wbFull = await buildWorkbook(null);
  const filename = `baotri_ct34_${dayjs().format('YYYY-MM-DD_HHmm')}.xlsx`;
  const filePath = path.join(exportDir, filename);
  await wbFull.xlsx.writeFile(filePath);
  syncFileToOnedrive(filePath); // Đồng thời đẩy lên OneDrive nếu đã bật (xem src/onedrive.js) — không chặn việc trả kết quả

  sendLightweightEmail(); // Gửi email bản nhẹ (xem hàm ở trên) nếu đã bật - không chặn việc trả kết quả

  // Chỉ giữ lại đúng bản vừa xuất trên máy chủ HA (y hệt cách đã làm cho OneDrive ở bản 7.9.4) -
  // file này đã gồm toàn bộ lịch sử mọi năm rồi nên giữ thêm nhiều bản cũ chỉ tổ chiếm chỗ, trong
  // khi dữ liệu thật vẫn luôn an toàn trong database (file Excel chỉ là bản xuất/tải về, không
  // phải nơi lưu trữ chính).
  const files = fs.readdirSync(exportDir).filter(f => f.endsWith('.xlsx')).sort();
  for (const f of files) {
    if (f === filename) continue;
    fs.unlinkSync(path.join(exportDir, f));
  }

  return filePath;
}

// Dọn 1 lần ngay lúc server khởi động (= mỗi lần update/restart add-on) - để nếu thư mục đang
// tồn đọng nhiều file cũ từ TRƯỚC khi có tính năng "chỉ giữ bản mới nhất" (bản 7.9.5), các file
// đó được dọn ngay khi update xong, không phải đợi tới lần xuất kế tiếp (Chủ nhật tới, hoặc tự
// bấm "Xuất Excel ngay") mới thấy có tác dụng.
function pruneStaleLocalExportsOnStartup() {
  try {
    const exportDir = process.env.EXPORT_DIR || '/share/baotri_exports';
    fs.mkdirSync(exportDir, { recursive: true });
    const files = fs.readdirSync(exportDir).filter(f => f.endsWith('.xlsx')).sort();
    // Giữ lại file CUỐI CÙNG sau khi sắp xếp (= file có tên mới nhất, vì tên file có dạng
    // ...YYYY-MM-DD_HHmm.xlsx), xoá hết các file còn lại.
    for (let i = 0; i < files.length - 1; i++) {
      fs.unlinkSync(path.join(exportDir, files[i]));
    }
    if (files.length > 1) {
      console.log(`[baotri_ct34] Đã dọn ${files.length - 1} file xuất cũ trong ${exportDir} lúc khởi động, chỉ giữ lại "${files[files.length - 1]}".`);
    }
  } catch (e) {
    console.error('[baotri_ct34] Lỗi khi dọn file xuất cũ lúc khởi động:', e.message);
  }
}

module.exports = { runWeeklyExport, sendLightweightEmail, pruneStaleLocalExportsOnStartup };
