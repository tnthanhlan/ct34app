const express = require('express');
const db = require('../db');
const { requireAuth, requireAdmin } = require('../auth');
const { displayLabel } = require('../engineFields');

const router = express.Router();
router.use(requireAuth);

// Xoa toan bo lich su bao tri (chi admin) - dung khi can nhap lai sach tu dau
router.delete('/all', requireAdmin, (req, res) => {
  const info = db.prepare('DELETE FROM maintenance_logs').run();
  res.json({ ok: true, deleted: info.changes });
});

// Danh sách lịch sử, lọc theo engine_id, hạng mục, khoảng ngày, hoặc tìm kiếm tự do
router.get('/', (req, res) => {
  const { engine_id, hang_muc, q = '', from, to } = req.query;
  let where = [];
  let params = [];

  if (engine_id) { where.push('t.engine_id = ?'); params.push(engine_id); }
  if (hang_muc) { where.push('t.hang_muc = ?'); params.push(hang_muc); }
  if (from) { where.push('t.ngay_thuc_hien >= ?'); params.push(from); }
  if (to) { where.push('t.ngay_thuc_hien <= ?'); params.push(to); }
  if (q) {
    where.push('(lower_vn(e.ma_thiet_bi) LIKE ? OR lower_vn(e.data_json) LIKE ? OR lower_vn(t.noi_dung) LIKE ? OR lower_vn(t.hang_muc) LIKE ?)');
    const like = `%${q.toLowerCase()}%`;
    params.push(like, like, like, like);
  }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const rows = db.prepare(`
    SELECT t.*, e.ma_thiet_bi, e.data_json AS engine_data_json
    FROM maintenance_logs t
    JOIN engines e ON e.id = t.engine_id
    ${whereSql}
    ORDER BY t.ngay_thuc_hien DESC, t.id DESC
  `).all(...params);

  const materialsByLog = new Map();
  if (rows.length) {
    const ids = rows.map(r => r.id);
    const placeholders = ids.map(() => '?').join(',');
    const matRows = db.prepare(`
      SELECT lm.log_id, lm.material_id, lm.quantity, m.name, m.unit
      FROM maintenance_log_materials lm JOIN materials m ON m.id = lm.material_id
      WHERE lm.log_id IN (${placeholders})
    `).all(...ids);
    matRows.forEach(m => {
      if (!materialsByLog.has(m.log_id)) materialsByLog.set(m.log_id, []);
      materialsByLog.get(m.log_id).push({ material_id: m.material_id, name: m.name, unit: m.unit, quantity: m.quantity });
    });
  }

  const items = rows.map(r => {
    const { engine_data_json, ...rest } = r;
    return { ...rest, ten_goi: displayLabel(engine_data_json), materials: materialsByLog.get(r.id) || [] };
  });
  res.json({ items });
});

// Danh sách hạng mục đã từng dùng, để gợi ý autocomplete khi nhập mới
router.get('/hang-muc-goi-y', (req, res) => {
  const rows = db.prepare(`
    SELECT hang_muc, COUNT(*) c FROM maintenance_logs
    WHERE hang_muc IS NOT NULL AND hang_muc != ''
    GROUP BY hang_muc ORDER BY c DESC, hang_muc ASC
  `).all();
  res.json({ items: rows.map(r => r.hang_muc) });
});

router.get('/:id', (req, res) => {
  const row = db.prepare(`
    SELECT t.*, e.ma_thiet_bi, e.data_json AS engine_data_json FROM maintenance_logs t
    JOIN engines e ON e.id = t.engine_id WHERE t.id = ?
  `).get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Không tìm thấy bản ghi' });
  const { engine_data_json, ...rest } = row;
  const materials = db.prepare(`
    SELECT lm.material_id, lm.quantity, m.name, m.unit
    FROM maintenance_log_materials lm JOIN materials m ON m.id = lm.material_id
    WHERE lm.log_id = ?
  `).all(req.params.id);
  res.json({ ...rest, ten_goi: displayLabel(engine_data_json), materials });
});

// Ghi (thay thế toàn bộ) danh sách vật tư đã dùng cho 1 bản ghi lịch sử
function saveMaterialsForLog(logId, materials) {
  db.prepare('DELETE FROM maintenance_log_materials WHERE log_id = ?').run(logId);
  if (!Array.isArray(materials) || !materials.length) return;
  const insert = db.prepare('INSERT INTO maintenance_log_materials (log_id, material_id, quantity) VALUES (?, ?, ?)');
  materials.forEach(m => {
    const materialId = m && m.material_id;
    const qty = m && Number(m.quantity);
    if (materialId && qty > 0) insert.run(logId, materialId, qty);
  });
}

router.post('/', (req, res) => {
  const { engine_id, ngay_thuc_hien, hang_muc, nguoi_thuc_hien, noi_dung, materials } = req.body;
  if (!engine_id) return res.status(400).json({ error: 'Thiếu engine_id' });
  const info = db.prepare(`
    INSERT INTO maintenance_logs (engine_id, ngay_thuc_hien, hang_muc, nguoi_thuc_hien, noi_dung)
    VALUES (?, ?, ?, ?, ?)
  `).run(engine_id, ngay_thuc_hien || null, (hang_muc || '').trim().normalize('NFC') || null, nguoi_thuc_hien || null, noi_dung || null);
  saveMaterialsForLog(info.lastInsertRowid, materials);
  res.status(201).json({ id: info.lastInsertRowid });
});

router.put('/:id', (req, res) => {
  const { ngay_thuc_hien, hang_muc, nguoi_thuc_hien, noi_dung, materials } = req.body;
  const info = db.prepare(`
    UPDATE maintenance_logs SET
      ngay_thuc_hien = ?, hang_muc = ?, nguoi_thuc_hien = ?, noi_dung = ?, updated_at = datetime('now')
    WHERE id = ?
  `).run(ngay_thuc_hien || null, (hang_muc || '').trim().normalize('NFC') || null, nguoi_thuc_hien || null, noi_dung || null, req.params.id);
  if (info.changes === 0) return res.status(404).json({ error: 'Không tìm thấy bản ghi' });
  if (materials !== undefined) saveMaterialsForLog(req.params.id, materials);
  res.json({ ok: true });
});

router.delete('/:id', (req, res) => {
  const info = db.prepare('DELETE FROM maintenance_logs WHERE id = ?').run(req.params.id);
  if (info.changes === 0) return res.status(404).json({ error: 'Không tìm thấy bản ghi' });
  res.json({ ok: true });
});

module.exports = router;
