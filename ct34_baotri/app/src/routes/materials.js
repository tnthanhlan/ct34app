const express = require('express');
const ExcelJS = require('exceljs');
const db = require('../db');
const { requireAuth, requireAdmin } = require('../auth');
const { getMaterialFields, materialToObject } = require('../materialFields');
const { applyStandardStyle } = require('../excelStyle');

const router = express.Router();
router.use(requireAuth);

// Danh sách vật tư
router.get('/', (req, res) => {
  const rows = db.prepare('SELECT * FROM materials ORDER BY sort_order ASC, id ASC').all();
  res.json({ items: rows.map(materialToObject) });
});

function buildDataJson(body) {
  const fieldKeys = getMaterialFields().map(f => f.field_key);
  const data = {};
  for (const k of fieldKeys) {
    if (k in body) data[k] = body[k];
  }
  return JSON.stringify(data);
}

router.post('/', requireAdmin, (req, res) => {
  const { name } = req.body;
  if (!name || !String(name).trim()) return res.status(400).json({ error: 'Cần nhập tên vật tư' });
  const cleanName = String(name).trim().normalize('NFC');
  const dataJson = buildDataJson(req.body);
  const maxOrder = db.prepare('SELECT COALESCE(MAX(sort_order), -1) m FROM materials').get().m;
  try {
    const info = db.prepare('INSERT INTO materials (name, data_json, sort_order) VALUES (?, ?, ?)')
      .run(cleanName, dataJson, maxOrder + 1);
    res.status(201).json({ id: info.lastInsertRowid });
  } catch (e) {
    res.status(400).json({ error: 'Vật tư này đã tồn tại' });
  }
});

router.put('/:id', requireAdmin, (req, res) => {
  const { name } = req.body;
  if (!name || !String(name).trim()) return res.status(400).json({ error: 'Cần nhập tên vật tư' });
  const cleanName = String(name).trim().normalize('NFC');
  const dataJson = buildDataJson(req.body);
  try {
    const info = db.prepare('UPDATE materials SET name = ?, data_json = ? WHERE id = ?').run(cleanName, dataJson, req.params.id);
    if (info.changes === 0) return res.status(404).json({ error: 'Không tìm thấy vật tư' });
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ error: 'Tên vật tư này đã tồn tại' });
  }
});

router.post('/reorder', requireAdmin, (req, res) => {
  const { orderedIds } = req.body;
  if (!Array.isArray(orderedIds)) return res.status(400).json({ error: 'orderedIds phải là mảng' });
  const stmt = db.prepare('UPDATE materials SET sort_order = ? WHERE id = ?');
  const tx = db.transaction((ids) => { ids.forEach((id, i) => stmt.run(i, id)); });
  tx(orderedIds);
  res.json({ ok: true });
});

router.delete('/:id', requireAdmin, (req, res) => {
  const info = db.prepare('DELETE FROM materials WHERE id = ?').run(req.params.id);
  if (info.changes === 0) return res.status(404).json({ error: 'Không tìm thấy vật tư' });
  res.json({ ok: true });
});

// Báo cáo tiêu hao vật tư theo năm - dùng để lên kế hoạch mua sắm hàng năm.
// Nhóm theo vật tư + năm (lấy năm từ ngày thực hiện, nếu thiếu thì lấy năm ghi nhận).
// Tách riêng SC (Thay thế Sửa chữa - tiêu hao thật) và TK (Thay thế Tồn kho - chỉ giải phóng
// sổ sách, không phải tiêu hao thật) để tường minh khi tính ngân sách, nhưng total_qty vẫn
// cộng dồn cả 2 loại (theo đúng yêu cầu "tổng hợp theo cả 2 dữ liệu").
function buildUsageReport() {
  const rows = db.prepare(`
    SELECT
      m.id as material_id, m.name as material_name, m.data_json as material_data_json,
      COALESCE(NULLIF(substr(l.ngay_thuc_hien, 1, 4), ''), substr(l.created_at, 1, 4)) as year,
      COALESCE(SUM(CASE WHEN lm.export_type = 'TK' THEN lm.quantity ELSE 0 END), 0) as tk_qty,
      COALESCE(SUM(CASE WHEN lm.export_type = 'TK' THEN 0 ELSE lm.quantity END), 0) as sc_qty,
      SUM(lm.quantity) as total_qty,
      COUNT(DISTINCT lm.log_id) as so_lan_dung
    FROM maintenance_log_materials lm
    JOIN materials m ON m.id = lm.material_id
    JOIN maintenance_logs l ON l.id = lm.log_id
    GROUP BY m.id, year
    ORDER BY m.sort_order ASC, m.id ASC, year ASC
  `).all();
  return rows.map(r => {
    const obj = materialToObject({ id: r.material_id, name: r.material_name, data_json: r.material_data_json });
    return {
      material_id: r.material_id,
      material_name: r.material_name,
      material_unit: obj.don_vi_tinh || null,
      year: r.year,
      total_qty: r.total_qty,
      sc_qty: r.sc_qty,
      tk_qty: r.tk_qty,
      so_lan_dung: r.so_lan_dung,
    };
  });
}

router.get('/usage-report', (req, res) => {
  res.json({ items: buildUsageReport() });
});

// Xuất Excel báo cáo tiêu hao vật tư theo năm, sắp xếp theo tên A-Z (khớp bảng hiển thị trên tab Vật tư)
// ?year=2026 -> chỉ xuất đúng năm đó. Không truyền hoặc year=all -> xuất đủ các năm.
router.get('/export', requireAdmin, async (req, res) => {
  try {
    const filterYear = req.query.year && req.query.year !== 'all' ? String(req.query.year) : null;
    let usage = buildUsageReport();
    if (filterYear) usage = usage.filter(u => u.year === filterYear);
    const years = filterYear ? [filterYear] : [...new Set(usage.map(u => u.year))].sort();

    const allMaterials = db.prepare('SELECT * FROM materials ORDER BY sort_order ASC, id ASC').all().map(materialToObject);
    const byMaterial = new Map();
    allMaterials.forEach(m => byMaterial.set(m.id, { name: m.name, unit: m.don_vi_tinh, byYear: {}, total: 0, totalSc: 0, totalTk: 0 }));
    usage.forEach(u => {
      if (!byMaterial.has(u.material_id)) byMaterial.set(u.material_id, { name: u.material_name, unit: u.material_unit, byYear: {}, total: 0, totalSc: 0, totalTk: 0 });
      const entry = byMaterial.get(u.material_id);
      entry.byYear[u.year] = { total: u.total_qty, sc: u.sc_qty, tk: u.tk_qty };
      entry.total += u.total_qty;
      entry.totalSc += u.sc_qty;
      entry.totalTk += u.tk_qty;
    });
    const rows = [...byMaterial.values()].sort((a, b) => a.name.localeCompare(b.name, 'vi'));

    const wb = new ExcelJS.Workbook();
    wb.creator = 'Baotri CT34';
    wb.created = new Date();

    // Moi nam tach 3 cot (Tong/SC/TK) de tuong minh cho tinh toan ngan sach: SC la tieu hao
    // THAT (dung de sua chua), TK chi la giai phong so sach ton kho - khong phan anh muc do
    // hao mon thiet bi that su, nen can nhin rieng khi du bao nhu cau mua sam nam toi.
    const ws = wb.addWorksheet('Tieu hao vat tu theo nam');
    ws.columns = [
      { header: 'Vật tư', key: 'name', width: 42 },
      { header: 'Đơn vị tính', key: 'unit', width: 14 },
      ...years.flatMap(y => ([
        { header: `${y} - Tổng`, key: 'y' + y + '_total', width: 11 },
        { header: `${y} - SC`, key: 'y' + y + '_sc', width: 10 },
        { header: `${y} - TK`, key: 'y' + y + '_tk', width: 10 },
      ])),
      { header: 'Tổng (tất cả năm)', key: 'total', width: 16 },
      { header: 'Tổng SC', key: 'totalSc', width: 12 },
      { header: 'Tổng TK', key: 'totalTk', width: 12 },
    ];
    rows.forEach(r => {
      const rowData = { name: r.name, unit: r.unit || '', total: r.total || 0, totalSc: r.totalSc || 0, totalTk: r.totalTk || 0 };
      years.forEach(y => {
        const yearData = r.byYear[y] || { total: 0, sc: 0, tk: 0 };
        rowData['y' + y + '_total'] = yearData.total || 0;
        rowData['y' + y + '_sc'] = yearData.sc || 0;
        rowData['y' + y + '_tk'] = yearData.tk || 0;
      });
      ws.addRow(rowData);
    });

    // Sheet phu: danh sach vat tu day du cac truong (de tham khao/doi chieu)
    const fields = getMaterialFields();
    const ws2 = wb.addWorksheet('Danh sach vat tu');
    ws2.columns = [
      { header: 'Tên vật tư', key: 'name', width: 42 },
      ...fields.map(f => ({ header: f.label, key: f.field_key, width: 20 })),
    ];
    allMaterials.forEach(m => {
      const rowData = { name: m.name };
      fields.forEach(f => { rowData[f.field_key] = m[f.field_key] || ''; });
      ws2.addRow(rowData);
    });

    applyStandardStyle(ws);
    applyStandardStyle(ws2);

    const dayjs = require('dayjs');
    const yearSuffix = filterYear ? `_${filterYear}` : '_tat_ca_nam';
    const filename = `vat_tu_tieu_hao${yearSuffix}_${dayjs().format('YYYY-MM-DD_HHmm')}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    await wb.xlsx.write(res);
    res.end();
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
