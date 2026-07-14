const ExcelJS = require('exceljs');
const path = require('path');
const fs = require('fs');
const dayjs = require('dayjs');
const db = require('./db');
const { getEngineFields, parseData, displayLabel } = require('./engineFields');

async function runWeeklyExport() {
  const exportDir = process.env.EXPORT_DIR || '/share/baotri_exports';
  fs.mkdirSync(exportDir, { recursive: true });

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

  // Sheet 2: Lịch sử sửa chữa / bảo dưỡng
  const wsTasks = wb.addWorksheet('Lich su bao tri');
  wsTasks.columns = [
    { header: 'Ngày thực hiện', key: 'ngay_thuc_hien', width: 16 },
    { header: 'Mã thiết bị', key: 'ma_thiet_bi', width: 16 },
    { header: 'Tên gọi', key: 'ten_goi', width: 26 },
    { header: 'Hạng mục', key: 'hang_muc', width: 22 },
    { header: 'Người thực hiện', key: 'nguoi_thuc_hien', width: 18 },
    { header: 'Nội dung', key: 'noi_dung', width: 40 },
  ];
  wsTasks.getRow(1).font = { bold: true };

  const logs = db.prepare(`
    SELECT t.*, e.ma_thiet_bi, e.data_json AS engine_data_json FROM maintenance_logs t
    JOIN engines e ON e.id = t.engine_id
    ORDER BY t.ngay_thuc_hien DESC, t.id DESC
  `).all();

  logs.forEach(t => {
    wsTasks.addRow({
      ngay_thuc_hien: t.ngay_thuc_hien,
      ma_thiet_bi: t.ma_thiet_bi,
      ten_goi: displayLabel(t.engine_data_json),
      hang_muc: t.hang_muc,
      nguoi_thuc_hien: t.nguoi_thuc_hien,
      noi_dung: t.noi_dung,
    });
  });

  const filename = `baotri_ct34_${dayjs().format('YYYY-MM-DD_HHmm')}.xlsx`;
  const filePath = path.join(exportDir, filename);
  await wb.xlsx.writeFile(filePath);

  const files = fs.readdirSync(exportDir).filter(f => f.endsWith('.xlsx')).sort();
  while (files.length > 30) {
    fs.unlinkSync(path.join(exportDir, files.shift()));
  }

  return filePath;
}

module.exports = { runWeeklyExport };
