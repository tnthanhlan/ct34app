const express = require('express');
const db = require('../db');
const { requireAuth, requireAdmin } = require('../auth');
const { getEngineFields, engineToObject } = require('../engineFields');

const router = express.Router();
router.use(requireAuth);

// Danh sách + tìm kiếm + phân trang
router.get('/', (req, res) => {
  const { q = '', page = 1, pageSize = 50 } = req.query;
  const limit = Math.min(parseInt(pageSize, 10) || 50, 1000);
  const offset = (Math.max(parseInt(page, 10) || 1, 1) - 1) * limit;

  let where = '';
  let params = [];
  if (q) {
    where = 'WHERE lower_vn(ma_thiet_bi) LIKE ? OR lower_vn(data_json) LIKE ?';
    const like = `%${q.toLowerCase()}%`;
    params = [like, like];
  }

  const total = db.prepare(`SELECT COUNT(*) c FROM engines ${where}`).get(...params).c;
  const rows = db.prepare(`SELECT * FROM engines ${where} ORDER BY id ASC LIMIT ? OFFSET ?`)
    .all(...params, limit, offset);

  res.json({ total, page: Number(page), pageSize: limit, items: rows.map(engineToObject) });
});

router.get('/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM engines WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Không tìm thấy động cơ' });
  res.json(engineToObject(row));
});

function buildDataJson(body) {
  const fieldKeys = getEngineFields().map(f => f.field_key);
  const data = {};
  for (const k of fieldKeys) {
    if (k in body) data[k] = body[k];
  }
  return JSON.stringify(data);
}

router.post('/', (req, res) => {
  const maThietBi = (req.body.ma_thiet_bi || '').trim().normalize('NFC') || null;
  const dataJson = buildDataJson(req.body);
  try {
    const info = db.prepare('INSERT INTO engines (ma_thiet_bi, data_json) VALUES (?, ?)').run(maThietBi, dataJson);
    res.status(201).json({ id: info.lastInsertRowid });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.put('/:id', (req, res) => {
  const maThietBi = (req.body.ma_thiet_bi || '').trim().normalize('NFC') || null;
  const dataJson = buildDataJson(req.body);
  try {
    const info = db.prepare(`UPDATE engines SET ma_thiet_bi = ?, data_json = ?, updated_at = datetime('now') WHERE id = ?`)
      .run(maThietBi, dataJson, req.params.id);
    if (info.changes === 0) return res.status(404).json({ error: 'Không tìm thấy động cơ' });
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.delete('/:id', requireAdmin, (req, res) => {
  const info = db.prepare('DELETE FROM engines WHERE id = ?').run(req.params.id);
  if (info.changes === 0) return res.status(404).json({ error: 'Không tìm thấy động cơ' });
  res.json({ ok: true });
});

module.exports = router;
