const ExcelJS = require('exceljs');
const path = require('path');
const fs = require('fs');
const dayjs = require('dayjs');
const db = require('./db');

async function runWeeklyExport() {
  const exportDir = process.env.EXPORT_DIR || '/share/baotri_exports';
  fs.mkdirSync(exportDir, { recursive: true });

  const wb = new ExcelJS.Workbook();
  wb.creator = 'Baotri CT34';
  wb.created = new Date();

  // Sheet 1: Danh sách động cơ
  const wsEngines = wb.addWorksheet('Danh sach dong co');
  wsEngines.columns = [
    { header: 'Mã động cơ', key: 'ma_dong_co', width: 16 },
    { header: 'Tên thiết bị', key: 'ten_thiet_bi', width: 24 },
    { header: 'Vị trí', key: 'vi_tri', width: 18 },
    { header: 'Công suất', key: 'cong_suat', width: 12 },
    { header: 'Điện áp', key: 'dien_ap', width: 12 },
    { header: 'Dòng điện', key: 'dong_dien', width: 12 },
    { header: 'Hãng SX', key: 'hang_sx', width: 16 },
    { header: 'Model', key: 'model', width: 16 },
    { header: 'Số serial', key: 'so_serial', width: 16 },
    { header: 'Ngày lắp đặt', key: 'ngay_lap_dat', width: 14 },
    { header: 'Tình trạng', key: 'tinh_trang', width: 16 },
    { header: 'Ghi chú', key: 'ghi_chu', width: 30 },
  ];
  wsEngines.getRow(1).font = { bold: true };
  const engines = db.prepare('SELECT * FROM engines ORDER BY ma_dong_co ASC').all();
  engines.forEach(e => wsEngines.addRow(e));

  // Sheet 2: Lịch vệ sinh / bảo dưỡng / bảo trì
  const wsTasks = wb.addWorksheet('Lich bao tri');
  wsTasks.columns = [
    { header: 'Mã động cơ', key: 'ma_dong_co', width: 16 },
    { header: 'Tên thiết bị', key: 'ten_thiet_bi', width: 24 },
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
    SELECT t.*, e.ma_dong_co, e.ten_thiet_bi FROM maintenance_tasks t
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
      ma_dong_co: t.ma_dong_co,
      ten_thiet_bi: t.ten_thiet_bi,
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

  // giữ tối đa 30 file gần nhất để tránh đầy ổ đĩa
  const files = fs.readdirSync(exportDir).filter(f => f.endsWith('.xlsx')).sort();
  while (files.length > 30) {
    fs.unlinkSync(path.join(exportDir, files.shift()));
  }

  return filePath;
}

module.exports = { runWeeklyExport };
