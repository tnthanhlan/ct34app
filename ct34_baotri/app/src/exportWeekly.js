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

  // Sheet 2: Lịch vệ sinh / bảo dưỡng / bảo trì
  const wsTasks = wb.addWorksheet('Lich bao tri');
  wsTasks.columns = [
    { header: 'Mã thiết bị', key: 'ma_thiet_bi', width: 16 },
    { header: 'Tên gọi', key: 'ten_goi', width: 26 },
    { header: 'Loại công việc', key: 'loai_cong_viec_vn', width: 16 },
    { header: 'Mô tả', key: 'mo_ta', width: 26 },
    { header: 'Chu kỳ (ngày)', key: 'chu_ky_ngay', width: 14 },
    { header: 'Thực hiện gần nhất', key: 'ngay_thuc_hien_gan_nhat', width: 18 },
    { header: 'Đến hạn', key: 'ngay_den_han', width: 14 },
    { header: 'Người phụ trách', key: 'nguoi_phu_trach', width: 18 },
    { header: 'Trạng thái', key: 'trang_thai_vn', width: 14 },
  ];
  wsTasks.getRow(1).font = { bold: true };

  const labelLoai = { ve_sinh: 'Vệ sinh', bao_duong: 'Bảo dưỡng', bao_tri: 'Bảo trì' };
  const labelTrangThai = { cho_xu_ly: 'Chờ xử lý', da_xong: 'Đã xong', qua_han: 'Quá hạn' };

  const tasks = db.prepare(`
    SELECT t.*, e.ma_thiet_bi, e.data_json AS engine_data_json FROM maintenance_tasks t
    JOIN engines e ON e.id = t.engine_id
    ORDER BY t.ngay_den_han ASC
  `).all();

  const today = dayjs().startOf('day');
  tasks.forEach(t => {
    let trangThai = t.trang_thai;
    if (trangThai !== 'da_xong' && t.ngay_den_han && today.isAfter(dayjs(t.ngay_den_han))) {
      trangThai = 'qua_han';
    }
    wsTasks.addRow({
      ma_thiet_bi: t.ma_thiet_bi,
      ten_goi: displayLabel(t.engine_data_json),
      loai_cong_viec_vn: labelLoai[t.loai_cong_viec] || t.loai_cong_viec,
      mo_ta: t.mo_ta,
      chu_ky_ngay: t.chu_ky_ngay,
      ngay_thuc_hien_gan_nhat: t.ngay_thuc_hien_gan_nhat,
      ngay_den_han: t.ngay_den_han,
      nguoi_phu_trach: t.nguoi_phu_trach,
      trang_thai_vn: labelTrangThai[trangThai] || trangThai,
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
