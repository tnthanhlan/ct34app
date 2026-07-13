const express = require('express');
const multer = require('multer');
const ExcelJS = require('exceljs');
const fs = require('fs');
const path = require('path');
const db = require('../db');
const { requireAuth, requireAdmin } = require('../auth');
const { runWeeklyExport } = require('../exportWeekly');

const router = express.Router();
router.use(requireAuth);

const upload = multer({ dest: '/tmp/uploads' });

const ENGINE_TARGET_FIELDS = [
  { key: 'ma_dong_co', label: 'Mã động cơ' },
  { key: 'ten_thiet_bi', label: 'Tên thiết bị' },
  { key: 'vi_tri', label: 'Vị trí lắp đặt' },
  { key: 'cong_suat', label: 'Công suất' },
  { key: 'dien_ap', label: 'Điện áp' },
  { key: 'dong_dien', label: 'Dòng điện' },
  { key: 'hang_sx', label: 'Hãng sản xuất' },
  { key: 'model', label: 'Model' },
  { key: 'so_serial', label: 'Số serial' },
  { key: 'ngay_lap_dat', label: 'Ngày lắp đặt' },
  { key: 'tinh_trang', label: 'Tình trạng' },
  { key: 'ghi_chu', label: 'Ghi chú' },
];

const MAINT_TARGET_FIELDS = [
  { key: 'ma_dong_co', label: 'Mã động cơ (để khớp với danh sách động cơ)' },
  { key: 'loai_cong_viec', label: 'Loại công việc (ve_sinh/bao_duong/bao_tri)' },
  { key: 'mo_ta', label: 'Mô tả công việc' },
  { key: 'chu_ky_ngay', label: 'Chu kỳ (số ngày)' },
  { key: 'ngay_thuc_hien_gan_nhat', label: 'Ngày thực hiện gần nhất' },
  { key: 'ngay_den_han', label: 'Ngày đến hạn' },
  { key: 'nguoi_phu_trach', label: 'Người phụ trách' },
];

// Đọc file Excel, trả về danh sách header + vài dòng đầu để người dùng map cột
router.post('/preview', requireAdmin, upload.single('file'), async (req, res) => {
  try {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(req.file.path);
    const sheet = wb.worksheets[0];
    const headerRow = sheet.getRow(1);
    const headers = [];
    headerRow.eachCell({ includeEmpty: false }, (cell, colNumber) => {
      headers.push({ col: colNumber, name: String(cell.value || '').trim() });
    });

    const sample = [];
    for (let i = 2; i <= Math.min(sheet.rowCount, 6); i++) {
      const row = sheet.getRow(i);
      const rowData = {};
      headers.forEach(h => { rowData[h.name] = row.getCell(h.col).value; });
      sample.push(rowData);
    }

    res.json({
      uploadId: path.basename(req.file.path),
      headers: headers.map(h => h.name),
      sample,
      totalRows: sheet.rowCount - 1,
      targetFieldsEngine: ENGINE_TARGET_FIELDS,
      targetFieldsMaintenance: MAINT_TARGET_FIELDS,
    });
  } catch (e) {
    res.status(400).json({ error: 'Không đọc được file Excel: ' + e.message });
  }
});

// Nhập dữ liệu thật sau khi người dùng đã chọn mapping cột -> field
router.post('/commit', requireAdmin, async (req, res) => {
  const { uploadId, target, mapping } = req.body; // target: 'engines' | 'maintenance'
  const filePath = path.join('/tmp/uploads', uploadId);
  if (!fs.existsSync(filePath)) return res.status(400).json({ error: 'File tạm đã hết hạn, upload lại giúp mình' });

  try {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(filePath);
    const sheet = wb.worksheets[0];
    const headerRow = sheet.getRow(1);
    const headerNames = {};
    headerRow.eachCell({ includeEmpty: false }, (cell, colNumber) => {
      headerNames[String(cell.value || '').trim()] = colNumber;
    });

    let inserted = 0, updated = 0, skipped = 0;

    if (target === 'engines') {
      const upsert = db.prepare(`
        INSERT INTO engines (ma_dong_co, ten_thiet_bi, vi_tri, cong_suat, dien_ap, dong_dien,
          hang_sx, model, so_serial, ngay_lap_dat, tinh_trang, ghi_chu)
        VALUES (@ma_dong_co, @ten_thiet_bi, @vi_tri, @cong_suat, @dien_ap, @dong_dien,
          @hang_sx, @model, @so_serial, @ngay_lap_dat, @tinh_trang, @ghi_chu)
        ON CONFLICT(ma_dong_co) DO UPDATE SET
          ten_thiet_bi=excluded.ten_thiet_bi, vi_tri=excluded.vi_tri, cong_suat=excluded.cong_suat,
          dien_ap=excluded.dien_ap, dong_dien=excluded.dong_dien, hang_sx=excluded.hang_sx,
          model=excluded.model, so_serial=excluded.so_serial, ngay_lap_dat=excluded.ngay_lap_dat,
          tinh_trang=excluded.tinh_trang, ghi_chu=excluded.ghi_chu, updated_at=datetime('now')
      `);

      for (let i = 2; i <= sheet.rowCount; i++) {
        const row = sheet.getRow(i);
        const rec = {};
        for (const f of ENGINE_TARGET_FIELDS) {
          const excelCol = mapping[f.key];
          const colNum = excelCol ? headerNames[excelCol] : null;
          rec[f.key] = colNum ? String(row.getCell(colNum).value ?? '').trim() || null : null;
        }
        if (!rec.ma_dong_co) { skipped++; continue; }
        const before = db.prepare('SELECT id FROM engines WHERE ma_dong_co = ?').get(rec.ma_dong_co);
        upsert.run(rec);
        if (before) updated++; else inserted++;
      }
    } else if (target === 'maintenance') {
      for (let i = 2; i <= sheet.rowCount; i++) {
        const row = sheet.getRow(i);
        const rec = {};
        for (const f of MAINT_TARGET_FIELDS) {
          const excelCol = mapping[f.key];
          const colNum = excelCol ? headerNames[excelCol] : null;
          rec[f.key] = colNum ? String(row.getCell(colNum).value ?? '').trim() || null : null;
        }
        if (!rec.ma_dong_co || !rec.loai_cong_viec) { skipped++; continue; }
        const engine = db.prepare('SELECT id FROM engines WHERE ma_dong_co = ?').get(rec.ma_dong_co);
        if (!engine) { skipped++; continue; }

        db.prepare(`
          INSERT INTO maintenance_tasks
            (engine_id, loai_cong_viec, mo_ta, chu_ky_ngay, ngay_thuc_hien_gan_nhat, ngay_den_han, nguoi_phu_trach, trang_thai)
          VALUES (?, ?, ?, ?, ?, ?, ?, 'cho_xu_ly')
        `).run(engine.id, rec.loai_cong_viec, rec.mo_ta, rec.chu_ky_ngay ? Number(rec.chu_ky_ngay) : null,
          rec.ngay_thuc_hien_gan_nhat, rec.ngay_den_han, rec.nguoi_phu_trach);
        inserted++;
      }
    } else {
      return res.status(400).json({ error: 'target phải là engines hoặc maintenance' });
    }

    fs.unlink(filePath, () => {});
    res.json({ ok: true, inserted, updated, skipped });
  } catch (e) {
    res.status(400).json({ error: 'Lỗi nhập dữ liệu: ' + e.message });
  }
});

// Xuất Excel thủ công (ngoài lịch tự động Chủ nhật 23h50)
router.get('/export-now', requireAdmin, async (req, res) => {
  try {
    const filePath = await runWeeklyExport();
    res.json({ ok: true, file: path.basename(filePath) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Danh sách các file đã xuất, để tải về
router.get('/exports', requireAdmin, (req, res) => {
  const dir = process.env.EXPORT_DIR || '/share/baotri_exports';
  fs.mkdirSync(dir, { recursive: true });
  const files = fs.readdirSync(dir)
    .filter(f => f.endsWith('.xlsx'))
    .sort()
    .reverse();
  res.json({ files });
});

router.get('/exports/:filename', requireAdmin, (req, res) => {
  const dir = process.env.EXPORT_DIR || '/share/baotri_exports';
  const filePath = path.join(dir, req.params.filename);
  if (!filePath.startsWith(dir) || !fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'Không tìm thấy file' });
  }
  res.download(filePath);
});

module.exports = router;
