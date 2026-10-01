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
    { name: 'Trần Nam Thành', dob: '22/01/1974', ngayBatDau: '16/12/1996', chucdanh: 'Trưởng ca sửa chữa điện', thangbang: 'D1.2', bac: 'KS-5/6', hesoCD: 4.7, phucap: 'catruong', schedule: 'HC', offset: 0, kipId: null, ghiChu: '', allow: { m3: false, pct5: false, neg5: false, ksg: false } },
    { name: 'Tạ Quốc Hiệp', dob: '05/09/1971', ngayBatDau: '01/08/1998', chucdanh: 'CN SC điện - TT', thangbang: 'A2.N2', bac: 'CN-5/5', hesoCD: 2.78, phucap: 'totruong', schedule: 'TAM', offset: 1, kipId: 'A', ghiChu: '', allow: { m3: true, pct5: false, neg5: false, ksg: false } },
    { name: 'Nguyễn Đức Kiên', dob: '13/08/1984', ngayBatDau: '01/11/2007', chucdanh: 'CN SC điện - TT', thangbang: 'A2.N2', bac: 'CN-4/5', hesoCD: 2.78, phucap: 'totruong', schedule: 'TAM', offset: 1, kipId: 'D', ghiChu: '', allow: { m3: true, pct5: false, neg5: false, ksg: false } },
    { name: 'Lê Văn Tú', dob: '19/05/1984', ngayBatDau: '01/11/2007', chucdanh: 'CN SC điện - TT', thangbang: 'A2.N2', bac: 'CN-4/5', hesoCD: 2.78, phucap: 'totruong', schedule: 'TAM', offset: 1, kipId: 'B', ghiChu: '', allow: { m3: false, pct5: false, neg5: false, ksg: false } },
    { name: 'Nguyễn Văn Luất', dob: '02/03/1965', ngayBatDau: '01/12/1982', leftAfter: '2026-09', chucdanh: 'KS SC điện', thangbang: 'D1.2', bac: 'KS-6/6', hesoCD: 3.25, phucap: 'none', schedule: 'TAM', offset: 1, kipId: 'B', ghiChu: '', allow: { m3: false, pct5: false, neg5: false, ksg: false } },
    { name: 'Nguyễn Hữu Hùng', dob: '02/08/1987', ngayBatDau: '01/11/2007', chucdanh: 'CN SC điện', thangbang: 'A2.N2', bac: 'CN-4/5', hesoCD: 2.58, phucap: 'none', schedule: 'TAM', offset: 1, kipId: 'A', ghiChu: '', allow: { m3: false, pct5: false, neg5: false, ksg: false } },
    { name: 'Nguyễn Đức Hùng', dob: '03/09/1975', ngayBatDau: '15/09/1998', chucdanh: 'KS SC điện', thangbang: 'D1.2', bac: 'KS-6/6', hesoCD: 3.25, phucap: 'none', schedule: 'TAM', offset: 1, kipId: 'D', ghiChu: '', allow: { m3: false, pct5: false, neg5: false, ksg: false } },
    { name: 'Tạ Ngọc Bách', dob: '20/11/1976', ngayBatDau: '01/04/1998', chucdanh: 'CN SC điện', thangbang: 'A2.N2', bac: 'CN-4/5', hesoCD: 2.58, phucap: 'none', schedule: 'TAM', offset: 1, kipId: 'C', ghiChu: '', allow: { m3: false, pct5: false, neg5: false, ksg: true } },
    { name: 'Nguyễn Quang Hiếu', dob: '30/12/1986', ngayBatDau: '10/01/2007', chucdanh: 'CN SC điện', thangbang: 'A2.N2', bac: 'CN-3/5', hesoCD: 2.58, phucap: 'none', schedule: 'TAM', offset: 1, kipId: 'C', ghiChu: '', allow: { m3: false, pct5: true, neg5: false, ksg: false } },
    { name: 'Đặng Thế Hưng', dob: '02/06/1990', ngayBatDau: '15/04/2013', chucdanh: 'KS SC điện', thangbang: 'D1.2', bac: 'KS-2/6', hesoCD: 3.25, phucap: 'none', schedule: 'HC', offset: 0, kipId: null, ghiChu: '', allow: { m3: false, pct5: false, neg5: false, ksg: false } }
  ];
  return list.map((e, i) => Object.assign({ id: 'nv' + (i + 1) }, e));
}

// Nguon du lieu goc lay tu file "34Phep_Le_Bu.xlsx" nguoi dung cung cap (sheet "Common", cot "Nam bat dau"),
// da doi chieu khop 100% voi cot "So ngay phep duoc nghi" (sheet "Nghi_phep") theo cong thuc luat Lao dong
// ben duoi (xem legalLeaveDays trong server.js/app.js). Dung de TU DONG DIEN cho du lieu da co san (migration),
// khong ghi de neu nhan su da duoc nhap tay gia tri khac.
// Khoa bang ten + id ("nv1".."nv10", DUNG THU TU nhu defaultEmployees() o tren) - co ca 2 duong de doi
// chieu, vi ten tieng Viet co dau trong du lieu THAT (go qua UI/IME tu truoc) co the luu o 1 dang Unicode
// to hop khac voi chuoi go trong file nguon nay (NFC vs NFD) khien so sanh '===' truc tiep bi sai lech du
// nhin-y-het-nhau - id thi chac chan khong dinh van de font/dau nay.
const NGAYBATDAU_BY_ID = {
  nv1: '16/12/1996', nv2: '01/08/1998', nv3: '01/11/2007', nv4: '01/11/2007', nv5: '01/12/1982',
  nv6: '01/11/2007', nv7: '15/09/1998', nv8: '01/04/1998', nv9: '10/01/2007', nv10: '15/04/2013'
};
const NGAYBATDAU_BY_NAME = {
  'Trần Nam Thành': '16/12/1996',
  'Tạ Quốc Hiệp': '01/08/1998',
  'Nguyễn Đức Kiên': '01/11/2007',
  'Lê Văn Tú': '01/11/2007',
  'Nguyễn Văn Luất': '01/12/1982',
  'Nguyễn Hữu Hùng': '01/11/2007',
  'Nguyễn Đức Hùng': '15/09/1998',
  'Tạ Ngọc Bách': '01/04/1998',
  'Nguyễn Quang Hiếu': '10/01/2007',
  'Đặng Thế Hưng': '15/04/2013'
};
// Thang CUOI CUNG con lam viec cua nhan su da/sap nghi - tu thang NGAY SAU do tro di coi nhu khong con
// active nua (xem isActiveInMonth trong server.js/app.js). Theo yeu cau: "chi ap dung tu thang 10" (2026).
// id nv5 = Nguyễn Văn Luất trong defaultEmployees() hien tai (thu tu thu 5 trong danh sach).
const LEFTAFTER_BY_ID = { nv5: '2026-09' };
const LEFTAFTER_BY_NAME = {
  'Nguyễn Văn Luất': '2026-09'
};
// So sanh ten khong phan biet dang Unicode to hop (NFC) - de "Nguyễn Văn Luất" go qua UI/IME tu truoc
// van khop voi chuoi viet san trong file nay du 2 ben dung dang bieu dien Unicode khac nhau.
function normName(s) { return String(s || '').normalize('NFC').trim(); }
const NGAYBATDAU_BY_NAME_NORM = {};
Object.keys(NGAYBATDAU_BY_NAME).forEach(k => { NGAYBATDAU_BY_NAME_NORM[normName(k)] = NGAYBATDAU_BY_NAME[k]; });
const LEFTAFTER_BY_NAME_NORM = {};
Object.keys(LEFTAFTER_BY_NAME).forEach(k => { LEFTAFTER_BY_NAME_NORM[normName(k)] = LEFTAFTER_BY_NAME[k]; });

// Dien bo sung ngayBatDau/leftAfter cho du lieu DA CO SAN tu truoc (ca state.employees goc lan moi
// state.months[...].employees - vi tung thang la 1 ban doc lap) - CHI dien khi nhan su chua co gia tri
// nao (khong ghi de neu da nhap/sua tay), nen goi lai nhieu lan (moi lan khoi dong server) la an toan.
// Thu theo ID truoc (chac chan nhat, khong dinh van de font/dau), roi moi thu theo ten (co chuan hoa NFC)
// neu id la khong khop (vd nhan su duoc tao lai tu dau voi id khac).
function migrateEmployeeFields(state) {
  let migrated = false;
  let notFound = [];
  function patchList(list) {
    if (!Array.isArray(list)) return;
    list.forEach(e => {
      const byId_nbd = NGAYBATDAU_BY_ID[e.id];
      const byName_nbd = NGAYBATDAU_BY_NAME_NORM[normName(e.name)];
      if (!e.ngayBatDau && (byId_nbd || byName_nbd)) { e.ngayBatDau = byId_nbd || byName_nbd; migrated = true; }
      const byId_la = LEFTAFTER_BY_ID[e.id];
      const byName_la = LEFTAFTER_BY_NAME_NORM[normName(e.name)];
      if (!e.leftAfter && (byId_la || byName_la)) { e.leftAfter = byId_la || byName_la; migrated = true; }
      if (!e.ngayBatDau && !byId_nbd && !byName_nbd) notFound.push(`${e.id}/${e.name}`);
    });
  }
  patchList(state.employees);
  if (state.months) Object.keys(state.months).forEach(k => patchList(state.months[k].employees));
  if (notFound.length) {
    console.warn('[migration] Không khớp được ngayBatDau cho:', Array.from(new Set(notFound)).join(', '),
      '— có thể nhân sự đã đổi tên/id khác với dữ liệu gốc, cần nhập tay ở tab Common.');
  }
  return migrated;
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
    registrations: {},
    monthlyAllowances: {},
    mealOverrides: {},
    phepOverrides: {},
    // Tu ban co "Common theo tung thang": moi thang co 1 ban rieng cua employees/kips/bacTable/settings,
    // key dang "YYYY-MM". Cac truong employees/kips/bacTable/settings o goc object nay CHI con dung lam
    // "hat giong" mac dinh cho lan dau tien 1 thang bat ky duoc tao (xem getOrCreateMonthCommon trong server.js),
    // khong con duoc doc truc tiep de tinh cong/luong nua.
    months: {}
  };
}

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

const BACKUP_DIR = path.join(DATA_DIR, 'backups');
const SNAPSHOT_MIN_INTERVAL_MS = 10 * 60 * 1000; // toi da 1 ban snapshot moi 10 phut
const SNAPSHOT_KEEP = 50; // giu lai 50 ban gan nhat (~vai ngay den vai tuan tuy tan suat sua)
let lastSnapshotAt = 0;

function writeSnapshotIfDue(dbObj) {
  const now = Date.now();
  if (now - lastSnapshotAt < SNAPSHOT_MIN_INTERVAL_MS) return;
  lastSnapshotAt = now;
  try {
    if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });
    const stamp = new Date(now).toISOString().replace(/[:.]/g, '-');
    fs.writeFileSync(path.join(BACKUP_DIR, `snapshot_${stamp}.json`), JSON.stringify(dbObj), 'utf8');
    const files = fs.readdirSync(BACKUP_DIR).filter(f => f.startsWith('snapshot_')).sort();
    while (files.length > SNAPSHOT_KEEP) {
      fs.unlinkSync(path.join(BACKUP_DIR, files.shift()));
    }
  } catch (e) {
    console.error('Không tạo được snapshot tự động:', e.message);
  }
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
  // Migration: dien them cac truong moi neu ban db.json cu (truoc khi co tinh nang nay) chua co
  let migrated = false;
  if (!cache.state.monthlyAllowances) { cache.state.monthlyAllowances = {}; migrated = true; }
  if (!cache.state.mealOverrides) { cache.state.mealOverrides = {}; migrated = true; }
  if (!cache.state.phepOverrides) { cache.state.phepOverrides = {}; migrated = true; }
  if (!cache.state.months) { cache.state.months = {}; migrated = true; }
  if (migrateEmployeeFields(cache.state)) migrated = true;
  if (migrated) save(cache);
  return cache;
}

function save(dbObj) {
  ensureDataDir();
  const tmp = DB_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(dbObj, null, 2), 'utf8');
  fs.renameSync(tmp, DB_FILE);
  cache = dbObj;
  writeSnapshotIfDue(dbObj);
}

function getDb() { return load(); }
function persist() { save(cache); }

function listSnapshots() {
  if (!fs.existsSync(BACKUP_DIR)) return [];
  return fs.readdirSync(BACKUP_DIR).filter(f => f.startsWith('snapshot_')).sort().reverse();
}

function readSnapshot(filename) {
  const p = path.join(BACKUP_DIR, path.basename(filename));
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

module.exports = { getDb, persist, defaultState, DATA_DIR, listSnapshots, readSnapshot, migrateEmployeeFields };
