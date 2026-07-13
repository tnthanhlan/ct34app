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

CREATE TABLE IF NOT EXISTS engines (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ma_dong_co TEXT UNIQUE,
  ten_thiet_bi TEXT,
  vi_tri TEXT,
  cong_suat TEXT,
  dien_ap TEXT,
  dong_dien TEXT,
  hang_sx TEXT,
  model TEXT,
  so_serial TEXT,
  ngay_lap_dat TEXT,
  tinh_trang TEXT DEFAULT 'dang_hoat_dong',
  ghi_chu TEXT,
  extra_json TEXT DEFAULT '{}',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS maintenance_tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  engine_id INTEGER NOT NULL REFERENCES engines(id) ON DELETE CASCADE,
  loai_cong_viec TEXT NOT NULL CHECK(loai_cong_viec IN ('ve_sinh','bao_duong','bao_tri')),
  mo_ta TEXT,
  chu_ky_ngay INTEGER,
  ngay_thuc_hien_gan_nhat TEXT,
  ngay_den_han TEXT,
  nguoi_phu_trach TEXT,
  trang_thai TEXT NOT NULL DEFAULT 'cho_xu_ly' CHECK(trang_thai IN ('cho_xu_ly','da_xong','qua_han')),
  extra_json TEXT DEFAULT '{}',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS maintenance_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id INTEGER NOT NULL REFERENCES maintenance_tasks(id) ON DELETE CASCADE,
  ngay_thuc_hien TEXT NOT NULL,
  nguoi_thuc_hien TEXT,
  ket_qua TEXT,
  ghi_chu TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_tasks_engine ON maintenance_tasks(engine_id);
CREATE INDEX IF NOT EXISTS idx_tasks_due ON maintenance_tasks(ngay_den_han);
CREATE INDEX IF NOT EXISTS idx_logs_task ON maintenance_logs(task_id);
`);

module.exports = db;
