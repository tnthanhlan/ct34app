const path = require('path');
const fs = require('fs');

/* Doc file options.json cua Home Assistant Add-on (neu co) va gan vao bien moi truong,
   de nguoi dung chi can dien trong tab Configuration cua add-on, khong can SSH/exec vao container. */
(function loadHaOptions(){
  const optPath = '/data/options.json';
  if (!fs.existsSync(optPath)) return;
  try{
    const opts = JSON.parse(fs.readFileSync(optPath, 'utf8'));
    if (opts.jwt_secret && !process.env.JWT_SECRET) process.env.JWT_SECRET = opts.jwt_secret;
    if (opts.export_dir && !process.env.EXPORT_DIR) process.env.EXPORT_DIR = opts.export_dir;
    if (opts.admin_password) process.env.SEED_ADMIN_PASSWORD = opts.admin_password;
    if (opts.user_password) process.env.SEED_USER_PASSWORD = opts.user_password;
    if (opts.port) process.env.PORT = String(opts.port);
  }catch(e){
    console.error('Không đọc được /data/options.json:', e.message);
  }
})();

const express = require('express');
const cookieParser = require('cookie-parser');
const cron = require('node-cron');
const ExcelJS = require('exceljs');

const { getDb, persist, listSnapshots, readSnapshot } = require('./db');
const {
  hashPassword, verifyPassword, issueToken, setSessionCookie, clearSessionCookie,
  requireAuth, requireAdmin
} = require('./auth');

const ADMIN_EMAIL = 'tnthanhlan@gmail.com';
const USER_EMAIL = 'doisuachuact34@gmail.com';

/* Tu dong tao 2 tai khoan Admin/User luc khoi dong lan dau, neu chua co ai trong DB
   va da nhap mat khau trong tab Configuration cua add-on (SEED_ADMIN_PASSWORD/SEED_USER_PASSWORD). */
(function autoSeedUsers(){
  const db = getDb();
  if (db.users.length > 0) return;
  const adminPass = process.env.SEED_ADMIN_PASSWORD;
  const userPass = process.env.SEED_USER_PASSWORD;
  if (!adminPass || !userPass) {
    console.warn('CHƯA CÓ TÀI KHOẢN NÀO và chưa cấu hình admin_password/user_password — vào tab Configuration của add-on để đặt mật khẩu, rồi khởi động lại add-on. Hoặc chạy "node seed.js" thủ công.');
    return;
  }
  db.users.push({ email: ADMIN_EMAIL, passwordHash: hashPassword(adminPass), role: 'admin' });
  db.users.push({ email: USER_EMAIL, passwordHash: hashPassword(userPass), role: 'user' });
  persist();
  console.log('✓ Đã tự tạo 2 tài khoản Admin/User từ cấu hình add-on.');
})();

const PORT = process.env.PORT || 8099;
const EXPORT_DIR = process.env.EXPORT_DIR || path.join(__dirname, '..', 'exports');

const app = express();
app.use(express.json({ limit: '2mb' }));
app.use(cookieParser());

/* ---------------- Cac ham dung chung (khop cong thuc voi ban HTML truoc) ---------------- */
const CYCLE_TAM = ['X', 'X', '', 'X', 'X', 'XĐ', 'XĐ', ''];
const CYCLE_CA = ['K1', 'K1', '', 'K2', 'K2', 'KD', 'KD', ''];
const CODE_ORDER = ['', 'X', 'K1', 'K2', 'KD', 'XĐ', 'XL', 'XLĐ', 'K1L', 'K2L', 'KDL', 'F', 'L', 'DL', 'Rc', 'Ro', 'Ô', 'TS', 'TN', 'B', 'BL', 'CT'];
const WORK_CODES = ['X', 'XĐ', 'XL', 'XLĐ', 'K1', 'K2', 'KD', 'K1L', 'K2L', 'KDL'];

function mod8(n) { return ((n % 8) + 8) % 8; }
function daysInMonth(y, m) { return new Date(y, m + 1, 0).getDate(); }
function fmtDate(y, m, d) { return y + '-' + String(m + 1).padStart(2, '0') + '-' + String(d).padStart(2, '0'); }
function isKS(bac) { return (bac || '').toUpperCase().startsWith('KS'); }

function daysSinceAnchor(state, y, m, d) {
  const anchor = new Date((state.settings.anchorDate || '2026-07-01') + 'T00:00:00');
  const dt = new Date(y, m, d);
  return Math.round((dt - anchor) / 86400000);
}
function resolvedOffset(state, emp) {
  if (emp.kipId) {
    const k = state.kips.find(x => x.id === emp.kipId);
    if (k) return Number(k.offset || 0);
  }
  return Number(emp.offset || 0);
}
function computeAutoCode(state, emp, y, m, d) {
  if (emp.schedule === 'HC') {
    const dow = new Date(y, m, d).getDay();
    return (dow === 0 || dow === 6) ? '' : 'X';
  }
  const idx = mod8(daysSinceAnchor(state, y, m, d) + resolvedOffset(state, emp));
  const useShiftCodes = (emp.schedule === 'CA') || (emp.schedule === 'TAM' && emp.kipId);
  return (useShiftCodes ? CYCLE_CA : CYCLE_TAM)[idx];
}
function computeFinalCode(state, emp, y, m, d) {
  const dateStr = fmtDate(y, m, d);
  const manual = state.grid[emp.id] && state.grid[emp.id][dateStr];
  if (manual) return manual;
  const reg = state.registrations[dateStr];
  if (reg) {
    if (reg.phep && reg.phep.includes(emp.id)) return 'F';
    if (reg.swaps) {
      for (const pair of reg.swaps) {
        let partnerId = null;
        if (pair[0] === emp.id) partnerId = pair[1];
        else if (pair[1] === emp.id) partnerId = pair[0];
        if (partnerId) {
          const partner = state.employees.find(e => e.id === partnerId);
          if (partner) return computeAutoCode(state, partner, y, m, d);
        }
      }
    }
  }
  return computeAutoCode(state, emp, y, m, d);
}
function getEffectiveAllow(state, emp, y, m) {
  if (y != null && m != null) {
    const key = `${emp.id}_${y}-${String(m + 1).padStart(2, '0')}`;
    const override = state.monthlyAllowances[key];
    if (override) return { m3: !!override.m3, pct5: !!override.pct5, ksg: !!emp.allow.ksg };
  }
  return emp.allow;
}

function employeePayroll(state, emp, y, m) {
  const bacEntry = state.bacTable.find(b => b[0] === emp.bac);
  const heso = bacEntry ? bacEntry[1] : 0;
  const mucLuong = state.settings.mucLuongToiThieu * heso;
  const phuCap = emp.phucap === 'catruong' ? state.settings.mucLuongToiThieu * state.settings.heSoTca
    : emp.phucap === 'totruong' ? state.settings.mucLuongToiThieu * state.settings.heSoTtruong : 0;
  const ks = isKS(emp.bac);
  const allow = getEffectiveAllow(state, emp, y, m);
  const hesoCDHieuLuc = Number(emp.hesoCD || 0)
    + (allow.m3 ? (ks ? 0.25 : 0.16) : 0)
    + (allow.pct5 ? (ks ? 0.16 : 0.13) : 0)
    + (allow.ksg ? 0.3 : 0);
  return { mucLuong, phuCap, tongLuongPhuCap: mucLuong + phuCap, hesoCDHieuLuc };
}

async function buildMonthWorkbook(state, y, m) {
  const nDays = daysInMonth(y, m);
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(`Thang ${m + 1}-${y}`);

  const headers = ['Nhân sự', 'Mức lương + Phụ cấp', 'Hệ số lương chức danh'];
  for (let d = 1; d <= nDays; d++) headers.push(String(d));
  headers.push('Công', 'Ca 3', 'Lễ+phép', 'Du lịch', 'Bù lễ', 'Riêng lg', 'Ốm/TN/TS', 'Ca3 lễ', 'Phép', 'Lễ', 'Bù');
  ws.addRow(headers);

  const totals = { luong: 0, AJ: 0, AK: 0, AL: 0, AM: 0, AO: 0, AP: 0, AQ: 0, AR: 0, AU: 0, AV: 0, AW: 0 };

  state.employees.forEach(emp => {
    const pay = employeePayroll(state, emp, y, m);
    const row = [emp.name, Math.round(pay.tongLuongPhuCap), Number(pay.hesoCDHieuLuc.toFixed(2))];
    const count = {}; CODE_ORDER.forEach(c => count[c] = 0);
    for (let d = 1; d <= nDays; d++) {
      const code = computeFinalCode(state, emp, y, m, d);
      count[code] = (count[code] || 0) + 1;
      row.push(code || '-');
    }
    const AJ = WORK_CODES.reduce((s, c) => s + count[c], 0);
    const AK = count['XĐ'] + count['KD'];
    const AL = count['L'] + count['F'] + count['XL'] + count['XLĐ'] + count['K1L'] + count['K2L'] + count['KDL'];
    const AM = count['DL'];
    const AO = count['XL'] + count['XLĐ'] + count['K1L'] + count['K2L'] + count['KDL'];
    const AP = count['Rc'];
    const AQ = count['Ô'] + count['TN'] + count['TS'];
    const AR = count['XLĐ'] + count['KDL'];
    const AU = count['F'];
    const AV = count['L'];
    const AW = count['B'] + count['BL'];
    row.push(AJ, AK, AL, AM, AO, AP, AQ, AR, AU, AV, AW);
    ws.addRow(row);

    totals.luong += pay.tongLuongPhuCap;
    totals.AJ += AJ; totals.AK += AK; totals.AL += AL; totals.AM += AM; totals.AO += AO;
    totals.AP += AP; totals.AQ += AQ; totals.AR += AR; totals.AU += AU; totals.AV += AV; totals.AW += AW;
  });

  const totalRow = ['Tổng cộng', Math.round(totals.luong), ''];
  for (let d = 1; d <= nDays; d++) totalRow.push('');
  totalRow.push(totals.AJ, totals.AK, totals.AL, totals.AM, totals.AO, totals.AP, totals.AQ, totals.AR, totals.AU, totals.AV, totals.AW);
  ws.addRow(totalRow);

  // Dinh dang: Times New Roman 12, ke vien toan bo, khong ghi chu thich gi them - chi Header + du lieu
  const lastRow = ws.rowCount;
  const lastCol = headers.length;
  for (let r = 1; r <= lastRow; r++) {
    const row = ws.getRow(r);
    for (let c = 1; c <= lastCol; c++) {
      const cell = row.getCell(c);
      cell.font = { name: 'Times New Roman', size: 12, bold: (r === 1 || r === lastRow) };
      cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
      cell.alignment = { vertical: 'middle', horizontal: c === 1 ? 'left' : (c <= 3 ? 'right' : 'center') };
    }
  }

  ws.getColumn(1).width = 24;
  ws.getColumn(2).width = 16;
  ws.getColumn(3).width = 12;
  for (let d = 1; d <= nDays; d++) ws.getColumn(3 + d).width = 5;
  for (let i = 0; i < 11; i++) ws.getColumn(3 + nDays + 1 + i).width = 10;

  ws.views = [{ state: 'frozen', xSplit: 1, ySplit: 1 }];

  return wb;
}

/* ---------------- Auth routes ---------------- */
app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body || {};
  const db = getDb();
  const user = db.users.find(u => u.email === (email || '').trim().toLowerCase());
  if (!user || !verifyPassword(password || '', user.passwordHash)) {
    return res.status(401).json({ error: 'Sai email hoặc mật khẩu.' });
  }
  const token = issueToken(user);
  setSessionCookie(res, token);
  res.json({ email: user.email, role: user.role });
});

app.post('/api/auth/logout', (req, res) => {
  clearSessionCookie(res);
  res.json({ ok: true });
});

app.get('/api/auth/me', requireAuth, (req, res) => {
  res.json({ email: req.user.email, role: req.user.role });
});

/* ---------------- State routes ---------------- */
app.get('/api/state', requireAuth, (req, res) => {
  const db = getDb();
  res.json(db.state);
});

app.put('/api/state/settings', requireAuth, requireAdmin, (req, res) => {
  const db = getDb();
  Object.assign(db.state.settings, req.body || {});
  persist();
  res.json(db.state.settings);
});

app.put('/api/state/bactable', requireAuth, requireAdmin, (req, res) => {
  const db = getDb();
  db.state.bacTable = req.body || [];
  persist();
  res.json(db.state.bacTable);
});

app.put('/api/state/kips', requireAuth, requireAdmin, (req, res) => {
  const db = getDb();
  db.state.kips = req.body || [];
  persist();
  res.json(db.state.kips);
});

app.put('/api/state/employees', requireAuth, requireAdmin, (req, res) => {
  const db = getDb();
  db.state.employees = req.body || [];
  persist();
  res.json(db.state.employees);
});

app.put('/api/state/grid', requireAuth, requireAdmin, (req, res) => {
  const { empId, dateStr, code } = req.body || {};
  if (!empId || !dateStr) return res.status(400).json({ error: 'Thiếu empId hoặc dateStr.' });
  const db = getDb();
  if (!db.state.grid[empId]) db.state.grid[empId] = {};
  if (!code) delete db.state.grid[empId][dateStr];
  else db.state.grid[empId][dateStr] = code;
  persist();
  res.json({ ok: true });
});

app.put('/api/state/monthly-allowance', requireAuth, requireAdmin, (req, res) => {
  const { empId, yearMonth, m3, pct5 } = req.body || {};
  if (!empId || !yearMonth) return res.status(400).json({ error: 'Thiếu empId hoặc yearMonth.' });
  const db = getDb();
  const key = `${empId}_${yearMonth}`;
  db.state.monthlyAllowances[key] = { m3: !!m3, pct5: !!pct5 };
  persist();
  res.json({ ok: true });
});

app.put('/api/state/meal-override', requireAuth, requireAdmin, (req, res) => {
  const { empId, yearMonth, soCong, soCa3, soBuaAn, ghiChu } = req.body || {};
  if (!empId || !yearMonth) return res.status(400).json({ error: 'Thiếu empId hoặc yearMonth.' });
  const db = getDb();
  const key = `${empId}_${yearMonth}`;
  const existing = db.state.mealOverrides[key] || {};
  db.state.mealOverrides[key] = {
    soCong: soCong === '' || soCong === null || soCong === undefined ? null : Number(soCong),
    soCa3: soCa3 === '' || soCa3 === null || soCa3 === undefined ? null : Number(soCa3),
    soBuaAn: soBuaAn === '' || soBuaAn === null || soBuaAn === undefined ? null : Number(soBuaAn),
    ghiChu: ghiChu !== undefined ? ghiChu : (existing.ghiChu || '')
  };
  persist();
  res.json({ ok: true });
});

app.post('/api/state/registrations/phep', requireAuth, (req, res) => {
  const { dateStr, empId } = req.body || {};
  if (!dateStr || !empId) return res.status(400).json({ error: 'Thiếu dateStr hoặc empId.' });
  const db = getDb();
  if (!db.state.registrations[dateStr]) db.state.registrations[dateStr] = { phep: [], swaps: [] };
  const r = db.state.registrations[dateStr];
  const i = r.phep.indexOf(empId);
  if (i >= 0) r.phep.splice(i, 1); else r.phep.push(empId);
  persist();
  res.json(r);
});

app.post('/api/state/registrations/swap', requireAuth, (req, res) => {
  const { dateStr, empIdA, empIdB } = req.body || {};
  if (!dateStr || !empIdA || !empIdB) return res.status(400).json({ error: 'Thiếu tham số.' });
  const db = getDb();
  if (!db.state.registrations[dateStr]) db.state.registrations[dateStr] = { phep: [], swaps: [] };
  db.state.registrations[dateStr].swaps.push([empIdA, empIdB]);
  persist();
  res.json(db.state.registrations[dateStr]);
});

app.delete('/api/state/registrations/swap', requireAuth, (req, res) => {
  const { dateStr, empId } = req.body || {};
  if (!dateStr || !empId) return res.status(400).json({ error: 'Thiếu tham số.' });
  const db = getDb();
  if (db.state.registrations[dateStr]) {
    db.state.registrations[dateStr].swaps = db.state.registrations[dateStr].swaps.filter(p => p[0] !== empId && p[1] !== empId);
  }
  persist();
  res.json({ ok: true });
});

/* ---------------- Xuat Excel theo yeu cau ---------------- */
app.get('/api/export/excel', requireAuth, async (req, res) => {
  const y = Number(req.query.year), m = Number(req.query.month) - 1;
  if (!y || m < 0 || m > 11) return res.status(400).json({ error: 'Thiếu hoặc sai year/month.' });
  const db = getDb();
  try {
    const wb = await buildMonthWorkbook(db.state, y, m);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="ChamCong_${y}_${String(m + 1).padStart(2, '0')}.xlsx"`);
    await wb.xlsx.write(res);
    res.end();
  } catch (e) {
    res.status(500).json({ error: 'Không tạo được file Excel: ' + e.message });
  }
});

/* ---------------- Sao luu toan bo du lieu (tai truc tiep qua trinh duyet, khong can Samba/Filebrowser) ---------------- */
app.get('/api/admin/backup', requireAuth, requireAdmin, (req, res) => {
  const db = getDb();
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="ct34_backup_${stamp}.json"`);
  res.send(JSON.stringify(db.state, null, 2));
});

/* ---------------- Snapshot tu dong (server tu luu dinh ky, khong can bam gi) ---------------- */
app.get('/api/admin/snapshots', requireAuth, requireAdmin, (req, res) => {
  res.json(listSnapshots());
});

app.get('/api/admin/snapshots/:filename', requireAuth, requireAdmin, (req, res) => {
  const data = readSnapshot(req.params.filename);
  if (!data) return res.status(404).json({ error: 'Không tìm thấy snapshot này.' });
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${req.params.filename}"`);
  res.send(JSON.stringify(data.state || data, null, 2));
});

app.post('/api/admin/snapshots/:filename/restore', requireAuth, requireAdmin, (req, res) => {
  const data = readSnapshot(req.params.filename);
  if (!data) return res.status(404).json({ error: 'Không tìm thấy snapshot này.' });
  if (!data.state) return res.status(400).json({ error: 'Snapshot không hợp lệ.' });
  const db = getDb();
  db.state = data.state;
  persist();
  res.json({ ok: true });
});

/* ---------------- Tu dong xuat file hang thang (that su khong can bam nut) ---------------- */
function ensureExportDir() {
  if (!fs.existsSync(EXPORT_DIR)) fs.mkdirSync(EXPORT_DIR, { recursive: true });
}
async function autoExportMonth(y, m) {
  ensureExportDir();
  const db = getDb();
  try {
    const wb = await buildMonthWorkbook(db.state, y, m);
    const fname = `ChamCong_${y}_${String(m + 1).padStart(2, '0')}.xlsx`;
    await wb.xlsx.writeFile(path.join(EXPORT_DIR, fname));
    console.log(`[auto-export] Đã lưu ${fname} vào ${EXPORT_DIR}`);
  } catch (e) {
    console.error('[auto-export] Lỗi khi xuất file:', e.message);
  }
}
// 00:05 sang ngay 1 hang thang -> tu dong xuat file cua THANG VUA KET THUC (thang truoc)
cron.schedule('5 0 1 * *', () => {
  const now = new Date();
  const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  autoExportMonth(prevMonth.getFullYear(), prevMonth.getMonth());
});
// Cung xuat lai file cua THANG HIEN TAI moi ngay luc 23:50 de luon co ban cap nhat moi nhat
cron.schedule('50 23 * * *', () => {
  const now = new Date();
  autoExportMonth(now.getFullYear(), now.getMonth());
});

/* ---------------- Sao luu du lieu ra /share (KHAC HAN /data cua add-on) ----------------
   Ly do quan trong: neu /data cua rieng add-on nay bi mat (doi o dia, cai lai add-on...),
   ban sao trong chinh /data (kieu snapshot trong db.js) se mat theo luon, khong bao ve duoc gi.
   /share la khu vuc chung cua ca he thong Home Assistant, doc lap voi /data cua tung add-on -
   luu them 1 ban o day de neu chi rieng /data cua CT34 gap su co thi van con duong khoi phuc. */
function backupStateToShare() {
  try {
    ensureExportDir();
    const db = getDb();
    const dayName = new Date().toLocaleDateString('en-US', { weekday: 'short' }); // Mon, Tue, ...
    const fname = `ct34_state_backup_${dayName}.json`;
    fs.writeFileSync(path.join(EXPORT_DIR, fname), JSON.stringify(db.state, null, 2), 'utf8');
  } catch (e) {
    console.error('Không sao lưu được ra /share:', e.message);
  }
}
// Luu 1 lan luc khoi dong, roi cu moi 30 phut luu lai (xoay vong theo ten thu trong tuan, giu toi da 7 ngay)
backupStateToShare();
setInterval(backupStateToShare, 30 * 60 * 1000);

/* ---------------- Static frontend ---------------- */
app.use(express.static(path.join(__dirname, '..', 'public'), {
  setHeaders: (res, filePath) => {
    if (/\.(html|js|css)$/.test(filePath)) {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    }
  }
}));
app.get('*', (req, res) => {
  if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'Not found' });
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Chấm công server đang chạy ở cổng ${PORT}`);
  console.log(`Thư mục tự động xuất file hằng tháng: ${EXPORT_DIR}`);
});
