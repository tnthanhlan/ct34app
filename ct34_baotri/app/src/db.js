const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'baotri.db');
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('admin','user')),
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS engine_fields (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  field_key TEXT UNIQUE NOT NULL,
  label TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_display_name INTEGER NOT NULL DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS engines (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ma_thiet_bi TEXT UNIQUE,
  data_json TEXT DEFAULT '{}',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS maintenance_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  engine_id INTEGER NOT NULL REFERENCES engines(id) ON DELETE CASCADE,
  ngay_thuc_hien TEXT,
  hang_muc TEXT,
  nguoi_thuc_hien TEXT,
  noi_dung TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_logs_engine ON maintenance_logs(engine_id);
CREATE INDEX IF NOT EXISTS idx_logs_date ON maintenance_logs(ngay_thuc_hien);
CREATE INDEX IF NOT EXISTS idx_logs_hangmuc ON maintenance_logs(hang_muc);
`);

// Gieo sẵn danh sách trường mặc định (khớp cấu trúc file Motors_CT32-34) nếu đây là lần chạy đầu tiên,
// chưa có trường nào được định nghĩa. Sau đó admin có thể tự thêm/sửa/xóa/sắp xếp lại thoải mái.
function seedDefaultEngineFields() {
  const count = db.prepare('SELECT COUNT(*) c FROM engine_fields').get().c;
  if (count > 0) return;
  const defaults = [
    ['stt', 'TT'],
    ['ten_goi', 'Tên gọi'],
    ['kich_thuoc_dmm', 'Rộng x Dài - Dmm'],
    ['kich_thuoc_wm', 'Rộng x Dài - Wm'],
    ['hang', 'Hãng'],
    ['dong_co_type', 'Động cơ - Type'],
    ['dong_co_p_kw', 'Động cơ - P (kW)'],
    ['dong_co_u_v', 'Động cơ - U (V)'],
    ['dong_co_dau_noi', 'Động cơ - Δ/Υ'],
    ['dong_co_i_a', 'Động cơ - I (A)'],
    ['dong_co_n_rpm', 'Động cơ - n (rpm)'],
    ['dong_co_cosphi', 'Động cơ - Cosφ'],
    ['dong_co_brake', 'Động cơ - Brake'],
    ['dong_co_oil_litre', 'Động cơ - Oil (Litre)'],
    ['dong_co_m_kg', 'Động cơ - m (Kg)'],
    ['dong_co_bearing', 'Động cơ - Bearing'],
    ['dong_co_thong_so', 'Động cơ - Thông số'],
    ['nang_suat_th', 'Năng suất (t/h)'],
    ['con_lan', 'Con lăn'],
    ['ghi_chu', 'Ghi chú'],
    ['nhu_cau_khan_cap', 'Nhu cầu - Khẩn cấp'],
    ['nhu_cau_thuong', 'Nhu cầu - Thường'],
  ];
  const insert = db.prepare('INSERT INTO engine_fields (field_key, label, sort_order, is_display_name) VALUES (?, ?, ?, ?)');
  defaults.forEach(([key, label], i) => insert.run(key, label, i, key === 'ten_goi' ? 1 : 0));
}
seedDefaultEngineFields();

module.exports = db;
