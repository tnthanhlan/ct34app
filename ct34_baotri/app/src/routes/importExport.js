const express = require('express');
const multer = require('multer');
const ExcelJS = require('exceljs');
const fs = require('fs');
const path = require('path');
const db = require('../db');
const { requireAuth, requireAdmin } = require('../auth');
const { runWeeklyExport } = require('../exportWeekly');
const { getEngineFields } = require('../engineFields');

const router = express.Router();
router.use(requireAuth);

const upload = multer({ dest: '/tmp/uploads' });

const MAINT_TARGET_FIELDS = [
  { key: 'ma_thiet_bi', label: 'Mã thiết bị (để khớp với danh sách động cơ)' },
  { key: 'loai_cong_viec', label: 'Loại công việc (ve_sinh/bao_duong/bao_tri)' },
  { key: 'mo_ta', label: 'Mô tả công việc' },
  { key: 'chu_ky_ngay', label: 'Chu kỳ (số ngày)' },
  { key: 'ngay_thuc_hien_gan_nhat', label: 'Ngày thực hiện gần nhất' },
  { key: 'ngay_den_han', label: 'Ngày đến hạn' },
  { key: 'nguoi_phu_trach', label: 'Người phụ trách' },
];

// ---------- Đọc file Excel có header nhiều tầng + ô gộp ----------

// Chuyển giá trị 1 ô (có thể là richText, công thức, hyperlink, date...) thành chuỗi sạch
function cellText(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') {
    if (Array.isArray(value.richText)) {
      return value.richText.map(r => r.text).join('').replace(/\s+/g, ' ').trim();
    }
    if (value.result !== undefined) return String(value.result).trim();
    if (value.text !== undefined) return String(value.text).trim();
    if (value instanceof Date) return value.toISOString().slice(0, 10);
    return '';
  }
  return String(value).replace(/\s+/g, ' ').trim();
}

// Trả về số nếu ô là số thuần HOẶC là công thức có kết quả (result) dạng số; ngược lại null.
function cellNumber(value) {
  if (typeof value === 'number') return value;
  if (value && typeof value === 'object' && typeof value.result === 'number') return value.result;
  return null;
}

// Tìm dòng dữ liệu đầu tiên: quét vài dòng đầu, tìm dòng mà cột A là số (STT),
// xác nhận thêm dòng kế tiếp cũng là số cho chắc. Nếu không tìm thấy, trả về null.
function detectDataStartRow(sheet) {
  const scanLimit = Math.min(sheet.rowCount, 30);
  for (let r = 2; r <= scanLimit; r++) {
    const a = cellNumber(sheet.getRow(r).getCell(1).value);
    if (a !== null) {
      const aNext = cellNumber(sheet.getRow(r + 1).getCell(1).value);
      if (aNext !== null || r >= scanLimit) return r;
    }
  }
  return null;
}

// Với vùng header (có thể nhiều dòng, có ô gộp ngang/dọc), ghép tên cột theo từng cột:
// bỏ qua dòng "banner" (chỉ có đúng 1 giá trị lặp lại cho cả dòng, kiểu tiêu đề lớn),
// nối các dòng còn lại theo thứ tự, bỏ trùng lặp liên tiếp (do ô gộp dọc).
function buildHeaders(sheet) {
  let dataStartRow = detectDataStartRow(sheet);
  let headerRows;
  if (dataStartRow) {
    headerRows = [];
    for (let r = 1; r < dataStartRow; r++) headerRows.push(r);
  } else {
    const scanLimit = Math.min(sheet.rowCount, 15);
    let bestRow = 1, bestScore = -1;
    for (let r = 1; r <= scanLimit; r++) {
      const row = sheet.getRow(r);
      let count = 0;
      row.eachCell({ includeEmpty: false }, (cell) => { if (cellText(cell.value)) count++; });
      if (count > bestScore) { bestScore = count; bestRow = r; }
    }
    headerRows = [bestRow];
    dataStartRow = bestRow + 1;
  }

  const colCount = sheet.columnCount;

  const usableHeaderRows = headerRows.filter(r => {
    const row = sheet.getRow(r);
    const vals = new Set();
    row.eachCell({ includeEmpty: false }, (cell) => {
      const t = cellText(cell.value);
      if (t) vals.add(t);
    });
    return vals.size !== 1 || headerRows.length === 1;
  });
  const finalHeaderRows = usableHeaderRows.length ? usableHeaderRows : headerRows;

  const headers = [];
  for (let col = 1; col <= colCount; col++) {
    const parts = [];
    for (const r of finalHeaderRows) {
      const t = cellText(sheet.getRow(r).getCell(col).value);
      if (t && parts[parts.length - 1] !== t) parts.push(t);
    }
    const name = parts.join(' - ');
    if (name) headers.push({ col, name });
  }

  return { headers, dataStartRow };
}

// Đọc file Excel, trả về danh sách header + vài dòng đầu để người dùng map cột
router.post('/preview', requireAdmin, upload.single('file'), async (req, res) => {
  try {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(req.file.path);
    const sheet = wb.worksheets[0];
    const { headers, dataStartRow } = buildHeaders(sheet);

    const sample = [];
    for (let i = dataStartRow; i <= Math.min(sheet.rowCount, dataStartRow + 4); i++) {
      const row = sheet.getRow(i);
      const rowData = {};
      headers.forEach(h => { rowData[h.name] = cellText(row.getCell(h.col).value); });
      sample.push(rowData);
    }

    const engineFields = getEngineFields().map(f => ({ key: f.field_key, label: f.label }));

    res.json({
      uploadId: path.basename(req.file.path),
      headers: headers.map(h => h.name),
      sample,
      totalRows: Math.max(sheet.rowCount - dataStartRow + 1, 0),
      targetFieldsEngine: [{ key: 'ma_thiet_bi', label: 'Mã thiết bị (bắt buộc, dùng làm mã định danh)' }, ...engineFields],
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
    const { headers, dataStartRow } = buildHeaders(sheet);
    const headerNames = {};
    headers.forEach(h => { headerNames[h.name] = h.col; });

    let inserted = 0, updated = 0, skipped = 0;

    if (target === 'engines') {
      const engineFieldKeys = getEngineFields().map(f => f.field_key);
      const maCol = mapping['ma_thiet_bi'] ? headerNames[mapping['ma_thiet_bi']] : null;
      const upsert = db.prepare(`
        INSERT INTO engines (ma_thiet_bi, data_json) VALUES (?, ?)
        ON CONFLICT(ma_thiet_bi) DO UPDATE SET data_json = excluded.data_json, updated_at = datetime('now')
      `);

      for (let i = dataStartRow; i <= sheet.rowCount; i++) {
        const row = sheet.getRow(i);
        const ma = maCol ? cellText(row.getCell(maCol).value) : '';
        if (!ma) { skipped++; continue; }

        const data = {};
        for (const fk of engineFieldKeys) {
          const excelCol = mapping[fk];
          const colNum = excelCol ? headerNames[excelCol] : null;
          const v = colNum ? cellText(row.getCell(colNum).value) : '';
          if (v) data[fk] = v;
        }

        const before = db.prepare('SELECT id FROM engines WHERE ma_thiet_bi = ?').get(ma);
        upsert.run(ma, JSON.stringify(data));
        if (before) updated++; else inserted++;
      }
    } else if (target === 'maintenance') {
      for (let i = dataStartRow; i <= sheet.rowCount; i++) {
        const row = sheet.getRow(i);
        const rec = {};
        for (const f of MAINT_TARGET_FIELDS) {
          const excelCol = mapping[f.key];
          const colNum = excelCol ? headerNames[excelCol] : null;
          rec[f.key] = colNum ? (cellText(row.getCell(colNum).value) || null) : null;
        }
        if (!rec.ma_thiet_bi || !rec.loai_cong_viec) { skipped++; continue; }
        const engine = db.prepare('SELECT id FROM engines WHERE ma_thiet_bi = ?').get(rec.ma_thiet_bi);
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
