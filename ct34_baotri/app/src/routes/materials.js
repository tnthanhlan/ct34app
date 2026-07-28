const express = require('express');
const db = require('../db');
const { requireAuth, requireAdmin } = require('../auth');

const router = express.Router();
router.use(requireAuth);

// Danh sách vật tư
router.get('/', (req, res) => {
  const items = db.prepare('SELECT * FROM materials ORDER BY sort_order ASC, id ASC').all();
  res.json({ items });
});

router.post('/', requireAdmin, (req, res) => {
  const { name, unit } = req.body;
  if (!name || !String(name).trim()) return res.status(400).json({ error: 'Cần nhập tên vật tư' });
  const cleanName = String(name).trim().normalize('NFC');
  const cleanUnit = unit ? String(unit).trim().normalize('NFC') : null;
  const maxOrder = db.prepare('SELECT COALESCE(MAX(sort_order), -1) m FROM materials').get().m;
  try {
    const info = db.prepare('INSERT INTO materials (name, unit, sort_order) VALUES (?, ?, ?)')
      .run(cleanName, cleanUnit, maxOrder + 1);
    res.status(201).json({ id: info.lastInsertRowid, name: cleanName, unit: cleanUnit });
  } catch (e) {
    res.status(400).json({ error: 'Vật tư này đã tồn tại' });
  }
});

router.put('/:id', requireAdmin, (req, res) => {
  const { name, unit } = req.body;
  if (!name || !String(name).trim()) return res.status(400).json({ error: 'Cần nhập tên vật tư' });
  const cleanName = String(name).trim().normalize('NFC');
  const cleanUnit = unit ? String(unit).trim().normalize('NFC') : null;
  try {
    const info = db.prepare('UPDATE materials SET name = ?, unit = ? WHERE id = ?').run(cleanName, cleanUnit, req.params.id);
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
router.get('/usage-report', (req, res) => {
  const rows = db.prepare(`
    SELECT
      m.id as material_id, m.name as material_name, m.unit as material_unit,
      COALESCE(NULLIF(substr(l.ngay_thuc_hien, 1, 4), ''), substr(l.created_at, 1, 4)) as year,
      SUM(lm.quantity) as total_qty,
      COUNT(DISTINCT lm.log_id) as so_lan_dung
    FROM maintenance_log_materials lm
    JOIN materials m ON m.id = lm.material_id
    JOIN maintenance_logs l ON l.id = lm.log_id
    GROUP BY m.id, year
    ORDER BY m.sort_order ASC, m.id ASC, year ASC
  `).all();
  res.json({ items: rows });
});

module.exports = router;
