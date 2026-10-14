const express = require('express');
const db = require('../db');
const { requireAuth } = require('../auth');
const { materialToObject } = require('../materialFields');

const router = express.Router();
router.use(requireAuth);

const NGUON_VALUES = new Set(['NM', 'XG', 'TH']);

function materialInfo(materialId, materialName, materialDataJson) {
  const obj = materialToObject({ id: materialId, name: materialName, data_json: materialDataJson });
  return { material_name: obj.name, material_unit: obj.don_vi_tinh || null, ma_kho: obj.ma_kho || null };
}

function importRowToObject(r) {
  return {
    id: r.id,
    material_id: r.material_id,
    ...materialInfo(r.material_id, r.name, r.material_data_json),
    ngay_nhap: r.ngay_nhap,
    quantity: r.quantity,
    nguon: r.nguon,
    ghi_chu: r.ghi_chu,
    created_by: r.created_by,
    created_at: r.created_at,
    updated_at: r.updated_at,
  };
}

// ---------- NHẬP vật tư (gõ tay) ----------

// Danh sách bản ghi NHẬP, loc theo khoang ngay / vat tu / nguon neu co
router.get('/imports', (req, res) => {
  const { from, to, material_id, nguon } = req.query;
  const where = [];
  const params = [];
  if (from) { where.push('mi.ngay_nhap >= ?'); params.push(from); }
  if (to) { where.push('mi.ngay_nhap <= ?'); params.push(to); }
  if (material_id) { where.push('mi.material_id = ?'); params.push(material_id); }
  if (nguon) { where.push('mi.nguon = ?'); params.push(nguon); }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const rows = db.prepare(`
    SELECT mi.*, m.name, m.data_json as material_data_json
    FROM material_imports mi
    JOIN materials m ON m.id = mi.material_id
    ${whereSql}
    ORDER BY mi.ngay_nhap DESC, mi.id DESC
  `).all(...params);
  res.json({ items: rows.map(importRowToObject) });
});

router.post('/imports', (req, res) => {
  const { material_id, ngay_nhap, quantity, nguon, ghi_chu } = req.body;
  const qty = Number(quantity);
  if (!material_id) return res.status(400).json({ error: 'Cần chọn vật tư' });
  if (!(qty > 0)) return res.status(400).json({ error: 'Số lượng phải lớn hơn 0' });
  const nguonVal = NGUON_VALUES.has(nguon) ? nguon : 'NM';
  const material = db.prepare('SELECT id FROM materials WHERE id = ?').get(material_id);
  if (!material) return res.status(400).json({ error: 'Không tìm thấy vật tư' });
  const info = db.prepare(`
    INSERT INTO material_imports (material_id, ngay_nhap, quantity, nguon, ghi_chu, created_by)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(material_id, ngay_nhap || null, qty, nguonVal, ghi_chu || null, (req.session.user && req.session.user.email) || null);
  res.status(201).json({ id: info.lastInsertRowid });
});

router.put('/imports/:id', (req, res) => {
  const { material_id, ngay_nhap, quantity, nguon, ghi_chu } = req.body;
  const qty = Number(quantity);
  if (!material_id) return res.status(400).json({ error: 'Cần chọn vật tư' });
  if (!(qty > 0)) return res.status(400).json({ error: 'Số lượng phải lớn hơn 0' });
  const nguonVal = NGUON_VALUES.has(nguon) ? nguon : 'NM';
  const material = db.prepare('SELECT id FROM materials WHERE id = ?').get(material_id);
  if (!material) return res.status(400).json({ error: 'Không tìm thấy vật tư' });
  const info = db.prepare(`
    UPDATE material_imports SET
      material_id = ?, ngay_nhap = ?, quantity = ?, nguon = ?, ghi_chu = ?, updated_at = datetime('now')
    WHERE id = ?
  `).run(material_id, ngay_nhap || null, qty, nguonVal, ghi_chu || null, req.params.id);
  if (info.changes === 0) return res.status(404).json({ error: 'Không tìm thấy bản ghi nhập' });
  res.json({ ok: true });
});

router.delete('/imports/:id', (req, res) => {
  const info = db.prepare('DELETE FROM material_imports WHERE id = ?').run(req.params.id);
  if (info.changes === 0) return res.status(404).json({ error: 'Không tìm thấy bản ghi nhập' });
  res.json({ ok: true });
});

// ---------- XUẤT vật tư (chỉ xem - tự lấy từ lịch sử Bảo trì, không nhập tay ở đây) ----------

router.get('/exports', (req, res) => {
  const { from, to, material_id, export_type, q = '' } = req.query;
  const where = [];
  const params = [];
  if (from) { where.push('l.ngay_thuc_hien >= ?'); params.push(from); }
  if (to) { where.push('l.ngay_thuc_hien <= ?'); params.push(to); }
  if (material_id) { where.push('lm.material_id = ?'); params.push(material_id); }
  if (export_type) { where.push('lm.export_type = ?'); params.push(export_type); }
  if (q) {
    where.push('(lower_vn(m.name) LIKE ? OR lower_vn(m.data_json) LIKE ? OR lower_vn(e.ma_thiet_bi) LIKE ?)');
    const like = `%${q.toLowerCase()}%`;
    params.push(like, like, like);
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const rows = db.prepare(`
    SELECT
      lm.id, lm.log_id, lm.material_id, lm.quantity, lm.export_type,
      m.name, m.data_json as material_data_json,
      l.ngay_thuc_hien as ngay_xuat, l.hang_muc, l.noi_dung, l.nguoi_thuc_hien,
      e.ma_thiet_bi
    FROM maintenance_log_materials lm
    JOIN materials m ON m.id = lm.material_id
    JOIN maintenance_logs l ON l.id = lm.log_id
    JOIN engines e ON e.id = l.engine_id
    ${whereSql}
    ORDER BY l.ngay_thuc_hien DESC, lm.id DESC
  `).all(...params);

  const items = rows.map(r => ({
    id: r.id,
    log_id: r.log_id,
    material_id: r.material_id,
    ...materialInfo(r.material_id, r.name, r.material_data_json),
    ngay_xuat: r.ngay_xuat,
    quantity: r.quantity,
    export_type: r.export_type,
    mo_ta: [r.hang_muc, r.noi_dung].filter(Boolean).join(' - '),
    nguoi_thuc_hien: r.nguoi_thuc_hien,
    ma_thiet_bi: r.ma_thiet_bi,
  }));
  res.json({ items });
});

module.exports = router;
