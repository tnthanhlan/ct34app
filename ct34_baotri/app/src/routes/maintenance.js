const express = require('express');
const db = require('../db');
const { requireAuth, requireAdmin } = require('../auth');
const { displayLabel } = require('../engineFields');

const router = express.Router();
router.use(requireAuth);

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
    where.push('(e.ma_thiet_bi LIKE ? OR e.data_json LIKE ? OR t.noi_dung LIKE ? OR t.hang_muc LIKE ?)');
    const like = `%${q}%`;
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

  const items = rows.map(r => {
    const { engine_data_json, ...rest } = r;
    return { ...rest, ten_goi: displayLabel(engine_data_json) };
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
  res.json({ ...rest, ten_goi: displayLabel(engine_data_json) });
});

router.post('/', (req, res) => {
  const { engine_id, ngay_thuc_hien, hang_muc, nguoi_thuc_hien, noi_dung } = req.body;
  if (!engine_id) return res.status(400).json({ error: 'Thiếu engine_id' });
  const info = db.prepare(`
    INSERT INTO maintenance_logs (engine_id, ngay_thuc_hien, hang_muc, nguoi_thuc_hien, noi_dung)
    VALUES (?, ?, ?, ?, ?)
  `).run(engine_id, ngay_thuc_hien || null, (hang_muc || '').trim().normalize('NFC') || null, nguoi_thuc_hien || null, noi_dung || null);
  res.status(201).json({ id: info.lastInsertRowid });
});

router.put('/:id', (req, res) => {
  const { ngay_thuc_hien, hang_muc, nguoi_thuc_hien, noi_dung } = req.body;
  const info = db.prepare(`
    UPDATE maintenance_logs SET
      ngay_thuc_hien = ?, hang_muc = ?, nguoi_thuc_hien = ?, noi_dung = ?, updated_at = datetime('now')
    WHERE id = ?
  `).run(ngay_thuc_hien || null, (hang_muc || '').trim().normalize('NFC') || null, nguoi_thuc_hien || null, noi_dung || null, req.params.id);
  if (info.changes === 0) return res.status(404).json({ error: 'Không tìm thấy bản ghi' });
  res.json({ ok: true });
});

router.delete('/:id', requireAdmin, (req, res) => {
  const info = db.prepare('DELETE FROM maintenance_logs WHERE id = ?').run(req.params.id);
  if (info.changes === 0) return res.status(404).json({ error: 'Không tìm thấy bản ghi' });
  res.json({ ok: true });
});

module.exports = router;
