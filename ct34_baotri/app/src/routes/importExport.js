const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const db = require('../db');
const { requireAuth, requireAdmin } = require('../auth');
const { runWeeklyExport } = require('../exportWeekly');
const { getEngineFields } = require('../engineFields');
const { listSheetNames, readSheetSafely } = require('../safeExcelReader');
const { getMergedRanges } = require('../mergeInfo');

const router = express.Router();
router.use(requireAuth);

const upload = multer({ dest: '/tmp/uploads' });

const MAINT_TARGET_FIELDS = [
  { key: 'ma_thiet_bi', label: 'Mã thiết bị (để khớp với danh sách động cơ)' },
  { key: 'ngay_thuc_hien', label: 'Ngày thực hiện' },
  { key: 'hang_muc', label: 'Hạng mục / loại công việc' },
  { key: 'nguoi_thuc_hien', label: 'Người thực hiện' },
  { key: 'noi_dung', label: 'Nội dung / ghi chú' },
];

// Dò các cặp cột kiểu "Hạng mục - Ngày làm" + "Hạng mục - Người làm" (file dạng "Đợt kiểm tra"
// nhiều hạng mục cùng lúc, mỗi hạng mục có 2 cột riêng). Trả về danh sách hạng mục tìm được.
function detectCategoryPairs(headerNames) {
  const byPrefix = {};
  for (const h of headerNames) {
    const m1 = h.match(/^(.*) - Ngày làm$/);
    const m2 = h.match(/^(.*) - Người làm$/);
    if (m1) { byPrefix[m1[1]] = byPrefix[m1[1]] || {}; byPrefix[m1[1]].ngayCol = h; }
    if (m2) { byPrefix[m2[1]] = byPrefix[m2[1]] || {}; byPrefix[m2[1]].nguoiCol = h; }
  }
  return Object.entries(byPrefix)
    .filter(([, v]) => v.ngayCol)
    .map(([category, v]) => ({ category, ngayCol: v.ngayCol, nguoiCol: v.nguoiCol || null }));
}

// ---------- Đọc file Excel có header nhiều tầng + ô gộp thật ----------

// Chuyển giá trị 1 ô (có thể là richText, công thức, hyperlink, date...) thành chuỗi sạch.
// Luôn chuẩn hóa Unicode về dạng NFC — file Excel có thể lưu chữ có dấu tiếng Việt ở dạng NFD
// (tổ hợp dấu rời), nhìn giống hệt nhưng khác byte, gây trùng lặp "ẩn" nếu không chuẩn hóa.
function cellText(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') {
    if (Array.isArray(value.richText)) {
      return value.richText.map(r => r.text).join('').replace(/\s+/g, ' ').trim().normalize('NFC');
    }
    if (value.result !== undefined) return String(value.result).trim().normalize('NFC');
    if (value.text !== undefined) return String(value.text).trim().normalize('NFC');
    if (value instanceof Date) return value.toISOString().slice(0, 10);
    return '';
  }
  return String(value).replace(/\s+/g, ' ').trim().normalize('NFC');
}

// Trả về số nếu ô là số thuần HOẶC là công thức có kết quả (result) dạng số; ngược lại null.
function cellNumber(value) {
  if (typeof value === 'number') return value;
  if (value && typeof value === 'object' && typeof value.result === 'number') return value.result;
  return null;
}

// Chuẩn hóa ngày tháng dạng chữ (dd/m/yyyy, d-m-yyyy...) về yyyy-mm-dd để sắp xếp/so sánh đúng.
// Nếu không nhận diện được định dạng, giữ nguyên chuỗi gốc.
function normalizeDateText(text) {
  if (!text) return text;
  const t = String(text).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;
  let m = t.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2}|\d{4})$/);
  if (m) {
    let [, d, mo, y] = m;
    if (y.length === 2) y = '20' + y;
    return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  return t;
}

// Dựng bảng tra cứu nhanh: với mỗi ô KHÔNG PHẢI ô gốc của 1 vùng gộp, trỏ về tọa độ ô gốc.
function buildMergeIndex(ranges) {
  const map = new Map();
  for (const rg of ranges || []) {
    const cellCount = (rg.r2 - rg.r1 + 1) * (rg.c2 - rg.c1 + 1);
    if (cellCount > 20000) continue; // an toàn, tránh vùng gộp bất thường quá lớn
    for (let r = rg.r1; r <= rg.r2; r++) {
      for (let c = rg.c1; c <= rg.c2; c++) {
        if (r === rg.r1 && c === rg.c1) continue;
        map.set(r + ',' + c, { r: rg.r1, c: rg.c1 });
      }
    }
  }
  return map;
}

// Lấy giá trị 1 ô, tự động dùng giá trị ô gốc nếu đây là ô nằm trong vùng gộp (dùng thông tin
// gộp THẬT đọc từ file, không đoán) và bản thân ô hiện tại đang rỗng.
function getCellValue(sheet, mergeIndex, row, col) {
  const raw = sheet.getRow(row).getCell(col).value;
  if (cellText(raw)) return raw;
  const anchor = mergeIndex.get(row + ',' + col);
  if (anchor) return sheet.getRow(anchor.r).getCell(anchor.c).value;
  return raw;
}

// Tìm dòng dữ liệu đầu tiên: quét vài dòng đầu, tìm dòng mà cột A là số (STT),
// xác nhận thêm dòng kế tiếp cũng là số cho chắc. Nếu không tìm thấy, trả về null.
function detectDataStartRow(sheet, mergeIndex) {
  const scanLimit = Math.min(sheet.rowCount, 30);
  for (let r = 2; r <= scanLimit; r++) {
    const a = cellNumber(getCellValue(sheet, mergeIndex, r, 1));
    if (a !== null) {
      const aNext = cellNumber(getCellValue(sheet, mergeIndex, r + 1, 1));
      if (aNext !== null || r >= scanLimit) return r;
    }
  }
  return null;
}

// Với vùng header (có thể nhiều dòng, có ô gộp ngang/dọc thật), ghép tên cột theo từng cột:
// bỏ qua dòng "banner" (chỉ có đúng 1 giá trị lặp lại cho cả dòng, kiểu tiêu đề lớn),
// nối các dòng còn lại theo thứ tự, bỏ trùng lặp liên tiếp (do ô gộp dọc).
function buildHeaders(sheet, mergeIndex) {
  let dataStartRow = detectDataStartRow(sheet, mergeIndex);
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
      const t = cellText(getCellValue(sheet, mergeIndex, r, col));
      if (t && parts[parts.length - 1] !== t) parts.push(t);
    }
    const name = parts.join(' - ');
    if (name) headers.push({ col, name });
  }

  return { headers, dataStartRow };
}

async function loadSheetWithMerges(filePath, sheetName) {
  const sheet = await readSheetSafely(filePath, sheetName || undefined);
  if (!sheet) return null;
  const mergedRanges = await getMergedRanges(filePath, sheet.name);
  const mergeIndex = buildMergeIndex(mergedRanges);
  return { sheet, mergeIndex };
}

function buildPreviewPayload(sheet, mergeIndex) {
  const { headers, dataStartRow } = buildHeaders(sheet, mergeIndex);

  const sample = [];
  for (let i = dataStartRow; i <= Math.min(sheet.rowCount, dataStartRow + 4); i++) {
    const rowData = {};
    headers.forEach(h => { rowData[h.name] = cellText(getCellValue(sheet, mergeIndex, i, h.col)); });
    sample.push(rowData);
  }

  const engineFields = getEngineFields().map(f => ({ key: f.field_key, label: f.label }));
  const headerNameList = headers.map(h => h.name);
  const categoryPairs = detectCategoryPairs(headerNameList);

  return {
    headers: headerNameList,
    sample,
    totalRows: Math.max(sheet.rowCount - dataStartRow + 1, 0),
    targetFieldsEngine: [{ key: 'ma_thiet_bi', label: 'Mã thiết bị (bắt buộc, dùng làm mã định danh)' }, ...engineFields],
    targetFieldsMaintenance: MAINT_TARGET_FIELDS,
    categoryPairs,
  };
}

// Đọc file Excel, trả về danh sách header + vài dòng đầu để người dùng map cột
router.post('/preview', requireAdmin, upload.single('file'), async (req, res) => {
  try {
    const sheetNames = await listSheetNames(req.file.path);
    const loaded = await loadSheetWithMerges(req.file.path, sheetNames[0]);
    if (!loaded) return res.status(400).json({ error: 'File không có sheet nào đọc được' });

    const payload = buildPreviewPayload(loaded.sheet, loaded.mergeIndex);
    res.json({
      uploadId: path.basename(req.file.path),
      sheetNames,
      currentSheet: loaded.sheet.name,
      ...payload,
    });
  } catch (e) {
    res.status(400).json({ error: 'Không đọc được file Excel: ' + e.message });
  }
});

// Đọc lại 1 sheet KHÁC trong cùng file đã upload trước đó (không cần upload lại)
router.post('/preview-sheet', requireAdmin, async (req, res) => {
  const { uploadId, sheetName } = req.body;
  const filePath = path.join('/tmp/uploads', uploadId);
  if (!fs.existsSync(filePath)) return res.status(400).json({ error: 'File tạm đã hết hạn, upload lại giúp mình' });
  try {
    const loaded = await loadSheetWithMerges(filePath, sheetName);
    if (!loaded) return res.status(400).json({ error: 'Không tìm thấy sheet "' + sheetName + '"' });

    const sheetNames = await listSheetNames(filePath);
    const payload = buildPreviewPayload(loaded.sheet, loaded.mergeIndex);
    res.json({
      uploadId,
      sheetNames,
      currentSheet: loaded.sheet.name,
      ...payload,
    });
  } catch (e) {
    res.status(400).json({ error: 'Không đọc được sheet: ' + e.message });
  }
});

// Nhập dữ liệu thật sau khi người dùng đã chọn mapping cột -> field
router.post('/commit', requireAdmin, async (req, res) => {
  const { uploadId, target, mapping, sheetName } = req.body; // target: 'engines' | 'maintenance' | 'maintenance_wide'
  const filePath = path.join('/tmp/uploads', uploadId);
  if (!fs.existsSync(filePath)) return res.status(400).json({ error: 'File tạm đã hết hạn, upload lại giúp mình' });

  try {
    const loaded = await loadSheetWithMerges(filePath, sheetName);
    if (!loaded) return res.status(400).json({ error: 'Không tìm thấy sheet "' + sheetName + '"' });
    const { sheet, mergeIndex } = loaded;
    const { headers, dataStartRow } = buildHeaders(sheet, mergeIndex);
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
        const ma = maCol ? cellText(getCellValue(sheet, mergeIndex, i, maCol)) : '';
        if (!ma) { skipped++; continue; }

        const data = {};
        for (const fk of engineFieldKeys) {
          const excelCol = mapping[fk];
          const colNum = excelCol ? headerNames[excelCol] : null;
          const v = colNum ? cellText(getCellValue(sheet, mergeIndex, i, colNum)) : '';
          if (v) data[fk] = v;
        }

        const before = db.prepare('SELECT id FROM engines WHERE ma_thiet_bi = ?').get(ma);
        upsert.run(ma, JSON.stringify(data));
        if (before) updated++; else inserted++;
      }
    } else if (target === 'maintenance') {
      for (let i = dataStartRow; i <= sheet.rowCount; i++) {
        const rec = {};
        for (const f of MAINT_TARGET_FIELDS) {
          const excelCol = mapping[f.key];
          const colNum = excelCol ? headerNames[excelCol] : null;
          rec[f.key] = colNum ? (cellText(getCellValue(sheet, mergeIndex, i, colNum)) || null) : null;
        }
        if (!rec.ma_thiet_bi) { skipped++; continue; }
        const engine = db.prepare('SELECT id FROM engines WHERE ma_thiet_bi = ?').get(rec.ma_thiet_bi);
        if (!engine) { skipped++; continue; }
        if (!rec.ngay_thuc_hien && !rec.noi_dung && !rec.hang_muc) { skipped++; continue; }
        rec.ngay_thuc_hien = normalizeDateText(rec.ngay_thuc_hien);

        db.prepare(`
          INSERT INTO maintenance_logs (engine_id, ngay_thuc_hien, hang_muc, nguoi_thuc_hien, noi_dung)
          VALUES (?, ?, ?, ?, ?)
        `).run(engine.id, rec.ngay_thuc_hien, rec.hang_muc, rec.nguoi_thuc_hien, rec.noi_dung);
        inserted++;
      }
    } else if (target === 'maintenance_wide') {
      // Che do "nhieu hang muc theo cot": moi hang muc da chon (category) co 2 cot rieng
      // (Ngay lam / Nguoi lam). Voi moi dong thiet bi, moi hang muc co dien ngay se tao 1 ban ghi lich su.
      const maCol = mapping.maCol ? headerNames[mapping.maCol] : null;
      const selectedPairs = (mapping.pairs || [])
        .map(p => ({
          category: p.category,
          ngayCol: p.ngayCol ? headerNames[p.ngayCol] : null,
          nguoiCol: p.nguoiCol ? headerNames[p.nguoiCol] : null,
        }))
        .filter(p => p.ngayCol);

      // Đảm bảo các hạng mục phát hiện được cũng nằm trong danh sách quản lý, để lần sau chọn được trong form
      const maxOrder = db.prepare('SELECT COALESCE(MAX(sort_order), -1) m FROM maintenance_categories').get().m;
      const insertCategory = db.prepare('INSERT OR IGNORE INTO maintenance_categories (name, sort_order) VALUES (?, ?)');
      selectedPairs.forEach((p, i) => insertCategory.run(p.category, maxOrder + 1 + i));

      for (let i = dataStartRow; i <= sheet.rowCount; i++) {
        const ma = maCol ? cellText(getCellValue(sheet, mergeIndex, i, maCol)) : '';
        if (!ma) { continue; }
        const engine = db.prepare('SELECT id FROM engines WHERE ma_thiet_bi = ?').get(ma);
        if (!engine) { skipped += selectedPairs.length; continue; }

        for (const p of selectedPairs) {
          const ngay = normalizeDateText(cellText(getCellValue(sheet, mergeIndex, i, p.ngayCol)));
          if (!ngay) { continue; } // hang muc nay chua lam cho thiet bi nay trong dot nay, bo qua
          const nguoi = p.nguoiCol ? cellText(getCellValue(sheet, mergeIndex, i, p.nguoiCol)) : null;
          db.prepare(`
            INSERT INTO maintenance_logs (engine_id, ngay_thuc_hien, hang_muc, nguoi_thuc_hien, noi_dung)
            VALUES (?, ?, ?, ?, ?)
          `).run(engine.id, ngay, p.category, nguoi || null, null);
          inserted++;
        }
      }
    } else {
      return res.status(400).json({ error: 'target không hợp lệ' });
    }

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
