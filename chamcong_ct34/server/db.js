// Kho du lieu dang file JSON, don gian, khong can build native module (de dong Docker tren Alpine).
// Voi quy mo ~10 nhan su + du lieu cham cong hang thang, file JSON nho, doc/ghi dong bo la du nhanh.
const fs = require('fs');
const path = require('path');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');

function defaultBacTable() {
  return [
    ['KS-1/6', 1.17], ['KS-2/6', 1.26], ['KS-3/6', 1.35], ['KS-4/6', 1.44], ['KS-5/6', 1.53], ['KS-6/6', 1.62],
    ['CN-1/5', 1.10], ['CN-2/5', 1.17], ['CN-3/5', 1.25], ['CN-4/5', 1.34], ['CN-5/5', 1.45]
  ];
}

function defaultEmployees() {
  const list = [
    { name: 'Trần Nam Thành', dob: '22/01/1974', chucdanh: 'Trưởng ca sửa chữa điện', thangbang: 'D1.2', bac: 'KS-5/6', hesoCD: 4.7, phucap: 'catruong', schedule: 'HC', offset: 0, kipId: null, allow: { m3: false, pct5: false, ksg: false } },
    { name: 'Tạ Quốc Hiệp', dob: '05/09/1971', chucdanh: 'CN SC điện - TT', thangbang: 'A2.N2', bac: 'CN-5/5', hesoCD: 2.78, phucap: 'totruong', schedule: 'TAM', offset: 1, kipId: 'A', allow: { m3: true, pct5: false, ksg: false } },
    { name: 'Nguyễn Đức Kiên', dob: '13/08/1984', chucdanh: 'CN SC điện - TT', thangbang: 'A2.N2', bac: 'CN-4/5', hesoCD: 2.78, phucap: 'totruong', schedule: 'TAM', offset: 1, kipId: 'D', allow: { m3: true, pct5: false, ksg: false } },
    { name: 'Lê Văn Tú', dob: '19/05/1984', chucdanh: 'CN SC điện - TT', thangbang: 'A2.N2', bac: 'CN-4/5', hesoCD: 2.78, phucap: 'totruong', schedule: 'TAM', offset: 1, kipId: 'B', allow: { m3: false, pct5: false, ksg: false } },
    { name: 'Nguyễn Văn Luất', dob: '02/03/1965', chucdanh: 'KS SC điện', thangbang: 'D1.2', bac: 'KS-6/6', hesoCD: 3.25, phucap: 'none', schedule: 'TAM', offset: 1, kipId: 'B', allow: { m3: false, pct5: false, ksg: false } },
    { name: 'Nguyễn Hữu Hùng', dob: '02/08/1987', chucdanh: 'CN SC điện', thangbang: 'A2.N2', bac: 'CN-4/5', hesoCD: 2.58, phucap: 'none', schedule: 'TAM', offset: 1, kipId: 'A', allow: { m3: false, pct5: false, ksg: false } },
    { name: 'Nguyễn Đức Hùng', dob: '03/09/1975', chucdanh: 'KS SC điện', thangbang: 'D1.2', bac: 'KS-6/6', hesoCD: 3.25, phucap: 'none', schedule: 'TAM', offset: 1, kipId: 'D', allow: { m3: false, pct5: false, ksg: false } },
    { name: 'Tạ Ngọc Bách', dob: '20/11/1976', chucdanh: 'CN SC điện', thangbang: 'A2.N2', bac: 'CN-4/5', hesoCD: 2.58, phucap: 'none', schedule: 'TAM', offset: 1, kipId: 'C', allow: { m3: false, pct5: false, ksg: true } },
    { name: 'Nguyễn Quang Hiếu', dob: '30/12/1986', chucdanh: 'CN SC điện', thangbang: 'A2.N2', bac: 'CN-3/5', hesoCD: 2.58, phucap: 'none', schedule: 'TAM', offset: 1, kipId: 'C', allow: { m3: false, pct5: true, ksg: false } },
    { name: 'Đặng Thế Hưng', dob: '02/06/1990', chucdanh: 'KS SC điện', thangbang: 'D1.2', bac: 'KS-2/6', hesoCD: 3.25, phucap: 'none', schedule: 'TAM', offset: 1, kipId: null, allow: { m3: false, pct5: false, ksg: false } }
  ];
  return list.map((e, i) => Object.assign({ id: 'nv' + (i + 1) }, e));
}

function defaultState() {
  return {
    settings: { mucLuongToiThieu: 7482000, heSoTca: 0.1, heSoTtruong: 0.04, anchorDate: '2026-07-01' },
    bacTable: defaultBacTable(),
    employees: defaultEmployees(),
    kips: [
      { id: 'A', label: 'Kíp A', offset: 1, color: '#E4EEFB' },
      { id: 'B', label: 'Kíp B', offset: 3, color: '#E3F3E6' },
      { id: 'C', label: 'Kíp C', offset: 7, color: '#FBF0DC' },
      { id: 'D', label: 'Kíp D', offset: 5, color: '#F1E5F6' }
    ],
    grid: {},
    registrations: {}
  };
}

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

let cache = null;

function load() {
  if (cache) return cache;
  ensureDataDir();
  if (!fs.existsSync(DB_FILE)) {
    cache = { users: [], state: defaultState() };
    save(cache);
    return cache;
  }
  try {
    cache = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
  } catch (e) {
    console.error('Không đọc được db.json, khởi tạo lại từ mặc định:', e.message);
    cache = { users: [], state: defaultState() };
    save(cache);
  }
  return cache;
}

function save(dbObj) {
  ensureDataDir();
  const tmp = DB_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(dbObj, null, 2), 'utf8');
  fs.renameSync(tmp, DB_FILE);
  cache = dbObj;
}

function getDb() { return load(); }
function persist() { save(cache); }

module.exports = { getDb, persist, defaultState, DATA_DIR };
