const express = require('express');
const db = require('../db');
const { requireAuth, requireAdmin } = require('../auth');

const router = express.Router();

const CORE_FIELDS = [
  'ma_dong_co', 'ten_thiet_bi', 'vi_tri', 'cong_suat', 'dien_ap',
  'dong_dien', 'hang_sx', 'model', 'so_serial', 'ngay_lap_dat',
  'tinh_trang', 'ghi_chu'
];

router.use(requireAuth);

// Danh sách + tìm kiếm + phân trang
router.get('/', (req, res) => {
  const { q = '', page = 1, pageSize = 50 } = req.query;
  const limit = Math.min(parseInt(pageSize, 10) || 50, 200);
  const offset = (Math.max(parseInt(page, 10) || 1, 1) - 1) * limit;

  let where = '';
  let params = [];
  if (q) {
    where = `WHERE ma_dong_co LIKE ? OR ten_thiet_bi LIKE ? OR vi_tri LIKE ? OR hang_sx LIKE ?`;
    const like = `%${q}%`;
    params = [like, like, like, like];
  }

  const total = db.prepare(`SELECT COUNT(*) c FROM engines ${where}`).get(...params).c;
  const rows = db.prepare(`SELECT * FROM engines ${where} ORDER BY ma_dong_co ASC LIMIT ? OFFSET ?`)
    .all(...params, limit, offset);

  res.json({ total, page: Number(page), pageSize: limit, items: rows });
});

router.get('/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM engines WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Không tìm thấy động cơ' });
  res.json(row);
});

function buildFieldsFromBody(body) {
  const fields = {};
  for (const f of CORE_FIELDS) if (f in body) fields[f] = body[f];
  const extra = {};
  for (const k of Object.keys(body)) {
    if (!CORE_FIELDS.includes(k) && k !== 'id') extra[k] = body[k];
  }
  fields.extra_json = JSON.stringify(extra);
  return fields;
}

router.post('/', (req, res) => {
  const fields = buildFieldsFromBody(req.body);
  const cols = Object.keys(fields);
  const placeholders = cols.map(() => '?').join(',');
  const stmt = db.prepare(`INSERT INTO engines (${cols.join(',')}) VALUES (${placeholders})`);
  try {
    const info = stmt.run(...cols.map(c => fields[c]));
    res.status(201).json({ id: info.lastInsertRowid });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.put('/:id', (req, res) => {
  const fields = buildFieldsFromBody(req.body);
  const cols = Object.keys(fields);
  const setClause = cols.map(c => `${c} = ?`).join(', ');
  const stmt = db.prepare(`UPDATE engines SET ${setClause}, updated_at = datetime('now') WHERE id = ?`);
  try {
    const info = stmt.run(...cols.map(c => fields[c]), req.params.id);
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
