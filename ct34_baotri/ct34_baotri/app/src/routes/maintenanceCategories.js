const express = require('express');
const db = require('../db');
const { requireAuth, requireAdmin } = require('../auth');

const router = express.Router();
router.use(requireAuth);

router.get('/', (req, res) => {
  const items = db.prepare('SELECT * FROM maintenance_categories ORDER BY sort_order ASC, id ASC').all();
  res.json({ items });
});

router.post('/', requireAdmin, (req, res) => {
  const { name } = req.body;
  if (!name || !String(name).trim()) return res.status(400).json({ error: 'Cần nhập tên hạng mục' });
  const cleanName = String(name).trim().normalize('NFC');
  const maxOrder = db.prepare('SELECT COALESCE(MAX(sort_order), -1) m FROM maintenance_categories').get().m;
  try {
    const info = db.prepare('INSERT INTO maintenance_categories (name, sort_order) VALUES (?, ?)')
      .run(cleanName, maxOrder + 1);
    res.status(201).json({ id: info.lastInsertRowid, name: cleanName });
  } catch (e) {
    res.status(400).json({ error: 'Hạng mục này đã tồn tại' });
  }
});

router.put('/:id', requireAdmin, (req, res) => {
  const { name } = req.body;
  if (!name || !String(name).trim()) return res.status(400).json({ error: 'Cần nhập tên hạng mục' });
  const cleanName = String(name).trim().normalize('NFC');
  try {
    const info = db.prepare('UPDATE maintenance_categories SET name = ? WHERE id = ?').run(cleanName, req.params.id);
    if (info.changes === 0) return res.status(404).json({ error: 'Không tìm thấy hạng mục' });
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ error: 'Tên hạng mục này đã tồn tại' });
  }
});

router.post('/reorder', requireAdmin, (req, res) => {
  const { orderedIds } = req.body;
  if (!Array.isArray(orderedIds)) return res.status(400).json({ error: 'orderedIds phải là mảng' });
  const stmt = db.prepare('UPDATE maintenance_categories SET sort_order = ? WHERE id = ?');
  const tx = db.transaction((ids) => { ids.forEach((id, i) => stmt.run(i, id)); });
  tx(orderedIds);
  res.json({ ok: true });
});

router.delete('/:id', requireAdmin, (req, res) => {
  const info = db.prepare('DELETE FROM maintenance_categories WHERE id = ?').run(req.params.id);
  if (info.changes === 0) return res.status(404).json({ error: 'Không tìm thấy hạng mục' });
  res.json({ ok: true });
});

module.exports = router;
