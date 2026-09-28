const express = require('express');
const db = require('../db');
const { requireAuth, requireAdmin } = require('../auth');
const { getMaterialFields, slugifyFieldKey } = require('../materialFields');

const router = express.Router();
router.use(requireAuth);

router.get('/', (req, res) => {
  res.json({ items: getMaterialFields() });
});

router.post('/', requireAdmin, (req, res) => {
  const { label } = req.body;
  if (!label || !String(label).trim()) return res.status(400).json({ error: 'Cần nhập tên trường' });
  const cleanLabel = String(label).trim().normalize('NFC');
  const baseKey = slugifyFieldKey(cleanLabel);
  let finalKey = baseKey;
  let n = 1;
  while (db.prepare('SELECT id FROM material_fields WHERE field_key = ?').get(finalKey)) {
    n++;
    finalKey = `${baseKey}_${n}`;
  }
  const maxOrder = db.prepare('SELECT COALESCE(MAX(sort_order), -1) m FROM material_fields').get().m;
  const info = db.prepare('INSERT INTO material_fields (field_key, label, sort_order) VALUES (?, ?, ?)')
    .run(finalKey, cleanLabel, maxOrder + 1);
  res.status(201).json({ id: info.lastInsertRowid, field_key: finalKey, label: cleanLabel });
});

router.put('/:id', requireAdmin, (req, res) => {
  const { label } = req.body;
  if (!label || !String(label).trim()) return res.status(400).json({ error: 'Cần nhập tên trường' });
  db.prepare('UPDATE material_fields SET label = ? WHERE id = ?').run(String(label).trim().normalize('NFC'), req.params.id);
  res.json({ ok: true });
});

router.post('/reorder', requireAdmin, (req, res) => {
  const { orderedIds } = req.body;
  if (!Array.isArray(orderedIds)) return res.status(400).json({ error: 'orderedIds phải là mảng' });
  const stmt = db.prepare('UPDATE material_fields SET sort_order = ? WHERE id = ?');
  const tx = db.transaction((ids) => { ids.forEach((id, i) => stmt.run(i, id)); });
  tx(orderedIds);
  res.json({ ok: true });
});

router.delete('/:id', requireAdmin, (req, res) => {
  const info = db.prepare('DELETE FROM material_fields WHERE id = ?').run(req.params.id);
  if (info.changes === 0) return res.status(404).json({ error: 'Không tìm thấy trường' });
  res.json({ ok: true });
});

module.exports = router;
