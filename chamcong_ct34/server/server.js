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

const { getDb, persist, listSnapshots, readSnapshot, defaultState } = require('./db');
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
// Thu muc tren o NASDATA (mount qua "media:rw" trong config.yaml) - hoan toan tach biet voi /share va /data,
// them 1 lop bao ve nua phong khi rieng /share cung gap su co (vi du /share va /data cung nam chung 1 o dia goc).
const NASDATA_DIR = process.env.NASDATA_DIR || '/media/NASDATA/ct34_backups';

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
function monthKey(y, m) { return `${y}-${String(m + 1).padStart(2, '0')}`; }
// Dung sau moi lan THAY THE toan bo db.state (restore tu snapshot/backup/upload) - phong khi file
// phuc hoi la ban rat cu, tu truoc khi co tinh nang Common-theo-thang hoac phepOverrides, chua co du truong.
function ensureMonthsField(state) {
  if (!state.months) state.months = {};
  if (!state.monthlyAllowances) state.monthlyAllowances = {};
  if (!state.mealOverrides) state.mealOverrides = {};
  if (!state.phepOverrides) state.phepOverrides = {};
  return state;
}

/* ---------------- Common (nhan su/Kip/bac luong/cai dat) tach rieng theo TUNG THANG ----------------
   Moi thang la 1 ban doc lap hoan toan trong state.months["YYYY-MM"]. Sua Common luc dang xem thang 9
   la ghi thang vao dung state.months["2026-09"] - KHONG THE dung cham gi den state.months["2026-07"]
   hay "2026-08" vi do la 2 object khac nhau hoan toan trong bo nho/tren dia. Nho vay khong con can
   co che "chot thang" nua - ban chat kien truc da tach roi, khong co gi de "ro ri" nguoc/xuoi ca.

   Thang nao lan dau duoc dung toi (xem/sua) se tu dong duoc TAO ra bang cach SAO CHEP tu thang GAN NHAT
   TRUOC DO da ton tai (copy-forward) - de nguoi dung khong phai nhap lai tu dau nhan su/Kip moi thang,
   chi can sua dung cho phan thay doi. CHI BAO GIO muon tu 1 thang o QUA KHU (hoac chinh no), KHONG BAO
   GIO muon "nguoc" tu 1 thang o TUONG LAI da lo duoc tao truoc (vi du admin mo thang 9 truoc, roi moi
   mo lai thang 8 - thang 8 phai lay hat giong goc, KHONG duoc lay nham cau hinh cua thang 9). Neu chua
   co thang nao truoc do ca (may moi/du lieu tu ban rat cu truoc khi co tinh nang nay), lay tam "hat giong"
   tu cac truong employees/kips/bacTable/settings o goc state. */
function getOrCreateMonthCommon(state, y, m) {
  if (!state.months) state.months = {};
  const key = monthKey(y, m);
  if (state.months[key]) return state.months[key];
  const keys = Object.keys(state.months).sort();
  let seedKey = null;
  for (const k of keys) { if (k <= key) seedKey = k; }
  const seed = seedKey ? state.months[seedKey] : {
    employees: state.employees, kips: state.kips, bacTable: state.bacTable, settings: state.settings
  };
  const created = JSON.parse(JSON.stringify(seed));
  state.months[key] = created;
  persist(); setImmediate(backupStateToShare);
  return created;
}

function daysSinceAnchor(common, y, m, d) {
  const anchor = new Date((common.settings.anchorDate || '2026-07-01') + 'T00:00:00');
  const dt = new Date(y, m, d);
  return Math.round((dt - anchor) / 86400000);
}
function resolvedOffset(common, emp) {
  if (emp.kipId) {
    const k = common.kips.find(x => x.id === emp.kipId);
    if (k) return Number(k.offset || 0);
  }
  return Number(emp.offset || 0);
}
function computeAutoCode(common, emp, y, m, d) {
  if (emp.schedule === 'HC') {
    const dow = new Date(y, m, d).getDay();
    return (dow === 0 || dow === 6) ? '' : 'X';
  }
  const idx = mod8(daysSinceAnchor(common, y, m, d) + resolvedOffset(common, emp));
  const useShiftCodes = (emp.schedule === 'CA') || (emp.schedule === 'TAM' && emp.kipId);
  return (useShiftCodes ? CYCLE_CA : CYCLE_TAM)[idx];
}
function computeFinalCode(state, common, emp, y, m, d) {
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
          const partner = common.employees.find(e => e.id === partnerId);
          if (partner) return computeAutoCode(common, partner, y, m, d);
        }
      }
    }
  }
  return computeAutoCode(common, emp, y, m, d);
}
function getEffectiveAllow(state, emp, y, m) {
  if (y != null && m != null) {
    const key = `${emp.id}_${y}-${String(m + 1).padStart(2, '0')}`;
    const override = state.monthlyAllowances[key];
    if (override) return { m3: !!override.m3, pct5: !!override.pct5, neg5: !!override.neg5, ksg: !!emp.allow.ksg };
  }
  return emp.allow;
}

function employeePayroll(state, common, emp, y, m) {
  const bacEntry = common.bacTable.find(b => b[0] === emp.bac);
  const heso = bacEntry ? bacEntry[1] : 0;
  const mucLuong = common.settings.mucLuongToiThieu * heso;
  const phuCap = emp.phucap === 'catruong' ? common.settings.mucLuongToiThieu * common.settings.heSoTca
    : emp.phucap === 'totruong' ? common.settings.mucLuongToiThieu * common.settings.heSoTtruong : 0;
  const ks = isKS(emp.bac);
  const allow = getEffectiveAllow(state, emp, y, m);
  const hesoCDHieuLuc = Number(emp.hesoCD || 0)
    + (allow.m3 ? (ks ? 0.25 : 0.16) : 0)
    + (allow.pct5 ? (ks ? 0.16 : 0.13) : 0)
    - (allow.neg5 ? (ks ? 0.16 : 0.13) : 0)
    + (allow.ksg ? 0.3 : 0);
  return { mucLuong, phuCap, tongLuongPhuCap: mucLuong + phuCap, hesoCDHieuLuc };
}

const XLS_BORDER = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
const XLS_WEEKEND_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFDF3DC' } };
const XLS_HEADER_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0F3F5' } };
const XLS_F_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFE08A' } };
const XLS_TOTAL_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8EEF2' } };
const XLS_PHASE_LETTERS = ['S', 'S', '', 'C', 'C', 'Đ', 'Đ', ''];
const XLS_WEEKDAY_SHORT = ['CN', 'Thai', 'Tba', 'Ttư', 'Tnăm', 'Tsáu', 'Tbảy'];

function xlsFooterDateLine(y, m) {
  const now = new Date();
  return `Ngày ${String(now.getDate()).padStart(2, '0')} tháng ${String(now.getMonth() + 1).padStart(2, '0')} năm ${now.getFullYear()}`;
}

function xlsGroupedOrder(common) {
  const kipIds = new Set(common.kips.map(k => k.id));
  const order = [];
  common.employees.filter(e => !e.kipId || !kipIds.has(e.kipId)).forEach(e => order.push({ type: 'emp', emp: e }));
  common.kips.forEach((kip, i) => {
    order.push({ type: 'kip', kip });
    common.employees.filter(e => e.kipId === kip.id).forEach(e => order.push({ type: 'emp', emp: e }));
  });
  return order;
}

function xlsApplyTitleBlock(ws, totalCols, titleText, subText) {
  ws.mergeCells(1, 1, 1, totalCols);
  const t = ws.getCell(1, 1);
  t.value = titleText;
  t.font = { name: 'Times New Roman', size: 16, bold: true };
  t.alignment = { vertical: 'middle', horizontal: 'center' };
  ws.getRow(1).height = 26;

  ws.mergeCells(2, 1, 2, totalCols);
  const s = ws.getCell(2, 1);
  s.value = subText;
  s.font = { name: 'Times New Roman', size: 12, bold: true };
  s.alignment = { vertical: 'middle', horizontal: 'center' };
  ws.getRow(2).height = 20;
}

function xlsApplyFooter(ws, totalCols, y, m) {
  const startRow = ws.rowCount + 2;
  // Dong ngay thang - can phai, chiem nua bang ben phai
  const half = Math.max(1, Math.floor(totalCols / 2));
  ws.mergeCells(startRow, half + 1, startRow, totalCols);
  const dateCell = ws.getCell(startRow, half + 1);
  dateCell.value = xlsFooterDateLine(y, m);
  dateCell.font = { name: 'Times New Roman', size: 12, italic: true };
  dateCell.alignment = { horizontal: 'center' };

  ws.mergeCells(startRow + 1, half + 1, startRow + 1, totalCols);
  const roleCell = ws.getCell(startRow + 1, half + 1);
  roleCell.value = 'Người lập';
  roleCell.font = { name: 'Times New Roman', size: 12, bold: true };
  roleCell.alignment = { horizontal: 'center' };

  ws.mergeCells(startRow + 4, half + 1, startRow + 4, totalCols);
  const nameCell = ws.getCell(startRow + 4, half + 1);
  nameCell.value = 'Trần Nam Thành';
  nameCell.font = { name: 'Times New Roman', size: 12, bold: true };
  nameCell.alignment = { horizontal: 'center' };
}

async function buildMonthWorkbook(state, y, m) {
  const common = getOrCreateMonthCommon(state, y, m);
  const nDays = daysInMonth(y, m);
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(`Thang ${m + 1}-${y}`);

  const sumHeaders = ['Công', 'Ca 3', 'Lễ+phép', 'Du lịch', 'Bù lễ', 'Riêng lg', 'Ốm/TN/TS', 'Ca3 lễ', 'Phép', 'Lễ', 'Bù'];
  const totalCols = 3 + nDays + sumHeaders.length;

  xlsApplyTitleBlock(ws, totalCols,
    `BẢNG CHẤM CÔNG THÁNG ${String(m + 1).padStart(2, '0')}/${y}`,
    'ĐỘI SỬA CHỮA ĐIỆN CT34');

  // 2 dong header: dong thu trong tuan + dong so ngay (giong ban web)
  const dowRow = ['Nhân sự', 'Mức lương', 'Hệ số lương chức danh'];
  const dayRow = ['', '', ''];
  for (let d = 1; d <= nDays; d++) {
    const dow = new Date(y, m, d).getDay();
    dowRow.push(XLS_WEEKDAY_SHORT[dow]);
    dayRow.push(d);
  }
  sumHeaders.forEach(h => { dowRow.push(h); dayRow.push(''); });
  const headerRow1 = ws.addRow(dowRow); // row 3
  const headerRow2 = ws.addRow(dayRow); // row 4
  // Merge doc 2 dong cho 3 cot dau va cac cot tong hop
  for (let c = 1; c <= 3; c++) ws.mergeCells(3, c, 4, c);
  for (let i = 0; i < sumHeaders.length; i++) ws.mergeCells(3, 3 + nDays + 1 + i, 4, 3 + nDays + 1 + i);

  const totals = { luong: 0, heso: 0, AJ: 0, AK: 0, AL: 0, AM: 0, AO: 0, AP: 0, AQ: 0, AR: 0, AU: 0, AV: 0, AW: 0 };

  xlsGroupedOrder(common).forEach(item => {
    if (item.type === 'kip') {
      const row = [item.kip.label, '', ''];
      for (let d = 1; d <= nDays; d++) {
        const idx = mod8(daysSinceAnchor(common, y, m, d) + Number(item.kip.offset || 0));
        row.push(XLS_PHASE_LETTERS[idx] || '·');
      }
      sumHeaders.forEach(() => row.push(''));
      const r = ws.addRow(row);
      r.eachCell({ includeEmpty: true }, (cell) => {
        cell.fill = XLS_HEADER_FILL;
        cell.font = { name: 'Times New Roman', size: 12, bold: true, color: { argb: 'FF2C5F7C' } };
      });
      return;
    }
    const emp = item.emp;
    const pay = employeePayroll(state, common, emp, y, m);
    const row = [emp.name, Math.round(pay.tongLuongPhuCap), Number(pay.hesoCDHieuLuc.toFixed(2))];
    const count = {}; CODE_ORDER.forEach(c => count[c] = 0);
    for (let d = 1; d <= nDays; d++) {
      const code = computeFinalCode(state, common, emp, y, m, d);
      count[code] = (count[code] || 0) + 1;
      row.push(code || '·');
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
    const r = ws.addRow(row);
    // To vang cac o F
    for (let d = 1; d <= nDays; d++) {
      if (computeFinalCode(state, common, emp, y, m, d) === 'F') r.getCell(3 + d).fill = XLS_F_FILL;
    }

    totals.luong += pay.tongLuongPhuCap;
    totals.heso += pay.hesoCDHieuLuc;
    totals.AJ += AJ; totals.AK += AK; totals.AL += AL; totals.AM += AM; totals.AO += AO;
    totals.AP += AP; totals.AQ += AQ; totals.AR += AR; totals.AU += AU; totals.AV += AV; totals.AW += AW;
  });

  const totalRowArr = ['Tổng cộng', Math.round(totals.luong), Number(totals.heso.toFixed(2))];
  for (let d = 1; d <= nDays; d++) totalRowArr.push('');
  totalRowArr.push(totals.AJ, totals.AK, totals.AL, totals.AM, totals.AO, totals.AP, totals.AQ, totals.AR, totals.AU, totals.AV, totals.AW);
  const totalRowRef = ws.addRow(totalRowArr);
  totalRowRef.eachCell({ includeEmpty: true }, (cell) => { cell.fill = XLS_TOTAL_FILL; });

  // Dinh dang chung: font, border, alignment, to nen cuoi tuan
  const lastRow = ws.rowCount;
  for (let r = 3; r <= lastRow; r++) {
    const row = ws.getRow(r);
    for (let c = 1; c <= totalCols; c++) {
      const cell = row.getCell(c);
      if (!cell.font) cell.font = { name: 'Times New Roman', size: 12, bold: (r === 3 || r === 4 || r === lastRow) };
      else cell.font = Object.assign({ name: 'Times New Roman', size: 12 }, cell.font);
      cell.border = XLS_BORDER;
      cell.alignment = { vertical: 'middle', horizontal: c === 1 ? 'left' : (c === 2 ? 'right' : 'center') };
      // To nen cot cuoi tuan truoc (uu tien hon mau header) - giong ban web
      if (c > 3 && c <= 3 + nDays) {
        const d = c - 3;
        const dow = new Date(y, m, d).getDay();
        if ((dow === 0 || dow === 6) && !cell.fill) cell.fill = XLS_WEEKEND_FILL;
      }
      if ((r === 3 || r === 4) && !cell.fill) cell.fill = XLS_HEADER_FILL;
    }
  }

  ws.getColumn(1).width = 22;
  ws.getColumn(2).width = 13;
  ws.getColumn(3).width = 10;
  for (let d = 1; d <= nDays; d++) ws.getColumn(3 + d).width = 4.6;
  for (let i = 0; i < sumHeaders.length; i++) ws.getColumn(3 + nDays + 1 + i).width = 9;

  xlsApplyFooter(ws, totalCols, y, m);
  ws.views = [{ state: 'frozen', xSplit: 1, ySplit: 4 }];
  ws.pageSetup = { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9 };
  return wb;
}

async function buildMealWorkbook(state, y, m) {
  const common = getOrCreateMonthCommon(state, y, m);
  const nDays = daysInMonth(y, m);
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(`AnCa ${m + 1}-${y}`);
  const totalCols = 6;

  xlsApplyTitleBlock(ws, totalCols,
    `BẢNG ĂN CA THÁNG ${String(m + 1).padStart(2, '0')}/${y}`,
    'ĐỘI SỬA CHỮA ĐIỆN CT34');

  ws.addRow(['TT', 'Họ và tên', 'Số công', 'Số ca 3', 'Số bữa ăn', 'Ghi chú']); // row 3

  let totalCong = 0, totalCa3 = 0, totalBuaAn = 0;
  common.employees.forEach((emp, idx) => {
    const count = {}; CODE_ORDER.forEach(c => count[c] = 0);
    for (let d = 1; d <= nDays; d++) {
      const code = computeFinalCode(state, common, emp, y, m, d);
      count[code] = (count[code] || 0) + 1;
    }
    const AJ = WORK_CODES.reduce((s, c) => s + count[c], 0);
    const ca3Auto = count['KD'] + count['XĐ'] + count['KDL'] + count['XLĐ'];
    const mealAuto = Math.max(0, AJ - ca3Auto);
    const key = `${emp.id}_${y}-${String(m + 1).padStart(2, '0')}`;
    const ov = (state.mealOverrides && state.mealOverrides[key]) || {};
    const effCong = (ov.soCong === null || ov.soCong === undefined) ? AJ : ov.soCong;
    const effCa3 = (ov.soCa3 === null || ov.soCa3 === undefined) ? ca3Auto : ov.soCa3;
    const effBuaAn = (ov.soBuaAn === null || ov.soBuaAn === undefined) ? mealAuto : ov.soBuaAn;
    totalCong += Number(effCong) || 0;
    totalCa3 += Number(effCa3) || 0;
    totalBuaAn += Number(effBuaAn) || 0;
    ws.addRow([idx + 1, emp.name, effCong, effCa3, effBuaAn, ov.ghiChu || '']);
  });

  const totalRowRef = ws.addRow(['', 'Tổng cộng', totalCong, totalCa3, totalBuaAn, '']);
  totalRowRef.eachCell({ includeEmpty: true }, (cell) => { cell.fill = XLS_TOTAL_FILL; });

  const lastRow = ws.rowCount;
  for (let r = 3; r <= lastRow; r++) {
    const row = ws.getRow(r);
    for (let c = 1; c <= totalCols; c++) {
      const cell = row.getCell(c);
      cell.font = { name: 'Times New Roman', size: 12, bold: (r === 3 || r === lastRow) };
      cell.border = XLS_BORDER;
      cell.alignment = { vertical: 'middle', horizontal: c === 2 || c === 6 ? 'left' : 'center' };
      if (r === 3 && !cell.fill) cell.fill = XLS_HEADER_FILL;
    }
  }

  ws.getColumn(1).width = 5;
  ws.getColumn(2).width = 24;
  ws.getColumn(3).width = 10;
  ws.getColumn(4).width = 10;
  ws.getColumn(5).width = 12;
  ws.getColumn(6).width = 30;

  xlsApplyFooter(ws, totalCols, y, m);
  ws.pageSetup = { orientation: 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9 };
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

/* ---------------- Common theo tung thang (nhan su / Kip / bac luong / cai dat) ----------------
   year/month trong URL luon la thang dang XEM tren giao dien (vd Common cua thang 9/2026). Doc/sua
   luon di qua getOrCreateMonthCommon() nen tu dong "copy-forward" tu thang gan nhat khi can, va
   TUYET DOI khong dung cham gi den du lieu cua thang khac. */
function parseYM(req) {
  const y = Number(req.params.year), m = Number(req.params.month) - 1;
  if (!y || m < 0 || m > 11) return null;
  return { y, m };
}

app.get('/api/month/:year/:month', requireAuth, (req, res) => {
  const ym = parseYM(req);
  if (!ym) return res.status(400).json({ error: 'Sai year/month.' });
  const db = getDb();
  res.json(getOrCreateMonthCommon(db.state, ym.y, ym.m));
});

app.put('/api/month/:year/:month/settings', requireAuth, requireAdmin, (req, res) => {
  const ym = parseYM(req);
  if (!ym) return res.status(400).json({ error: 'Sai year/month.' });
  const db = getDb();
  const common = getOrCreateMonthCommon(db.state, ym.y, ym.m);
  Object.assign(common.settings, req.body || {});
  persist(); setImmediate(backupStateToShare);
  res.json(common.settings);
});

app.put('/api/month/:year/:month/bactable', requireAuth, requireAdmin, (req, res) => {
  const ym = parseYM(req);
  if (!ym) return res.status(400).json({ error: 'Sai year/month.' });
  const db = getDb();
  const common = getOrCreateMonthCommon(db.state, ym.y, ym.m);
  common.bacTable = req.body || [];
  persist(); setImmediate(backupStateToShare);
  res.json(common.bacTable);
});

app.put('/api/month/:year/:month/kips', requireAuth, requireAdmin, (req, res) => {
  const ym = parseYM(req);
  if (!ym) return res.status(400).json({ error: 'Sai year/month.' });
  const db = getDb();
  const common = getOrCreateMonthCommon(db.state, ym.y, ym.m);
  common.kips = req.body || [];
  persist(); setImmediate(backupStateToShare);
  res.json(common.kips);
});

app.put('/api/month/:year/:month/employees', requireAuth, requireAdmin, (req, res) => {
  const ym = parseYM(req);
  if (!ym) return res.status(400).json({ error: 'Sai year/month.' });
  const db = getDb();
  const common = getOrCreateMonthCommon(db.state, ym.y, ym.m);
  common.employees = req.body || [];
  persist(); setImmediate(backupStateToShare);
  res.json(common.employees);
});

/* ---------------- State routes (grid/dang ky/phu cap - van dung chung, da tu khoa theo ngay/thang roi) ---------------- */
app.get('/api/state', requireAuth, (req, res) => {
  const db = getDb();
  res.json(db.state);
});

app.put('/api/state/grid', requireAuth, requireAdmin, (req, res) => {
  const { empId, dateStr, code } = req.body || {};
  if (!empId || !dateStr) return res.status(400).json({ error: 'Thiếu empId hoặc dateStr.' });
  const db = getDb();
  if (!db.state.grid[empId]) db.state.grid[empId] = {};
  if (!code) delete db.state.grid[empId][dateStr];
  else db.state.grid[empId][dateStr] = code;
  persist(); setImmediate(backupStateToShare);
  res.json({ ok: true });
});

app.post('/api/state/grid-clear-month', requireAuth, requireAdmin, (req, res) => {
  const y = Number(req.body && req.body.year), m = Number(req.body && req.body.month) - 1;
  if (!y || m < 0 || m > 11) return res.status(400).json({ error: 'Thiếu hoặc sai year/month.' });
  const db = getDb();
  const common = getOrCreateMonthCommon(db.state, y, m);
  const nDays = daysInMonth(y, m);
  let count = 0;
  common.employees.forEach(emp => {
    if (!db.state.grid[emp.id]) return;
    for (let d = 1; d <= nDays; d++) {
      const dateStr = fmtDate(y, m, d);
      if (db.state.grid[emp.id][dateStr]) { delete db.state.grid[emp.id][dateStr]; count++; }
    }
  });
  persist(); setImmediate(backupStateToShare);
  res.json({ ok: true, count });
});

/* ---------------- (Da go bo hoan toan: tinh nang "Chot du lieu thang") ----------------
   Ly do go bo: tu ban co Common theo tung thang (xem getOrCreateMonthCommon o tren), thang 7/8 va
   thang 9 la 2 object HOAN TOAN doc lap trong du lieu - doi Kip/lich/nhan su o tab Common cua thang 9
   ve mat ket cau khong the nao dung cham nguoc ve thang 7/8 duoc nua, nen khong con can "chot" (khoa)
   thu cong hay canh bao gi truoc khi doi nua. Day cung la cach sua tan goc loi tung xay ra khi co che
   chot cu bo sot cac ngay nghi (ma rong) khong duoc dong bang, khien thang da "chot" van bi tinh lai
   sai theo cau hinh moi neu nhan su doi lich sau do (07-08/2026). */

app.put('/api/state/monthly-allowance', requireAuth, requireAdmin, (req, res) => {
  const { empId, yearMonth, m3, pct5, neg5 } = req.body || {};
  if (!empId || !yearMonth) return res.status(400).json({ error: 'Thiếu empId hoặc yearMonth.' });
  const db = getDb();
  const key = `${empId}_${yearMonth}`;
  db.state.monthlyAllowances[key] = { m3: !!m3, pct5: !!pct5, neg5: !!neg5 };
  persist(); setImmediate(backupStateToShare);
  res.json({ ok: true });
});

app.put('/api/state/phep-override', requireAuth, requireAdmin, (req, res) => {
  const { empId, yearMonth, soNgay } = req.body || {};
  if (!empId || !yearMonth) return res.status(400).json({ error: 'Thiếu empId hoặc yearMonth.' });
  const db = getDb();
  const key = `${empId}_${yearMonth}`;
  db.state.phepOverrides[key] = (soNgay === '' || soNgay === null || soNgay === undefined) ? null : Number(soNgay);
  if (db.state.phepOverrides[key] === null) delete db.state.phepOverrides[key];
  persist(); setImmediate(backupStateToShare);
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
  persist(); setImmediate(backupStateToShare);
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
  persist(); setImmediate(backupStateToShare);
  res.json(r);
});

app.post('/api/state/registrations/swap', requireAuth, (req, res) => {
  const { dateStr, empIdA, empIdB } = req.body || {};
  if (!dateStr || !empIdA || !empIdB) return res.status(400).json({ error: 'Thiếu tham số.' });
  const db = getDb();
  if (!db.state.registrations[dateStr]) db.state.registrations[dateStr] = { phep: [], swaps: [] };
  db.state.registrations[dateStr].swaps.push([empIdA, empIdB]);
  persist(); setImmediate(backupStateToShare);
  res.json(db.state.registrations[dateStr]);
});

app.delete('/api/state/registrations/swap', requireAuth, (req, res) => {
  const { dateStr, empId } = req.body || {};
  if (!dateStr || !empId) return res.status(400).json({ error: 'Thiếu tham số.' });
  const db = getDb();
  if (db.state.registrations[dateStr]) {
    db.state.registrations[dateStr].swaps = db.state.registrations[dateStr].swaps.filter(p => p[0] !== empId && p[1] !== empId);
  }
  persist(); setImmediate(backupStateToShare);
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

app.get('/api/export/excel-anca', requireAuth, async (req, res) => {
  const y = Number(req.query.year), m = Number(req.query.month) - 1;
  if (!y || m < 0 || m > 11) return res.status(400).json({ error: 'Thiếu hoặc sai year/month.' });
  const db = getDb();
  try {
    const wb = await buildMealWorkbook(db.state, y, m);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="AnCa_${y}_${String(m + 1).padStart(2, '0')}.xlsx"`);
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
  db.state = ensureMonthsField(data.state);
  persist(); setImmediate(backupStateToShare);
  res.json({ ok: true });
});

/* ---------------- Khoi phuc tu file JSON tai len (backup thu cong / file trong /share) ---------------- */
app.post('/api/admin/restore-upload', requireAuth, requireAdmin, (req, res) => {
  const payload = req.body;
  if (!payload || typeof payload !== 'object') return res.status(400).json({ error: 'File không hợp lệ.' });
  // Chap nhan ca 2 dang: file backup state thuan (co employees/settings o goc)
  // hoac file snapshot day du (co .state ben trong)
  let newState = null;
  if (payload.state && payload.state.employees) newState = payload.state;
  else if (payload.employees && payload.settings) newState = payload;
  if (!newState) return res.status(400).json({ error: 'File không đúng định dạng backup CT34 (không tìm thấy dữ liệu nhân sự bên trong).' });
  const db = getDb();
  db.state = ensureMonthsField(newState);
  persist(); setImmediate(backupStateToShare);
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
    const wbMeal = await buildMealWorkbook(db.state, y, m);
    const fnameMeal = `AnCa_${y}_${String(m + 1).padStart(2, '0')}.xlsx`;
    await wbMeal.xlsx.writeFile(path.join(EXPORT_DIR, fnameMeal));
    console.log(`[auto-export] Đã lưu ${fname} + ${fnameMeal} vào ${EXPORT_DIR}`);
  } catch (e) {
    console.error('[auto-export] Lỗi khi xuất file:', e.message);
  }
}
// 00:05 sang ngay 1 hang thang -> tu dong xuat file cua THANG VUA KET THUC (thang truoc)
// (Khong con buoc "tu dong chot" o day nua - da bo tinh nang Chot, xem ghi chu o phan API Common theo thang.)
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

/* ---------------- Sao luu du lieu ra nhieu noi doc lap (KHAC HAN /data cua add-on) ----------------
   Ly do quan trong: neu /data cua rieng add-on nay bi mat (doi o dia, cai lai add-on...),
   ban sao trong chinh /data (kieu snapshot trong db.js) se mat theo luon, khong bao ve duoc gi.

   Ghi ra CA 2 NOI DOC LAP, moi noi that bai khong anh huong noi con lai:
   - /share/chamcong_exports  (khu vuc chung cua Home Assistant)
   - /media/NASDATA/ct34_backups (o HDD NAS rieng, tach hoan toan khoi o goc cua Home Assistant)

   KHONG dung 1 file ghi de theo ten thu trong tuan nua (loi cu: neu su co xay ra giua ngay,
   ghi de lien tuc 30 phut/lan se xoa mat ca ban tot dau ngay hom do).
   Thay vao do luu NHIEU BAN theo dung moc thoi gian, khong bao gio ghi de len nhau:
   - history/: moi 30 phut 1 ban, giu 200 ban gan nhat (~4 ngay lien tuc)
   - daily/:   moi ngay giu lai 1 ban (ban dau tien trong ngay), giu 60 ngay gan nhat
*/
const BACKUP_DESTS = [
  { key: 'share', baseDir: () => EXPORT_DIR },
  { key: 'nasdata', baseDir: () => NASDATA_DIR }
];
const SHARE_HISTORY_KEEP = 200;
const SHARE_DAILY_KEEP = 60;
let lastDailyBackupDate = null;

function pruneDir(dir, keepCount) {
  if (!fs.existsSync(dir)) return;
  const files = fs.readdirSync(dir).filter(f => f.startsWith('ct34_')).sort();
  while (files.length > keepCount) {
    fs.unlinkSync(path.join(dir, files.shift()));
  }
}

function backupStateToShare() {
  const db = getDb();
  const now = new Date();
  const stamp = now.toISOString().replace(/[:.]/g, '-');
  const todayKey = now.toISOString().slice(0, 10); // YYYY-MM-DD
  const json = JSON.stringify(db.state, null, 2);
  const isNewDay = lastDailyBackupDate !== todayKey;

  BACKUP_DESTS.forEach(({ key, baseDir }) => {
    try {
      const base = baseDir();
      if (!fs.existsSync(base)) fs.mkdirSync(base, { recursive: true });

      const histDir = path.join(base, 'history');
      if (!fs.existsSync(histDir)) fs.mkdirSync(histDir, { recursive: true });
      fs.writeFileSync(path.join(histDir, `ct34_${stamp}.json`), json, 'utf8');
      pruneDir(histDir, SHARE_HISTORY_KEEP);

      if (isNewDay) {
        const dailyDir = path.join(base, 'daily');
        if (!fs.existsSync(dailyDir)) fs.mkdirSync(dailyDir, { recursive: true });
        fs.writeFileSync(path.join(dailyDir, `ct34_${todayKey}.json`), json, 'utf8');
        pruneDir(dailyDir, SHARE_DAILY_KEEP);
      }
    } catch (e) {
      console.error(`Không sao lưu được ra [${key}]:`, e.message);
    }
  });
  if (isNewDay) lastDailyBackupDate = todayKey;
}
/* ---------------- Tu phat hien + tu chua khi /data bi tao moi bat thuong ----------------
   Day la lop bao ve cuoi cung: neu Supervisor/he thong tao lai /data rong (do o dia ngoai
   khong mount kip luc khoi dong...), CT34 se tu nhan ra ngay luc khoi dong va tu khoi phuc
   tu ban sao luu gan nhat tren /share hoac NASDATA - KHONG can cho ai phat hien ra roi
   tu tay khoi phuc nua. */
function looksFreshlyDefaulted(state) {
  const defaults = defaultState();
  if (!state.employees || state.employees.length !== defaults.employees.length) return false;
  const sameNames = state.employees.every((e, i) => e.name === defaults.employees[i].name);
  const noRegistrations = !state.registrations || Object.keys(state.registrations).length === 0;
  const noGridOverrides = !state.grid || Object.keys(state.grid).length === 0;
  return sameNames && noRegistrations && noGridOverrides;
}

function findNewestBackupFile() {
  let newest = null; // { path, mtime }
  BACKUP_DESTS.forEach(({ baseDir }) => {
    const histDir = path.join(baseDir(), 'history');
    if (!fs.existsSync(histDir)) return;
    fs.readdirSync(histDir).filter(f => f.startsWith('ct34_')).forEach(f => {
      const p = path.join(histDir, f);
      try {
        const stat = fs.statSync(p);
        if (!newest || stat.mtimeMs > newest.mtime) newest = { path: p, mtime: stat.mtimeMs };
      } catch (e) { /* bo qua file loi */ }
    });
  });
  return newest ? newest.path : null;
}

function autoHealIfFreshData() {
  const db = getDb();
  if (!looksFreshlyDefaulted(db.state)) return; // du lieu binh thuong, khong can lam gi
  console.warn('⚠️  [AUTO-HEAL] Phát hiện dữ liệu trông như vừa bị tạo mới (trống, đúng y hệt mặc định). Đang tìm bản sao lưu gần nhất để tự khôi phục...');
  const newestPath = findNewestBackupFile();
  if (!newestPath) {
    console.warn('⚠️  [AUTO-HEAL] Không tìm thấy bản sao lưu nào trên /share hoặc NASDATA để tự khôi phục. Nếu đây thực sự là lần cài đặt đầu tiên thì bỏ qua cảnh báo này.');
    return;
  }
  try {
    const backupState = JSON.parse(fs.readFileSync(newestPath, 'utf8'));
    if (looksFreshlyDefaulted(backupState)) {
      console.warn('⚠️  [AUTO-HEAL] Bản sao lưu gần nhất cũng trống - có thể đây thực sự là cài đặt mới, không tự khôi phục.');
      return;
    }
    db.state = ensureMonthsField(backupState);
    persist(); setImmediate(backupStateToShare);
    console.warn(`✅ [AUTO-HEAL] Đã TỰ ĐỘNG khôi phục dữ liệu từ bản sao lưu: ${newestPath}`);
  } catch (e) {
    console.error('⚠️  [AUTO-HEAL] Lỗi khi thử tự khôi phục:', e.message);
  }
}
autoHealIfFreshData();

// Luu 1 lan luc khoi dong, roi cu moi 30 phut luu lai
backupStateToShare();
setInterval(backupStateToShare, 30 * 60 * 1000);

app.get('/api/admin/share-backups', requireAuth, requireAdmin, (req, res) => {
  try {
    const listDir = (dir) => fs.existsSync(dir) ? fs.readdirSync(dir).filter(f => f.startsWith('ct34_')).sort().reverse() : [];
    const result = {};
    BACKUP_DESTS.forEach(({ key, baseDir }) => {
      result[key] = {
        history: listDir(path.join(baseDir(), 'history')),
        daily: listDir(path.join(baseDir(), 'daily'))
      };
    });
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/admin/share-backups/:dest/:folder/:filename/restore', requireAuth, requireAdmin, (req, res) => {
  const { dest, folder, filename } = req.params;
  const destDef = BACKUP_DESTS.find(d => d.key === dest);
  if (!destDef) return res.status(400).json({ error: 'Nguồn không hợp lệ.' });
  if (folder !== 'history' && folder !== 'daily') return res.status(400).json({ error: 'Thư mục không hợp lệ.' });
  const dir = path.join(destDef.baseDir(), folder);
  const p = path.join(dir, path.basename(filename));
  if (!fs.existsSync(p)) return res.status(404).json({ error: 'Không tìm thấy file.' });
  try {
    const newState = JSON.parse(fs.readFileSync(p, 'utf8'));
    if (!newState.employees) return res.status(400).json({ error: 'File không hợp lệ.' });
    const db = getDb();
    db.state = ensureMonthsField(newState);
    persist(); setImmediate(backupStateToShare);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: 'Lỗi đọc file: ' + e.message });
  }
});

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
