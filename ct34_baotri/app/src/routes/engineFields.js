const express = require('express');
const db = require('../db');
const { requireAuth, requireAdmin } = require('../auth');
const { getEngineFields, slugifyFieldKey } = require('../engineFields');

const router = express.Router();
router.use(requireAuth);

router.get('/', (req, res) => {
  res.json({ items: getEngineFields() });
});

router.post('/', requireAdmin, (req, res) => {
  const { label } = req.body;
  if (!label || !String(label).trim()) return res.status(400).json({ error: 'Cần nhập tên trường' });
  const baseKey = slugifyFieldKey(label);
  let finalKey = baseKey;
  let n = 1;
  while (db.prepare('SELECT id FROM engine_fields WHERE field_key = ?').get(finalKey)) {
    n++;
    finalKey = `${baseKey}_${n}`;
  }
  const maxOrder = db.prepare('SELECT COALESCE(MAX(sort_order), -1) m FROM engine_fields').get().m;
  const info = db.prepare('INSERT INTO engine_fields (field_key, label, sort_order) VALUES (?, ?, ?)')
    .run(finalKey, String(label).trim(), maxOrder + 1);
  res.status(201).json({ id: info.lastInsertRowid, field_key: finalKey, label: String(label).trim() });
});

router.put('/:id', requireAdmin, (req, res) => {
  const { label, is_display_name } = req.body;
  if (label !== undefined) {
    if (!String(label).trim()) return res.status(400).json({ error: 'Cần nhập tên trường' });
    db.prepare('UPDATE engine_fields SET label = ? WHERE id = ?').run(String(label).trim(), req.params.id);
  }
  if (is_display_name) {
    const tx = db.transaction(() => {
      db.prepare('UPDATE engine_fields SET is_display_name = 0').run();
      db.prepare('UPDATE engine_fields SET is_display_name = 1 WHERE id = ?').run(req.params.id);
    });
    tx();
  }
  res.json({ ok: true });
});

// Sắp xếp lại: gửi lên mảng id theo đúng thứ tự mới
router.post('/reorder', requireAdmin, (req, res) => {
  const { orderedIds } = req.body;
  if (!Array.isArray(orderedIds)) return res.status(400).json({ error: 'orderedIds phải là mảng' });
  const stmt = db.prepare('UPDATE engine_fields SET sort_order = ? WHERE id = ?');
  const tx = db.transaction((ids) => { ids.forEach((id, i) => stmt.run(i, id)); });
  tx(orderedIds);
  res.json({ ok: true });
});

router.delete('/:id', requireAdmin, (req, res) => {
  const info = db.prepare('DELETE FROM engine_fields WHERE id = ?').run(req.params.id);
  if (info.changes === 0) return res.status(404).json({ error: 'Không tìm thấy trường' });
  res.json({ ok: true });
});

module.exports = router;
