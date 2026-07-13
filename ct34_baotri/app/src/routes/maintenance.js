const express = require('express');
const dayjs = require('dayjs');
const db = require('../db');
const { requireAuth } = require('../auth');

const router = express.Router();
router.use(requireAuth);

function recomputeStatus(task) {
  if (!task.ngay_den_han) return task.trang_thai || 'cho_xu_ly';
  const today = dayjs().startOf('day');
  const due = dayjs(task.ngay_den_han).startOf('day');
  if (task.trang_thai === 'da_xong') return 'da_xong';
  return today.isAfter(due) ? 'qua_han' : 'cho_xu_ly';
}

// Danh sách công việc, có thể lọc theo engine_id, loai_cong_viec, trang_thai
router.get('/', (req, res) => {
  const { engine_id, loai_cong_viec, trang_thai, q = '' } = req.query;
  let where = [];
  let params = [];

  if (engine_id) { where.push('t.engine_id = ?'); params.push(engine_id); }
  if (loai_cong_viec) { where.push('t.loai_cong_viec = ?'); params.push(loai_cong_viec); }
  if (trang_thai) { where.push('t.trang_thai = ?'); params.push(trang_thai); }
  if (q) {
    where.push('(e.ma_dong_co LIKE ? OR e.ten_thiet_bi LIKE ? OR t.mo_ta LIKE ?)');
    const like = `%${q}%`;
    params.push(like, like, like);
  }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const rows = db.prepare(`
    SELECT t.*, e.ma_dong_co, e.ten_thiet_bi, e.vi_tri
    FROM maintenance_tasks t
    JOIN engines e ON e.id = t.engine_id
    ${whereSql}
    ORDER BY t.ngay_den_han ASC
  `).all(...params);

  // cập nhật trạng thái quá hạn động (không ghi DB, chỉ hiển thị)
  const items = rows.map(r => ({ ...r, trang_thai_hien_thi: recomputeStatus(r) }));
  res.json({ items });
});

router.get('/:id', (req, res) => {
  const row = db.prepare(`
    SELECT t.*, e.ma_dong_co, e.ten_thiet_bi FROM maintenance_tasks t
    JOIN engines e ON e.id = t.engine_id WHERE t.id = ?
  `).get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Không tìm thấy công việc' });
  const logs = db.prepare('SELECT * FROM maintenance_logs WHERE task_id = ? ORDER BY ngay_thuc_hien DESC').all(req.params.id);
  res.json({ ...row, logs });
});

router.post('/', (req, res) => {
  const { engine_id, loai_cong_viec, mo_ta, chu_ky_ngay, ngay_thuc_hien_gan_nhat, ngay_den_han, nguoi_phu_trach } = req.body;
  if (!engine_id || !loai_cong_viec) return res.status(400).json({ error: 'Thiếu engine_id hoặc loai_cong_viec' });

  const stmt = db.prepare(`
    INSERT INTO maintenance_tasks
      (engine_id, loai_cong_viec, mo_ta, chu_ky_ngay, ngay_thuc_hien_gan_nhat, ngay_den_han, nguoi_phu_trach, trang_thai)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'cho_xu_ly')
  `);
  const info = stmt.run(engine_id, loai_cong_viec, mo_ta || null, chu_ky_ngay || null,
    ngay_thuc_hien_gan_nhat || null, ngay_den_han || null, nguoi_phu_trach || null);
  res.status(201).json({ id: info.lastInsertRowid });
});

router.put('/:id', (req, res) => {
  const { loai_cong_viec, mo_ta, chu_ky_ngay, ngay_thuc_hien_gan_nhat, ngay_den_han, nguoi_phu_trach, trang_thai } = req.body;
  const stmt = db.prepare(`
    UPDATE maintenance_tasks SET
      loai_cong_viec = COALESCE(?, loai_cong_viec),
      mo_ta = ?,
      chu_ky_ngay = ?,
      ngay_thuc_hien_gan_nhat = ?,
      ngay_den_han = ?,
      nguoi_phu_trach = ?,
      trang_thai = COALESCE(?, trang_thai),
      updated_at = datetime('now')
    WHERE id = ?
  `);
  const info = stmt.run(loai_cong_viec || null, mo_ta || null, chu_ky_ngay || null,
    ngay_thuc_hien_gan_nhat || null, ngay_den_han || null, nguoi_phu_trach || null,
    trang_thai || null, req.params.id);
  if (info.changes === 0) return res.status(404).json({ error: 'Không tìm thấy công việc' });
  res.json({ ok: true });
});

// Đánh dấu đã hoàn thành -> tạo log + tính ngày đến hạn kế tiếp theo chu kỳ
router.post('/:id/complete', (req, res) => {
  const task = db.prepare('SELECT * FROM maintenance_tasks WHERE id = ?').get(req.params.id);
  if (!task) return res.status(404).json({ error: 'Không tìm thấy công việc' });

  const { nguoi_thuc_hien, ket_qua, ghi_chu, ngay_thuc_hien } = req.body;
  const doneDate = ngay_thuc_hien || dayjs().format('YYYY-MM-DD');

  db.prepare(`
    INSERT INTO maintenance_logs (task_id, ngay_thuc_hien, nguoi_thuc_hien, ket_qua, ghi_chu)
    VALUES (?, ?, ?, ?, ?)
  `).run(task.id, doneDate, nguoi_thuc_hien || null, ket_qua || null, ghi_chu || null);

  let nextDue = null;
  if (task.chu_ky_ngay) {
    nextDue = dayjs(doneDate).add(task.chu_ky_ngay, 'day').format('YYYY-MM-DD');
  }

  db.prepare(`
    UPDATE maintenance_tasks SET
      ngay_thuc_hien_gan_nhat = ?,
      ngay_den_han = COALESCE(?, ngay_den_han),
      trang_thai = CASE WHEN ? IS NOT NULL THEN 'cho_xu_ly' ELSE 'da_xong' END,
      updated_at = datetime('now')
    WHERE id = ?
  `).run(doneDate, nextDue, nextDue, task.id);

  res.json({ ok: true, next_due: nextDue });
});

router.delete('/:id', (req, res) => {
  const info = db.prepare('DELETE FROM maintenance_tasks WHERE id = ?').run(req.params.id);
  if (info.changes === 0) return res.status(404).json({ error: 'Không tìm thấy công việc' });
  res.json({ ok: true });
});

module.exports = router;
