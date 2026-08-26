/* ================= Hang so va tien ich dung chung ================= */
const CODES = {
  '':    {name:'(trống — nghỉ theo lịch, không tính công)', color:'#E7E9EC', text:'#5B6570'},
  X:     {name:'Công lương thời gian (ngày thường / hành chính)', color:'#4C8C6B'},
  'XĐ':  {name:'Làm thêm tương đương ca 3 (Tầm đi làm ngày nghỉ)', color:'#2E8B8B'},
  XL:    {name:'Công lương thời gian làm ngày lễ / công lễ tết', color:'#B8860B'},
  'XLĐ': {name:'Công ca 3 làm ngày lễ, tết', color:'#8E5A2E'},
  K1:    {name:'Ca sáng (Ca1)', color:'#3E7CB1'},
  K2:    {name:'Ca chiều (Ca2)', color:'#D98A2B'},
  KD:    {name:'Ca đêm / Ca 3 (Ca3)', color:'#7B5EA7'},
  K1L:   {name:'Ca sáng vào ngày lễ', color:'#2A5D8A'},
  K2L:   {name:'Ca chiều vào ngày lễ', color:'#B5651D'},
  KDL:   {name:'Ca đêm vào ngày lễ (ca 3 lễ)', color:'#5A3E7A'},
  F:     {name:'Công phép (nghỉ phép năm)', color:'#C9A227'},
  L:     {name:'Nghỉ lễ, tết', color:'#B23A48'},
  DL:    {name:'Công tham quan, nghỉ mát', color:'#2E8B57'},
  Rc:    {name:'Nghỉ việc riêng có lương', color:'#6B8E23'},
  Ro:    {name:'Nghỉ việc riêng không lương', color:'#708090'},
  'Ô':   {name:'Nghỉ ốm', color:'#8E8E8E'},
  TS:    {name:'Nghỉ thai sản', color:'#C2185B'},
  TN:    {name:'Tai nạn lao động', color:'#D32F2F'},
  B:     {name:'Nghỉ bù (có lương)', color:'#8D6E63'},
  BL:    {name:'Nghỉ bù không lương', color:'#455A64'},
  CT:    {name:'Công tác / quân sự / trực thường', color:'#9C27B0'}
};
const CODE_ORDER = ['','X','K1','K2','KD','XĐ','XL','XLĐ','K1L','K2L','KDL','F','L','DL','Rc','Ro','Ô','TS','TN','B','BL','CT'];
const WEEKDAY_LABELS = ['Chủ nhật','Thứ hai','Thứ ba','Thứ tư','Thứ năm','Thứ sáu','Thứ bảy'];
const WORK_CODES = ['X','XĐ','XL','XLĐ','K1','K2','KD','K1L','K2L','KDL'];
const CYCLE_TAM = ['X','X','','X','X','XĐ','XĐ',''];
const CYCLE_CA  = ['K1','K1','','K2','K2','KD','KD',''];
const PHASE_LETTERS = ['S','S','','C','C','Đ','Đ',''];
const PHASE_TO_SHIFTLABEL = {S:'K1', C:'K2', 'Đ':'KD'};
const PHASE_TO_COLOR = {S:'#3E7CB1', C:'#D98A2B', 'Đ':'#7B5EA7'};
const PHASE_TO_PALE  = {S:'#DCEBF7', C:'#FBE7D0', 'Đ':'#E7DCF2'};

function mod8(n){ return ((n%8)+8)%8; }
function daysInMonth(y,m){ return new Date(y,m+1,0).getDate(); }
function fmtDate(y,m,d){ return y+'-'+String(m+1).padStart(2,'0')+'-'+String(d).padStart(2,'0'); }
function isKS(bac){ return (bac||'').toUpperCase().startsWith('KS'); }
function escapeHtml(s){ return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

/* Cac ham tinh toan ben duoi deu nhan "common" (Common CUA DUNG THANG dang xem: employees/kips/bacTable/
   settings) lam tham so dau tien - vi tu ban co Common rieng theo tung thang, khong con 1 cau hinh
   toan cuc dung chung nua. Xem bien module-level `common` (thang dang active tren giao dien) va
   `commonCache`/`getCommon()` (dung khi can nhieu thang cung luc, vd tab Tong hop nam). */
function daysSinceAnchor(common, y,m,d){
  const anchor = new Date((common.settings.anchorDate||'2026-07-01')+'T00:00:00');
  const dt = new Date(y,m,d);
  return Math.round((dt-anchor)/86400000);
}
function resolvedOffset(common, emp){
  if(emp.kipId){
    const k = common.kips.find(x=>x.id===emp.kipId);
    if(k) return Number(k.offset||0);
  }
  return Number(emp.offset||0);
}
function computeAutoCode(common, emp, y, m, d){
  if(emp.schedule==='HC'){
    const dow = new Date(y,m,d).getDay();
    return (dow===0||dow===6) ? '' : 'X';
  }
  const idx = mod8(daysSinceAnchor(common, y,m,d) + resolvedOffset(common, emp));
  // Nguoi thuoc 1 kip cu the tinh thang K1/K2/KD (giong dong Kip mau phia tren), khong con dung X/XD nua.
  // Chi nguoi Tam-xoay-ca doc lap (khong gan kip nao) moi dung X/XD.
  const useShiftCodes = (emp.schedule==='CA') || (emp.schedule==='TAM' && emp.kipId);
  return (useShiftCodes ? CYCLE_CA : CYCLE_TAM)[idx];
}
function computeFinalCode(common, emp, y, m, d){
  const dateStr = fmtDate(y,m,d);
  const manual = state.grid[emp.id] && state.grid[emp.id][dateStr];
  if(manual) return manual;
  const reg = state.registrations[dateStr];
  if(reg){
    if(reg.phep && reg.phep.includes(emp.id)) return 'F';
    if(reg.swaps){
      for(const pair of reg.swaps){
        let partnerId = null;
        if(pair[0]===emp.id) partnerId = pair[1];
        else if(pair[1]===emp.id) partnerId = pair[0];
        if(partnerId){
          const partner = common.employees.find(e=>e.id===partnerId);
          if(partner) return computeAutoCode(common, partner, y, m, d);
        }
      }
    }
  }
  return computeAutoCode(common, emp, y, m, d);
}
function getEffectiveAllow(emp, y, m){
  if(y!=null && m!=null){
    const key = `${emp.id}_${y}-${String(m+1).padStart(2,'0')}`;
    const override = state.monthlyAllowances[key];
    if(override) return { m3: !!override.m3, pct5: !!override.pct5, neg5: !!override.neg5, ksg: !!emp.allow.ksg };
  }
  return emp.allow;
}
function employeePayroll(common, emp, y, m){
  const bacEntry = common.bacTable.find(b=>b[0]===emp.bac);
  const heso = bacEntry ? bacEntry[1] : 0;
  const mucLuong = common.settings.mucLuongToiThieu * heso;
  const phuCap = emp.phucap==='catruong' ? common.settings.mucLuongToiThieu*common.settings.heSoTca
               : emp.phucap==='totruong' ? common.settings.mucLuongToiThieu*common.settings.heSoTtruong : 0;
  const ks = isKS(emp.bac);
  const allow = getEffectiveAllow(emp, y, m);
  const hesoCDHieuLuc = Number(emp.hesoCD||0)
    + (allow.m3 ? (ks?0.25:0.16) : 0)
    + (allow.pct5 ? (ks?0.16:0.13) : 0)
    - (allow.neg5 ? (ks?0.16:0.13) : 0)
    + (allow.ksg ? 0.3 : 0);
  return { mucLuong, phuCap, tongLuongPhuCap: mucLuong+phuCap, hesoCDHieuLuc };
}
function empGroupColor(common, emp){
  if(emp.kipId){
    const k = common.kips.find(x=>x.id===emp.kipId);
    if(k && k.color) return k.color;
  }
  return null;
}

/* ================= Goi API ================= */
async function api(method, path, body){
  const res = await fetch(path, {
    method,
    headers: body ? {'Content-Type':'application/json'} : undefined,
    body: body ? JSON.stringify(body) : undefined,
    credentials: 'same-origin'
  });
  if(res.status === 401){ showLogin(); throw new Error('Chưa đăng nhập'); }
  if(!res.ok){
    let msg = 'Lỗi máy chủ';
    try{ const j = await res.json(); msg = j.error || msg; }catch(e){}
    throw new Error(msg);
  }
  const ct = res.headers.get('content-type') || '';
  return ct.includes('application/json') ? res.json() : res.text();
}

/* ================= Trang thai ung dung ================= */
let state = null;
let currentRole = 'user';
let currentEmail = '';
let viewYear, viewMonth;
// "common" = Common (nhan su/Kip/bac luong/cai dat) CUA DUNG THANG dang chon tren giao dien
// (viewYear/viewMonth) - moi thang mot ban rieng, doc lap hoan toan, lay tu /api/month/:year/:month.
let common = null;
// Cache theo "y-m" phong khi can nhieu thang cung luc (vd tab Tong hop nam quet ca 12 thang).
let commonCache = {};
async function getCommon(y, m){
  const key = y+'-'+(m+1);
  if(!commonCache[key]) commonCache[key] = await api('GET', `/api/month/${y}/${m+1}`);
  return commonCache[key];
}
async function refreshActiveCommon(){
  common = await getCommon(viewYear, viewMonth);
  return common;
}
// Sau khi sua Common (them/xoa/sua nhan su, Kip, bac luong...), goi ham nay de: xoa cache thang hien
// tai (vi vua doi), roi tai lai "common" cho dung voi thay doi moi nhat.
async function invalidateActiveCommon(){
  delete commonCache[viewYear+'-'+(viewMonth+1)];
  await refreshActiveCommon();
}

/* ================= Dang nhap ================= */
function showLogin(){
  document.getElementById('loginOverlay').classList.remove('hidden');
}
function hideLogin(){
  document.getElementById('loginOverlay').classList.add('hidden');
}
function updateRoleBadge(){
  const badge = document.getElementById('roleBadge');
  badge.textContent = (currentRole==='admin' ? '👑 Admin' : '👤 User') + (currentEmail ? ' — '+currentEmail : '');
  const backupBtn = document.getElementById('btnBackup');
  if(backupBtn) backupBtn.classList.toggle('hidden', currentRole!=='admin');
}

document.getElementById('btnLogin').addEventListener('click', doLogin);
document.getElementById('loginPassword').addEventListener('keydown', e=>{ if(e.key==='Enter') doLogin(); });

async function doLogin(){
  const email = document.getElementById('loginEmail').value;
  const password = document.getElementById('loginPassword').value;
  const errBox = document.getElementById('loginError');
  errBox.style.display = 'none';
  try{
    const res = await fetch('/api/auth/login', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({email, password}), credentials:'same-origin'
    });
    if(!res.ok){
      const j = await res.json().catch(()=>({}));
      errBox.textContent = j.error || 'Đăng nhập thất bại.';
      errBox.style.display = 'block';
      return;
    }
    const me = await res.json();
    currentRole = me.role; currentEmail = me.email;
    hideLogin();
    updateRoleBadge();
    await bootApp();
  }catch(err){
    errBox.textContent = 'Không kết nối được máy chủ: '+err.message;
    errBox.style.display = 'block';
  }
}

document.getElementById('btnLogout').addEventListener('click', async ()=>{
  await fetch('/api/auth/logout', {method:'POST', credentials:'same-origin'});
  currentRole='user'; currentEmail='';
  state = null;
  showLogin();
});

async function checkSession(){
  try{
    const res = await fetch('/api/auth/me', {credentials:'same-origin'});
    if(!res.ok) { showLogin(); return false; }
    const me = await res.json();
    currentRole = me.role; currentEmail = me.email;
    hideLogin();
    updateRoleBadge();
    return true;
  }catch(e){
    showLogin();
    return false;
  }
}

/* ================= Phan quyen giao dien (server van la noi thuc thi that) ================= */
function applyRolePermissions(){
  const isUser = (currentRole !== 'admin');
  document.querySelectorAll('#tab-common input, #tab-common select, #tab-common button').forEach(el=>{ el.disabled = isUser; });
  // Bo chon thang/nam cua Common la de XEM, khong phai sua du lieu - User van duoc doi thang de xem.
  ['selMonthCommon','selYearCommon'].forEach(id=>{ const el=document.getElementById(id); if(el) el.disabled = false; });
  document.querySelectorAll('#tab-chamcong select.daysel').forEach(el=>{ el.disabled = isUser; });
  document.querySelectorAll('#tab-tonghopnam input').forEach(el=>{ el.disabled = isUser; });
  document.querySelectorAll('#tab-anca input').forEach(el=>{ el.disabled = isUser; });
  ['btnClear','btnExportCSV'].forEach(id=>{ const el=document.getElementById(id); if(el) el.disabled = isUser; });
  const note = document.getElementById('commonRoleNote');
  if(note) note.classList.toggle('hidden', !isUser);
}

/* ================= Tabs ================= */
document.querySelectorAll('.tab-btn').forEach(btn=>{
  btn.addEventListener('click', ()=>{
    document.querySelectorAll('.tab-btn').forEach(b=>b.classList.remove('active'));
    btn.classList.add('active');
    ['common','chamcong','dangky','tonghopnam','anca','ghichu'].forEach(t=>{
      document.getElementById('tab-'+t).classList.toggle('hidden', btn.dataset.tab!==t);
    });
    if(btn.dataset.tab==='common') renderCommon();
    if(btn.dataset.tab==='chamcong') renderCalendar();
    if(btn.dataset.tab==='dangky') renderDangKy();
    if(btn.dataset.tab==='tonghopnam') renderTongHopNam();
    if(btn.dataset.tab==='anca') renderMeal();
  });
});

/* ================= Common tab ================= */
// Common gio la CUA RIENG TUNG THANG - moi lan doi thang o thanh cong cu (selMonthCommon/selYearCommon,
// dung chung voi cac tab khac qua viewYear/viewMonth) se tai lai dung ban cua thang do.
function bacOptionsHtml(selected){
  return common.bacTable.map(([b])=>`<option value="${b}" ${b===selected?'selected':''}>${b}</option>`).join('');
}
function renderCommon(){
  if(!common) return;
  const label = document.getElementById('commonMonthLabel');
  if(label) label.textContent = `Đang xem/sửa Common của tháng ${viewMonth+1}/${viewYear} — thay đổi ở đây CHỈ áp dụng cho đúng tháng này, không ảnh hưởng tháng khác.`;
  document.getElementById('mucLuongToiThieu').value = common.settings.mucLuongToiThieu;
  document.getElementById('heSoTca').value = common.settings.heSoTca;
  document.getElementById('heSoTtruong').value = common.settings.heSoTtruong;
  document.getElementById('anchorDate').value = common.settings.anchorDate;

  const body = document.getElementById('commonBody');
  body.innerHTML = '';
  common.employees.forEach((emp, idx)=>{
    const bacEntry = common.bacTable.find(b=>b[0]===emp.bac);
    const heso = bacEntry ? bacEntry[1] : 0;
    const mucLuong = common.settings.mucLuongToiThieu * heso;
    const phuCap = emp.phucap==='catruong' ? common.settings.mucLuongToiThieu*common.settings.heSoTca
                 : emp.phucap==='totruong' ? common.settings.mucLuongToiThieu*common.settings.heSoTtruong : 0;
    const ks = isKS(emp.bac);
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td style="text-align:center;color:var(--ink-soft)">${idx+1}</td>
      <td><input type="text" data-f="name" value="${escapeHtml(emp.name)}"></td>
      <td><input type="text" data-f="dob" value="${escapeHtml(emp.dob||'')}" placeholder="dd/mm/yyyy"></td>
      <td><input type="text" data-f="chucdanh" value="${escapeHtml(emp.chucdanh||'')}"></td>
      <td><input type="text" data-f="thangbang" value="${escapeHtml(emp.thangbang||'')}"></td>
      <td><select data-f="bac">${bacOptionsHtml(emp.bac)}</select></td>
      <td style="text-align:right">${heso.toFixed(2)}</td>
      <td style="text-align:right">${Math.round(mucLuong).toLocaleString('vi-VN')}</td>
      <td>
        <select data-f="phucap">
          <option value="none" ${emp.phucap==='none'?'selected':''}>Không</option>
          <option value="catruong" ${emp.phucap==='catruong'?'selected':''}>Trưởng ca (T.ca)</option>
          <option value="totruong" ${emp.phucap==='totruong'?'selected':''}>Tổ trưởng (T.trưởng)</option>
        </select>
        <div style="font-size:11px;color:var(--ink-soft);margin-top:2px">${Math.round(phuCap).toLocaleString('vi-VN')} đ</div>
      </td>
      <td style="text-align:right;font-weight:600">${Math.round(mucLuong+phuCap).toLocaleString('vi-VN')}</td>
      <td><input type="number" step="0.01" data-f="hesoCD" value="${emp.hesoCD}"></td>
      <td>
        <div class="chk-row"><input type="checkbox" data-f="m3" ${emp.allow.m3?'checked':''}> M3 (${ks?'0.25':'0.16'})</div>
        <div class="chk-row"><input type="checkbox" data-f="pct5" ${emp.allow.pct5?'checked':''}> +5% (${ks?'0.16':'0.13'})</div>
        <div class="chk-row"><input type="checkbox" data-f="neg5" ${emp.allow.neg5?'checked':''}> -5% (-${ks?'0.16':'0.13'})</div>
        <div class="chk-row"><input type="checkbox" data-f="ksg" ${emp.allow.ksg?'checked':''}> KSG (+0.3)</div>
      </td>
      <td>
        <select data-f="schedule">
          <option value="HC" ${emp.schedule==='HC'?'selected':''}>Hành chính (tuần)</option>
          <option value="TAM" ${emp.schedule==='TAM'?'selected':''}>Tầm xoay ca (X/XĐ)</option>
          <option value="CA" ${emp.schedule==='CA'?'selected':''}>Ca kíp (K1/K2/KD)</option>
        </select>
      </td>
      <td>
        <select data-f="kipId" ${emp.schedule==='HC'?'disabled':''}>
          <option value="" ${!emp.kipId?'selected':''}>— Không —</option>
          ${common.kips.map(k=>`<option value="${k.id}" ${emp.kipId===k.id?'selected':''}>${escapeHtml(k.label||k.id)}</option>`).join('')}
        </select>
      </td>
      <td><input type="text" data-f="ghiChu" value="${escapeHtml(emp.ghiChu||'')}" placeholder="Lý do ±5%, ghi chú khác..." style="width:100%"></td>
    `;
    tr.querySelectorAll('[data-f]').forEach(el=>{
      el.addEventListener('change', async ()=>{
        const f = el.dataset.f;
        const freshEmp = common.employees.find(x=>x.id===emp.id) || emp;
        if(['m3','pct5','neg5','ksg'].includes(f)){
          freshEmp.allow[f]=el.checked;
          // +5% va -5% loai tru nhau - bat 1 ben thi tu tat ben kia, tranh cong tru lan nhau vo nghia.
          if(f==='pct5' && el.checked) freshEmp.allow.neg5=false;
          if(f==='neg5' && el.checked) freshEmp.allow.pct5=false;
        }
        else if(f==='hesoCD'){ freshEmp[f]=parseFloat(el.value); }
        else if(f==='offset'){ freshEmp[f]=Number(el.value); }
        else if(f==='kipId'){ freshEmp[f]=el.value || null; }
        else { freshEmp[f]=el.value; }
        // Chi ghi vao dung thang dang xem (viewYear/viewMonth) - khong dung cham gi thang khac.
        await saveEmployees();
        renderCommon();
      });
    });
    body.appendChild(tr);
  });
  applyRolePermissions();
}

async function saveSettings(){
  try{ await api('PUT', `/api/month/${viewYear}/${viewMonth+1}/settings`, common.settings); }
  catch(e){ alert('Không lưu được: '+e.message); }
}
async function saveEmployees(){
  try{ await api('PUT', `/api/month/${viewYear}/${viewMonth+1}/employees`, common.employees); }
  catch(e){ alert('Không lưu được: '+e.message); }
}
async function saveBacTable(){
  try{ await api('PUT', `/api/month/${viewYear}/${viewMonth+1}/bactable`, common.bacTable); }
  catch(e){ alert('Không lưu được: '+e.message); }
}
async function saveKips(){
  try{ await api('PUT', `/api/month/${viewYear}/${viewMonth+1}/kips`, common.kips); }
  catch(e){ alert('Không lưu được: '+e.message); }
}

document.getElementById('mucLuongToiThieu').addEventListener('change', async e=>{ common.settings.mucLuongToiThieu=Number(e.target.value); await saveSettings(); renderCommon(); });
document.getElementById('heSoTca').addEventListener('change', async e=>{ common.settings.heSoTca=parseFloat(e.target.value); await saveSettings(); renderCommon(); });
document.getElementById('heSoTtruong').addEventListener('change', async e=>{ common.settings.heSoTtruong=parseFloat(e.target.value); await saveSettings(); renderCommon(); });
document.getElementById('anchorDate').addEventListener('change', async e=>{ common.settings.anchorDate=e.target.value; await saveSettings(); renderCalendar(); renderDangKy(); });

function renderBacTable(){
  const body = document.getElementById('bacBody');
  body.innerHTML = '';
  common.bacTable.forEach((row, i)=>{
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><input type="text" value="${escapeHtml(row[0])}" data-i="${i}" data-f="b" style="width:90px"></td>
      <td><input type="number" step="0.01" value="${row[1]}" data-i="${i}" data-f="v" style="width:70px"></td>
      <td><button class="btn" data-del="${i}" style="padding:2px 8px">✕</button></td>
    `;
    body.appendChild(tr);
  });
  body.querySelectorAll('input[data-f]').forEach(el=>{
    el.addEventListener('change', async ()=>{
      const i = Number(el.dataset.i);
      if(el.dataset.f==='b') common.bacTable[i][0]=el.value;
      else common.bacTable[i][1]=parseFloat(el.value);
      await saveBacTable();
      renderBacTable(); renderCommon();
    });
  });
  body.querySelectorAll('[data-del]').forEach(el=>{
    el.addEventListener('click', async ()=>{
      common.bacTable.splice(Number(el.dataset.del),1);
      await saveBacTable();
      renderBacTable(); renderCommon();
    });
  });
}
document.getElementById('btnAddBac').addEventListener('click', async ()=>{
  common.bacTable.push(['Bậc mới', 1.0]);
  await saveBacTable();
  renderBacTable();
});

function renderKipTable(){
  const body = document.getElementById('kipBody');
  body.innerHTML = '';
  common.kips.forEach((kip,i)=>{
    const idx0 = mod8(daysSinceAnchor(common, viewYear, viewMonth, 1) + Number(kip.offset||0));
    const codeDay1 = CYCLE_CA[idx0] || 'nghỉ';
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><input type="text" value="${escapeHtml(kip.label)}" data-i="${i}" data-f="label" style="width:90px"></td>
      <td><input type="number" min="0" max="7" value="${kip.offset}" data-i="${i}" data-f="offset" style="width:60px"></td>
      <td><input type="color" value="${kip.color||'#EEF3F6'}" data-i="${i}" data-f="color" style="width:50px; padding:0; border:none; height:26px;"></td>
      <td style="text-align:center">${codeDay1}</td>
      <td><button class="btn" data-del="${i}" style="padding:2px 8px">✕</button></td>
    `;
    body.appendChild(tr);
  });
  body.querySelectorAll('input[data-f]').forEach(el=>{
    el.addEventListener('change', async ()=>{
      const i = Number(el.dataset.i);
      if(el.dataset.f==='label') common.kips[i].label = el.value;
      else if(el.dataset.f==='color') common.kips[i].color = el.value;
      else common.kips[i].offset = Number(el.value);
      await saveKips();
      renderKipTable(); renderCalendar(); renderDangKy();
    });
  });
  body.querySelectorAll('[data-del]').forEach(el=>{
    el.addEventListener('click', async ()=>{
      common.kips.splice(Number(el.dataset.del),1);
      await saveKips();
      renderKipTable();
    });
  });
}
document.getElementById('btnAddKip').addEventListener('click', async ()=>{
  common.kips.push({id:'K'+(common.kips.length+1), label:'Kíp mới', offset:0, color:'#EEF3F6'});
  await saveKips();
  renderKipTable();
});

/* ================= Snapshot tu dong ================= */
function formatSnapshotName(filename){
  const m = filename.match(/snapshot_(.+)\.json/);
  if(!m) return filename;
  const raw = m[1]; // vd: 2026-07-19T12-34-56-789Z
  const tIdx = raw.indexOf('T');
  if(tIdx<0) return filename;
  const datePart = raw.slice(0, tIdx);
  const timePart = raw.slice(tIdx+1).replace('Z','');
  const parts = timePart.split('-'); // [hh, mm, ss, ms]
  const iso = `${datePart}T${parts[0]}:${parts[1]}:${parts[2]}.${parts[3]||'000'}Z`;
  const d = new Date(iso);
  if(isNaN(d)) return filename;
  return d.toLocaleString('vi-VN');
}
async function renderSnapshots(){
  const body = document.getElementById('snapshotBody');
  body.innerHTML = '<tr><td colspan="2">Đang tải...</td></tr>';
  try{
    const list = await api('GET', '/api/admin/snapshots');
    if(!list.length){ body.innerHTML = '<tr><td colspan="2">Chưa có snapshot nào (sẽ tự xuất hiện sau khi có thay đổi dữ liệu).</td></tr>'; return; }
    body.innerHTML = '';
    list.forEach(filename=>{
      const tr = document.createElement('tr');
      const tdTime = document.createElement('td');
      tdTime.textContent = formatSnapshotName(filename);
      tr.appendChild(tdTime);
      const tdAction = document.createElement('td');
      const dlBtn = document.createElement('a');
      dlBtn.className = 'btn'; dlBtn.textContent = 'Tải xuống'; dlBtn.style.marginRight='6px';
      dlBtn.href = '/api/admin/snapshots/'+encodeURIComponent(filename);
      const restoreBtn = document.createElement('button');
      restoreBtn.className = 'btn'; restoreBtn.textContent = 'Khôi phục';
      restoreBtn.addEventListener('click', async ()=>{
        if(!confirm('Khôi phục sẽ THAY THẾ TOÀN BỘ dữ liệu hiện tại bằng đúng bản snapshot lúc '+formatSnapshotName(filename)+'. Bạn chắc chắn chứ?')) return;
        try{
          await api('POST', '/api/admin/snapshots/'+encodeURIComponent(filename)+'/restore', {});
          alert('Đã khôi phục xong. Trang sẽ tự tải lại.');
          location.reload();
        }catch(e){ alert('Không khôi phục được: '+e.message); }
      });
      tdAction.appendChild(dlBtn); tdAction.appendChild(restoreBtn);
      tr.appendChild(tdAction);
      body.appendChild(tr);
    });
  }catch(e){
    body.innerHTML = '<tr><td colspan="2">Không tải được danh sách: '+e.message+'</td></tr>';
  }
}
document.getElementById('btnRefreshSnapshots').addEventListener('click', renderSnapshots);

document.getElementById('btnRestoreUpload').addEventListener('click', ()=>{
  document.getElementById('restoreFileInput').click();
});
document.getElementById('restoreFileInput').addEventListener('change', async (e)=>{
  const file = e.target.files[0];
  e.target.value = ''; // reset de lan sau chon lai cung 1 file van kich hoat
  if(!file) return;
  let payload;
  try{
    payload = JSON.parse(await file.text());
  }catch(err){
    alert('File không đọc được (không phải JSON hợp lệ): '+err.message);
    return;
  }
  if(!confirm('Khôi phục từ file "'+file.name+'" sẽ THAY THẾ TOÀN BỘ dữ liệu hiện tại trên server bằng nội dung file này. Bạn chắc chắn chứ?')) return;
  try{
    await api('POST', '/api/admin/restore-upload', payload);
    alert('Đã khôi phục xong từ file. Trang sẽ tự tải lại.');
    location.reload();
  }catch(err){
    alert('Không khôi phục được: '+err.message);
  }
});

function formatShareStamp(filename){
  // dang ct34_2026-08-02T13-05-00-123Z.json hoac ct34_2026-08-02.json
  const m = filename.match(/ct34_(.+)\.json/);
  if(!m) return filename;
  const raw = m[1];
  if(!raw.includes('T')) return raw; // dang ngay, hien nguyen YYYY-MM-DD
  const tIdx = raw.indexOf('T');
  const datePart = raw.slice(0, tIdx);
  const timePart = raw.slice(tIdx+1).replace('Z','');
  const parts = timePart.split('-');
  const iso = `${datePart}T${parts[0]}:${parts[1]}:${parts[2]}.${parts[3]||'000'}Z`;
  const d = new Date(iso);
  return isNaN(d) ? filename : d.toLocaleString('vi-VN');
}
async function renderShareBackups(){
  const body = document.getElementById('shareBackupBody');
  body.innerHTML = '<tr><td colspan="4">Đang tải...</td></tr>';
  const DEST_LABELS = {share:'/share', nasdata:'NASDATA'};
  try{
    const data = await api('GET', '/api/admin/share-backups');
    const rows = [];
    Object.keys(data).forEach(dest=>{
      (data[dest].daily||[]).forEach(f=>rows.push({dest, folder:'daily', label:'Theo ngày', filename:f}));
      (data[dest].history||[]).forEach(f=>rows.push({dest, folder:'history', label:'Theo thời điểm', filename:f}));
    });
    if(!rows.length){ body.innerHTML = '<tr><td colspan="4">Chưa có bản nào.</td></tr>'; return; }
    body.innerHTML = '';
    rows.forEach(({dest, folder, label, filename})=>{
      const tr = document.createElement('tr');
      const tdSrc = document.createElement('td'); tdSrc.textContent = DEST_LABELS[dest]||dest; tr.appendChild(tdSrc);
      const tdType = document.createElement('td'); tdType.textContent = label; tr.appendChild(tdType);
      const tdTime = document.createElement('td'); tdTime.textContent = formatShareStamp(filename); tr.appendChild(tdTime);
      const tdAction = document.createElement('td');
      const restoreBtn = document.createElement('button');
      restoreBtn.className = 'btn'; restoreBtn.textContent = 'Khôi phục';
      restoreBtn.addEventListener('click', async ()=>{
        if(!confirm('Khôi phục sẽ THAY THẾ TOÀN BỘ dữ liệu hiện tại bằng đúng bản ('+(DEST_LABELS[dest]||dest)+' - '+label+') lúc '+formatShareStamp(filename)+'. Bạn chắc chắn chứ?')) return;
        try{
          await api('POST', '/api/admin/share-backups/'+dest+'/'+folder+'/'+encodeURIComponent(filename)+'/restore', {});
          alert('Đã khôi phục xong. Trang sẽ tự tải lại.');
          location.reload();
        }catch(e){ alert('Không khôi phục được: '+e.message); }
      });
      tdAction.appendChild(restoreBtn);
      tr.appendChild(tdAction);
      body.appendChild(tr);
    });
  }catch(e){
    body.innerHTML = '<tr><td colspan="4">Không tải được danh sách: '+e.message+'</td></tr>';
  }
}
document.getElementById('btnRefreshShareBackups').addEventListener('click', renderShareBackups);

/* ================= Bang Cong tab ================= */
function initMonthYearControls(){
  const selMonth = document.getElementById('selMonth');
  const selMonthDK = document.getElementById('selMonthDK');
  const selMonthCommon = document.getElementById('selMonthCommon');
  [selMonth, selMonthDK, selMonthCommon].forEach(sel=>{
    sel.innerHTML = '';
    for(let m=0;m<12;m++){
      const opt = document.createElement('option'); opt.value=m; opt.textContent='Tháng '+(m+1); sel.appendChild(opt);
    }
  });
  const now = new Date();
  viewYear = now.getFullYear(); viewMonth = now.getMonth();
  selMonth.value = viewMonth; selMonthDK.value = viewMonth; selMonthCommon.value = viewMonth;
  document.getElementById('selYear').value = viewYear;
  document.getElementById('selYearDK').value = viewYear;
  document.getElementById('selYearCommon').value = viewYear;
  // "common" (Common cua dung thang dang chon) la nguon du lieu dung chung cho ca 4 tab Common/Bang Cong/
  // Cham cong/An ca - moi lan doi thang o BAT KY tab nao trong so nay deu phai tai lai dung "common" roi
  // moi ve lai, khong thi cac tab con lai se hien du lieu cua thang cu.
  async function onMonthYearChange(){
    selMonth.value = viewMonth; selMonthDK.value = viewMonth; selMonthCommon.value = viewMonth;
    document.getElementById('selYear').value = viewYear;
    document.getElementById('selYearDK').value = viewYear;
    document.getElementById('selYearCommon').value = viewYear;
    await refreshActiveCommon();
    renderCommon(); renderCalendar(); renderDangKy();
    const anCaTab = document.getElementById('tab-anca');
    if(anCaTab && !anCaTab.classList.contains('hidden')) renderMeal();
  }
  selMonth.addEventListener('change', ()=>{ viewMonth=Number(selMonth.value); onMonthYearChange(); });
  selMonthDK.addEventListener('change', ()=>{ viewMonth=Number(selMonthDK.value); onMonthYearChange(); });
  selMonthCommon.addEventListener('change', ()=>{ viewMonth=Number(selMonthCommon.value); onMonthYearChange(); });
  document.getElementById('selYear').addEventListener('change', e=>{ viewYear=Number(e.target.value); onMonthYearChange(); });
  document.getElementById('selYearDK').addEventListener('change', e=>{ viewYear=Number(e.target.value); onMonthYearChange(); });
  document.getElementById('selYearCommon').addEventListener('change', e=>{ viewYear=Number(e.target.value); onMonthYearChange(); });

  const selYearTHN = document.getElementById('selYearTHN');
  selYearTHN.innerHTML = '';
  for(let y=viewYear-2; y<=viewYear+2; y++){
    const opt = document.createElement('option'); opt.value=y; opt.textContent='Năm '+y; selYearTHN.appendChild(opt);
  }
  selYearTHN.value = viewYear;
  selYearTHN.addEventListener('change', ()=>{ renderTongHopNam(); });
}

function renderLegendBar(){
  const bar = document.getElementById('legendBar');
  bar.innerHTML = CODE_ORDER.filter(c=>c!=='').map(c=>{
    const m = CODES[c];
    return `<span class="legend-chip"><span class="swatch" style="background:${m.color}"></span>${c} — ${m.name}</span>`;
  }).join('');
}
function codeSelectHtml(current){
  return CODE_ORDER.map(c=>{
    const label = c==='' ? '·' : c;
    return `<option value="${c}" ${c===current?'selected':''}>${label}</option>`;
  }).join('');
}
async function setGridCode(empId, dateStr, code){
  if(!state.grid[empId]) state.grid[empId] = {};
  if(code==='') delete state.grid[empId][dateStr];
  else state.grid[empId][dateStr] = code;
  try{ await api('PUT', '/api/state/grid', {empId, dateStr, code}); }
  catch(e){ alert('Không lưu được: '+e.message); }
}

function kipRowHtml(kip, nDays, leadCols, padCols){
  const tr = document.createElement('tr');
  tr.classList.add('kiprow');
  const groupColor = kip.color || '#EEF3F6';
  const nameTd = document.createElement('td');
  nameTd.className='namecell';
  nameTd.style.background=groupColor;
  nameTd.textContent = (kip.label||kip.id);
  tr.appendChild(nameTd);
  for(let L=0; L<leadCols; L++){
    const td = document.createElement('td');
    td.style.background = groupColor;
    tr.appendChild(td);
  }
  for(let d=1; d<=nDays; d++){
    const idx = mod8(daysSinceAnchor(common, viewYear, viewMonth, d) + Number(kip.offset||0));
    const letter = PHASE_LETTERS[idx];
    const dow = new Date(viewYear, viewMonth, d).getDay();
    const wknd = (dow===0||dow===6);
    const td = document.createElement('td');
    if(wknd) td.classList.add('weekend');
    td.style.fontWeight = '700';
    td.style.color = letter ? '#2C5F7C' : '#b7bec5';
    td.textContent = letter || '·';
    tr.appendChild(td);
  }
  for(let p=0; p<padCols; p++){
    const td = document.createElement('td');
    td.style.background = groupColor;
    tr.appendChild(td);
  }
  return tr;
}
function blankRowHtml(nDays, leadCols, padCols){
  const tr = document.createElement('tr');
  tr.classList.add('blankrow');
  for(let i=0; i<1+leadCols+nDays+padCols; i++) tr.appendChild(document.createElement('td'));
  return tr;
}
function groupedRenderOrder(){
  const kipIds = new Set(common.kips.map(k=>k.id));
  const order = [];
  common.employees.filter(e=>!e.kipId || !kipIds.has(e.kipId)).forEach(e=>order.push({type:'emp', emp:e}));
  common.kips.forEach((kip,i)=>{
    if(i>0) order.push({type:'blank'});
    order.push({type:'kip', kip});
    common.employees.filter(e=>e.kipId===kip.id).forEach(e=>order.push({type:'emp', emp:e}));
  });
  return order;
}
function makeTh(text,isName,wknd){
  const th=document.createElement('th');
  th.textContent=text;
  if(isName) th.classList.add('namecell');
  if(wknd) th.classList.add('weekend');
  return th;
}

function buildBangCongRow(emp, nDays){
  const tr = document.createElement('tr');
  const nameTd = document.createElement('td');
  nameTd.className='namecell';
  nameTd.textContent = emp.name;
  tr.appendChild(nameTd);

  const pay = employeePayroll(common, emp, viewYear, viewMonth);
  const mucLuongTd = document.createElement('td');
  mucLuongTd.textContent = Math.round(pay.tongLuongPhuCap).toLocaleString('vi-VN');
  mucLuongTd.style.textAlign = 'right';
  tr.appendChild(mucLuongTd);

  const hesoTd = document.createElement('td');
  hesoTd.textContent = pay.hesoCDHieuLuc.toFixed(2);
  hesoTd.style.textAlign = 'center';
  tr.appendChild(hesoTd);

  const count = {};
  CODE_ORDER.forEach(c=>count[c]=0);

  for(let d=1; d<=nDays; d++){
    const dateStr = fmtDate(viewYear, viewMonth, d);
    const dow = new Date(viewYear, viewMonth, d).getDay();
    const wknd = (dow===0||dow===6);
    const code = computeFinalCode(common, emp, viewYear, viewMonth, d);
    count[code] = (count[code]||0)+1;
    const td = document.createElement('td');
    if(wknd) td.classList.add('weekend');
    const sel = document.createElement('select');
    sel.className = 'daysel';
    sel.innerHTML = codeSelectHtml(code);
    const swapColor = getSwapPairColor(dateStr, emp.id);
    if(code==='F'){
      sel.style.background = '#FFE08A';
      sel.style.color = '#5c4500';
    } else if(swapColor){
      sel.style.background = swapColor;
      sel.style.color = '#1F2933';
    } else {
      sel.style.background = '#fff';
      sel.style.color = code ? '#1F2933' : '#b7bec5';
    }
    sel.style.fontWeight = '700';
    sel.addEventListener('change', async ()=>{
      await setGridCode(emp.id, dateStr, sel.value);
      renderCalendar();
    });
    td.appendChild(sel);
    tr.appendChild(td);
  }

  const AJ = WORK_CODES.reduce((s,c)=>s+count[c],0);
  const AK = count['XĐ']+count['KD'];
  const AL = count['L']+count['F']+count['XL']+count['XLĐ']+count['K1L']+count['K2L']+count['KDL'];
  const AM = count['DL'];
  const AO = count['XL']+count['XLĐ']+count['K1L']+count['K2L']+count['KDL'];
  const AP = count['Rc'];
  const AQ = count['Ô']+count['TN']+count['TS'];
  const AR = count['XLĐ']+count['KDL'];
  const AU = count['F'];
  const AV = count['L'];
  const AW = count['B']+count['BL'];

  [AJ,AK,AL,AM,AO,AP,AQ,AR,AU,AV,AW].forEach(v=>{
    const td = document.createElement('td');
    td.className='sumcell';
    td.textContent = v;
    tr.appendChild(td);
  });
  return tr;
}

function renderCalendar(){
  if(!state || !common) return;
  const nDays = daysInMonth(viewYear, viewMonth);
  const table = document.getElementById('ccTable');
  table.innerHTML = '';
  renderLegendBar();

  const thead = document.createElement('thead');
  const rowDow = document.createElement('tr');
  const rowDate = document.createElement('tr');
  rowDow.appendChild(makeTh('Nhân sự', true));
  rowDate.appendChild(makeTh('', true));
  rowDow.appendChild(makeTh('Mức lương',false));
  rowDate.appendChild(makeTh('',false));
  rowDow.appendChild(makeTh('Hệ số lương chức danh',false));
  rowDate.appendChild(makeTh('',false));
  for(let d=1; d<=nDays; d++){
    const dow = new Date(viewYear, viewMonth, d).getDay();
    const wknd = (dow===0||dow===6);
    rowDow.appendChild(makeTh(WEEKDAY_LABELS[dow].replace('Thứ ','T').replace('Chủ nhật','CN'), false, wknd));
    rowDate.appendChild(makeTh(String(d), false, wknd));
  }
  ['Công','Ca 3','Lễ+phép','Du lịch','Bù lễ','Riêng lg','Ốm/TN/TS','Ca3 lễ','Phép','Lễ','Bù'].forEach(h=>{
    rowDow.appendChild(makeTh(h,false)); rowDate.appendChild(makeTh('',false));
  });
  thead.appendChild(rowDow); thead.appendChild(rowDate);
  table.appendChild(thead);

  const tbody = document.createElement('tbody');
  groupedRenderOrder().forEach(item=>{
    if(item.type==='kip') tbody.appendChild(kipRowHtml(item.kip, nDays, 2, 11));
    else if(item.type==='blank') tbody.appendChild(blankRowHtml(nDays, 2, 11));
    else tbody.appendChild(buildBangCongRow(item.emp, nDays));
  });
  tbody.appendChild(buildBangCongTotalsRow(nDays));
  table.appendChild(tbody);
  applyRolePermissions();
}

function buildBangCongTotalsRow(nDays){
  const tr = document.createElement('tr');
  tr.classList.add('totalrow');
  const nameTd = document.createElement('td');
  nameTd.className = 'namecell';
  nameTd.textContent = 'Tổng cộng';
  nameTd.style.fontWeight = '700';
  tr.appendChild(nameTd);

  let totalLuong = 0, totalHeso = 0;
  const totals = {AJ:0,AK:0,AL:0,AM:0,AO:0,AP:0,AQ:0,AR:0,AU:0,AV:0,AW:0};
  common.employees.forEach(emp=>{
    const pay = employeePayroll(common, emp, viewYear, viewMonth);
    totalLuong += pay.tongLuongPhuCap;
    totalHeso += pay.hesoCDHieuLuc;
    const count = {}; CODE_ORDER.forEach(c=>count[c]=0);
    for(let d=1; d<=nDays; d++){
      const code = computeFinalCode(common, emp, viewYear, viewMonth, d);
      count[code] = (count[code]||0)+1;
    }
    totals.AJ += WORK_CODES.reduce((s,c)=>s+count[c],0);
    totals.AK += count['XĐ']+count['KD'];
    totals.AL += count['L']+count['F']+count['XL']+count['XLĐ']+count['K1L']+count['K2L']+count['KDL'];
    totals.AM += count['DL'];
    totals.AO += count['XL']+count['XLĐ']+count['K1L']+count['K2L']+count['KDL'];
    totals.AP += count['Rc'];
    totals.AQ += count['Ô']+count['TN']+count['TS'];
    totals.AR += count['XLĐ']+count['KDL'];
    totals.AU += count['F'];
    totals.AV += count['L'];
    totals.AW += count['B']+count['BL'];
  });

  const mucLuongTd = document.createElement('td');
  mucLuongTd.textContent = Math.round(totalLuong).toLocaleString('vi-VN');
  mucLuongTd.style.textAlign = 'right';
  mucLuongTd.style.fontWeight = '700';
  tr.appendChild(mucLuongTd);
  const hesoTd = document.createElement('td');
  hesoTd.textContent = totalHeso.toFixed(2);
  hesoTd.style.textAlign = 'center';
  hesoTd.style.fontWeight = '700';
  tr.appendChild(hesoTd);

  for(let d=1; d<=nDays; d++) tr.appendChild(document.createElement('td'));

  ['AJ','AK','AL','AM','AO','AP','AQ','AR','AU','AV','AW'].forEach(key=>{
    const td = document.createElement('td');
    td.className = 'sumcell';
    td.style.fontWeight = '700';
    td.textContent = totals[key];
    tr.appendChild(td);
  });
  return tr;
}

document.getElementById('btnClear').addEventListener('click', async ()=>{
  if(!confirm('Xoá toàn bộ ghi đè thủ công tháng '+(viewMonth+1)+'/'+viewYear+'? (Lịch tự động + đăng ký F/đổi ca vẫn giữ nguyên)')) return;
  try{
    const res = await api('POST', '/api/state/grid-clear-month', {year: viewYear, month: viewMonth+1});
    state = await api('GET', '/api/state');
    renderCalendar();
    alert('Đã xoá xong '+res.count+' ô ghi đè của tháng '+(viewMonth+1)+'/'+viewYear+'.');
  }catch(e){ alert('Không xoá được: '+e.message); }
});

document.getElementById('btnExportCSV').addEventListener('click', ()=>{
  window.location.href = `/api/export/excel?year=${viewYear}&month=${viewMonth+1}`;
});
document.getElementById('btnExportAnCa').addEventListener('click', ()=>{
  window.location.href = `/api/export/excel-anca?year=${viewYear}&month=${viewMonth+1}`;
});

/* ================= Cham cong (dang ky doi ca / nghi phep) tab ================= */
let regMode = 'phep';
let pendingSwap = null;

function isPhep(dateStr, empId){
  const r = state.registrations[dateStr];
  return !!(r && r.phep && r.phep.includes(empId));
}
function getSwapPartner(dateStr, empId){
  const r = state.registrations[dateStr];
  if(!r || !r.swaps) return null;
  for(const pair of r.swaps){ if(pair[0]===empId) return pair[1]; if(pair[1]===empId) return pair[0]; }
  return null;
}
const SWAP_PAIR_COLORS = ['#BEE3F8','#D9F2D2','#FFE3B3','#E4D6F7','#FFD3DE','#C8ECEA','#F5E1B8','#D6E4F0'];
function getSwapPairColor(dateStr, empId){
  const r = state.registrations[dateStr];
  if(!r || !r.swaps) return null;
  const idx = r.swaps.findIndex(pair=>pair[0]===empId || pair[1]===empId);
  if(idx<0) return null;
  return SWAP_PAIR_COLORS[idx % SWAP_PAIR_COLORS.length];
}
function empNameById(id){ const e = common.employees.find(x=>x.id===id); return e ? e.name : id; }

document.getElementById('btnGenKip').addEventListener('click', ()=>{
  renderDangKy();
  const btn = document.getElementById('btnGenKip');
  const old = btn.textContent;
  btn.textContent = '✓ Đã sinh lịch Tháng '+(viewMonth+1)+'/'+viewYear;
  setTimeout(()=>{ btn.textContent = old; }, 1400);
});
document.getElementById('modePhep').addEventListener('click', ()=>{
  regMode='phep'; pendingSwap=null;
  document.getElementById('modePhep').classList.add('active');
  document.getElementById('modeSwap').classList.remove('active');
});
document.getElementById('modeSwap').addEventListener('click', ()=>{
  regMode='swap'; pendingSwap=null;
  document.getElementById('modeSwap').classList.add('active');
  document.getElementById('modePhep').classList.remove('active');
});

async function onRegCellClick(dateStr, empId){
  try{
    if(regMode==='phep'){
      const r = await api('POST', '/api/state/registrations/phep', {dateStr, empId});
      state.registrations[dateStr] = r;
    } else {
      const partner = getSwapPartner(dateStr, empId);
      if(partner){
        await api('DELETE', '/api/state/registrations/swap', {dateStr, empId});
        if(state.registrations[dateStr]) state.registrations[dateStr].swaps = state.registrations[dateStr].swaps.filter(p=>p[0]!==empId && p[1]!==empId);
        pendingSwap = null;
      } else if(pendingSwap && pendingSwap.dateStr===dateStr && pendingSwap.empId===empId){
        pendingSwap = null;
      } else if(pendingSwap && pendingSwap.dateStr===dateStr){
        const r = await api('POST', '/api/state/registrations/swap', {dateStr, empIdA: pendingSwap.empId, empIdB: empId});
        state.registrations[dateStr] = r;
        pendingSwap = null;
      } else {
        pendingSwap = {dateStr, empId};
      }
    }
  }catch(e){
    alert('Không lưu được đăng ký: '+e.message);
  }
  renderDangKy();
  renderCalendar();
}

function buildDangKyRow(emp, nDays){
  const tr = document.createElement('tr');
  const nameTd = document.createElement('td');
  nameTd.className='namecell';
  nameTd.textContent = emp.name;
  tr.appendChild(nameTd);
  for(let d=1; d<=nDays; d++){
    const dateStr = fmtDate(viewYear, viewMonth, d);
    const dow = new Date(viewYear, viewMonth, d).getDay();
    const wknd = (dow===0||dow===6);
    const phep = isPhep(dateStr, emp.id);
    const partner = getSwapPartner(dateStr, emp.id);
    const pairColor = partner ? getSwapPairColor(dateStr, emp.id) : null;
    const pending = pendingSwap && pendingSwap.dateStr===dateStr && pendingSwap.empId===emp.id;
    const td = document.createElement('td');
    if(wknd) td.classList.add('weekend');
    const div = document.createElement('div');
    div.className = 'dk-cell' + (phep?' dk-phep':'') + (pending?' dk-pending':'');
    if(pairColor) div.style.background = pairColor;
    div.textContent = phep ? 'F' : (partner ? '⇄' : '');
    if(partner) div.title = 'Đổi ca với: ' + empNameById(partner);
    div.addEventListener('click', ()=>onRegCellClick(dateStr, emp.id));
    td.appendChild(div);
    tr.appendChild(td);
  }
  return tr;
}

function renderDangKy(){
  if(!state || !common) return;
  const nDays = daysInMonth(viewYear, viewMonth);
  const table = document.getElementById('dkTable');
  table.innerHTML = '';

  const thead = document.createElement('thead');
  const rowDow = document.createElement('tr');
  const rowDate = document.createElement('tr');
  rowDow.appendChild(makeTh('Nhân sự', true));
  rowDate.appendChild(makeTh('', true));
  for(let d=1; d<=nDays; d++){
    const dow = new Date(viewYear, viewMonth, d).getDay();
    const wknd = (dow===0||dow===6);
    rowDow.appendChild(makeTh(WEEKDAY_LABELS[dow].replace('Thứ ','T').replace('Chủ nhật','CN'), false, wknd));
    rowDate.appendChild(makeTh(String(d), false, wknd));
  }
  thead.appendChild(rowDow); thead.appendChild(rowDate);
  table.appendChild(thead);

  const tbody = document.createElement('tbody');
  groupedRenderOrder().forEach(item=>{
    if(item.type==='kip') tbody.appendChild(kipRowHtml(item.kip, nDays, 0, 0));
    else if(item.type==='blank') tbody.appendChild(blankRowHtml(nDays, 0, 0));
    else tbody.appendChild(buildDangKyRow(item.emp, nDays));
  });
  table.appendChild(tbody);
  renderRegSummary(nDays);
}

function renderRegSummary(nDays){
  const box = document.getElementById('dkSummary');
  const lines = [];
  for(let d=1; d<=nDays; d++){
    const dateStr = fmtDate(viewYear, viewMonth, d);
    const r = state.registrations[dateStr];
    if(!r) continue;
    (r.phep||[]).forEach(empId=>lines.push(`Ngày ${d}: <b>${escapeHtml(empNameById(empId))}</b> đăng ký nghỉ phép (F)`));
    (r.swaps||[]).forEach(pair=>lines.push(`Ngày ${d}: <b>${escapeHtml(empNameById(pair[0]))}</b> đổi ca với <b>${escapeHtml(empNameById(pair[1]))}</b>`));
  }
  box.innerHTML = lines.length ? lines.join('<br>') : 'Chưa có đăng ký nào trong tháng này.';
}

/* ================= An ca tab ================= */
function mealKey(empId){ return `${empId}_${viewYear}-${String(viewMonth+1).padStart(2,'0')}`; }

async function saveMealOverride(empId, patch){
  const key = mealKey(empId);
  const existing = state.mealOverrides[key] || {soCong:null, soCa3:null, soBuaAn:null, ghiChu:''};
  const merged = Object.assign({}, existing, patch);
  state.mealOverrides[key] = merged;
  try{
    await api('PUT', '/api/state/meal-override', {
      empId, yearMonth: `${viewYear}-${String(viewMonth+1).padStart(2,'0')}`,
      soCong: merged.soCong, soCa3: merged.soCa3, soBuaAn: merged.soBuaAn, ghiChu: merged.ghiChu
    });
  }catch(e){ alert('Không lưu được: '+e.message); }
}

function renderMeal(){
  if(!state || !common) return;
  const nDays = daysInMonth(viewYear, viewMonth);
  const body = document.getElementById('mealBody');
  body.innerHTML='';
  let totalCong = 0, totalCa3 = 0, totalBuaAn = 0;
  common.employees.forEach((emp, idx)=>{
    const count={}; CODE_ORDER.forEach(c=>count[c]=0);
    for(let d=1; d<=nDays; d++){
      const code = computeFinalCode(common, emp, viewYear, viewMonth, d);
      count[code]=(count[code]||0)+1;
    }
    const AJ = WORK_CODES.reduce((s,c)=>s+count[c],0);
    const ca3Auto = count['KD']+count['XĐ']+count['KDL']+count['XLĐ'];
    const mealAuto = Math.max(0, AJ-ca3Auto);
    const ov = state.mealOverrides[mealKey(emp.id)] || {soCong:null, soCa3:null, soBuaAn:null, ghiChu:''};
    const effCong = (ov.soCong===null||ov.soCong===undefined) ? AJ : ov.soCong;
    const effCa3 = (ov.soCa3===null||ov.soCa3===undefined) ? ca3Auto : ov.soCa3;
    const effBuaAn = (ov.soBuaAn===null||ov.soBuaAn===undefined) ? mealAuto : ov.soBuaAn;
    totalCong += Number(effCong)||0;
    totalCa3 += Number(effCa3)||0;
    totalBuaAn += Number(effBuaAn)||0;

    const tr = document.createElement('tr');
    const tdTT = document.createElement('td'); tdTT.textContent = idx+1; tr.appendChild(tdTT);
    const tdName = document.createElement('td'); tdName.textContent = emp.name; tr.appendChild(tdName);

    function numCell(value, autoValue, field){
      const td = document.createElement('td');
      const inp = document.createElement('input');
      inp.type = 'number';
      inp.style.width = '100%';
      inp.style.textAlign = 'center';
      inp.value = (value===null||value===undefined) ? autoValue : value;
      if(value===null||value===undefined) inp.style.color = 'var(--ink-soft)';
      inp.addEventListener('change', async ()=>{
        const v = inp.value==='' ? null : Number(inp.value);
        await saveMealOverride(emp.id, {[field]: v});
        renderMeal();
      });
      td.appendChild(inp);
      return td;
    }
    tr.appendChild(numCell(ov.soCong, AJ, 'soCong'));
    tr.appendChild(numCell(ov.soCa3, ca3Auto, 'soCa3'));
    tr.appendChild(numCell(ov.soBuaAn, mealAuto, 'soBuaAn'));

    const tdNote = document.createElement('td');
    const noteInp = document.createElement('input');
    noteInp.type = 'text';
    noteInp.style.width = '100%';
    noteInp.value = ov.ghiChu || '';
    noteInp.placeholder = 'Ghi chú...';
    noteInp.addEventListener('change', async ()=>{
      await saveMealOverride(emp.id, {ghiChu: noteInp.value});
    });
    tdNote.appendChild(noteInp);
    tr.appendChild(tdNote);

    body.appendChild(tr);
  });

  const totalTr = document.createElement('tr');
  totalTr.classList.add('totalrow');
  const tdBlank1 = document.createElement('td'); totalTr.appendChild(tdBlank1);
  const tdLabel = document.createElement('td'); tdLabel.textContent = 'Tổng cộng'; tdLabel.style.fontWeight='700'; totalTr.appendChild(tdLabel);
  [totalCong, totalCa3, totalBuaAn].forEach(v=>{
    const td = document.createElement('td');
    td.textContent = v;
    td.style.textAlign = 'center';
    td.style.fontWeight = '700';
    totalTr.appendChild(td);
  });
  totalTr.appendChild(document.createElement('td'));
  body.appendChild(totalTr);

  applyRolePermissions();
}

/* ================= Tong hop nam tab ================= */
const THN_MONTH_LABELS = ['T1','T2','T3','T4','T5','T6','T7','T8','T9','T10','T11','T12'];

async function saveMonthlyAllowance(empId, year, month, m3, pct5, neg5){
  const yearMonth = `${year}-${String(month+1).padStart(2,'0')}`;
  const key = `${empId}_${yearMonth}`;
  state.monthlyAllowances[key] = {m3, pct5, neg5};
  try{
    await api('PUT', '/api/state/monthly-allowance', {empId, yearMonth, m3, pct5, neg5});
  }catch(e){ alert('Không lưu được: '+e.message); }
}
async function savePhepOverride(empId, year, month, soNgay){
  const yearMonth = `${year}-${String(month+1).padStart(2,'0')}`;
  const key = `${empId}_${yearMonth}`;
  if(soNgay===null) delete state.phepOverrides[key]; else state.phepOverrides[key] = soNgay;
  try{
    await api('PUT', '/api/state/phep-override', {empId, yearMonth, soNgay});
  }catch(e){ alert('Không lưu được: '+e.message); }
}

async function renderTongHopNam(){
  if(!state) return;
  const year = Number(document.getElementById('selYearTHN').value);
  const table = document.getElementById('thnTable');
  table.innerHTML = '<tbody><tr><td>Đang tải...</td></tr></tbody>';

  // Nhan su gio la CUA RIENG TUNG THANG, nen tab nay (xuyen suot ca nam) phai tai Common cua CA 12
  // THANG roi hop nhat lai theo id nhan su - ai lam thang nao thi tinh dung theo ban ghi thang do
  // (dung khi co nguoi doi lich/nghi giua nam, khong con dung 1 danh sach nhan su chung cho ca nam nua).
  const monthCommons = [];
  for(let m=0; m<12; m++){ monthCommons.push(await getCommon(year, m)); }
  const empOrder = []; const seenEmp = new Set(); const displayName = {};
  monthCommons.forEach(c=>{
    c.employees.forEach(e=>{
      if(!seenEmp.has(e.id)){ seenEmp.add(e.id); empOrder.push(e.id); }
      displayName[e.id] = e.name;
    });
  });

  table.innerHTML = '';
  const thead = document.createElement('thead');
  const row1 = document.createElement('tr');
  const row2 = document.createElement('tr');
  const nameTh = document.createElement('th');
  nameTh.className = 'namecell';
  nameTh.textContent = 'Nhân sự';
  nameTh.rowSpan = 2;
  row1.appendChild(nameTh);
  for(let m=0; m<12; m++){
    const th = document.createElement('th');
    th.colSpan = 4;
    th.textContent = THN_MONTH_LABELS[m];
    row1.appendChild(th);
    ['F','M3','+5%','-5%'].forEach(lbl=>{
      const th2 = document.createElement('th');
      th2.textContent = lbl;
      th2.style.fontSize = '10px';
      row2.appendChild(th2);
    });
  }
  const totalTh = document.createElement('th');
  totalTh.textContent = 'Tổng F cả năm';
  totalTh.rowSpan = 2;
  row1.appendChild(totalTh);
  thead.appendChild(row1); thead.appendChild(row2);
  table.appendChild(thead);

  const tbody = document.createElement('tbody');
  empOrder.forEach(empId=>{
    const tr = document.createElement('tr');
    const nameTd = document.createElement('td');
    nameTd.className = 'namecell';
    nameTd.textContent = displayName[empId];
    tr.appendChild(nameTd);

    let totalF = 0;
    for(let m=0; m<12; m++){
      const c = monthCommons[m];
      const emp = c.employees.find(e=>e.id===empId);
      const nDays = daysInMonth(year, m);
      let fCount = 0;
      if(emp){
        for(let d=1; d<=nDays; d++){
          if(computeFinalCode(c, emp, year, m, d) === 'F') fCount++;
        }
      }
      const key = `${empId}_${year}-${String(m+1).padStart(2,'0')}`;
      const override = state.monthlyAllowances[key];
      const m3 = emp ? (override ? override.m3 : emp.allow.m3) : false;
      const pct5 = emp ? (override ? override.pct5 : emp.allow.pct5) : false;
      const neg5 = emp ? (override ? override.neg5 : emp.allow.neg5) : false;

      const phepOv = state.phepOverrides[key];
      const fEff = (phepOv===null || phepOv===undefined) ? fCount : phepOv;
      totalF += Number(fEff)||0;

      const tdF = document.createElement('td');
      const fInp = document.createElement('input');
      fInp.type = 'number'; fInp.min = '0';
      fInp.style.width = '46px'; fInp.style.textAlign = 'center';
      fInp.disabled = !emp;
      fInp.value = fEff;
      if(phepOv===null || phepOv===undefined) fInp.style.color = 'var(--ink-soft)';
      else fInp.title = `Đã sửa tay (tự tính từ Bảng Công là ${fCount})`;
      fInp.addEventListener('change', async ()=>{
        const v = fInp.value==='' ? null : Number(fInp.value);
        // Neu sua ve dung bang so tu tinh thi coi nhu bo ghi de, quay lai tu tinh cho lan sau.
        await savePhepOverride(empId, year, m, (v===fCount ? null : v));
        renderTongHopNam();
      });
      if(!emp) tdF.title = 'Nhân sự này chưa/không có trong Common của tháng này';
      tdF.appendChild(fInp);
      tr.appendChild(tdF);

      const tdM3 = document.createElement('td');
      const chkM3 = document.createElement('input');
      chkM3.type = 'checkbox'; chkM3.checked = !!m3; chkM3.disabled = !emp;
      chkM3.addEventListener('change', ()=>saveMonthlyAllowance(empId, year, m, chkM3.checked, chk5.checked, chkNeg5.checked));
      tdM3.style.textAlign='center'; tdM3.appendChild(chkM3); tr.appendChild(tdM3);

      const tdPct5 = document.createElement('td');
      const chk5 = document.createElement('input');
      chk5.type = 'checkbox'; chk5.checked = !!pct5; chk5.disabled = !emp;
      chk5.addEventListener('change', ()=>{
        if(chk5.checked){ chkNeg5.checked = false; }
        saveMonthlyAllowance(empId, year, m, chkM3.checked, chk5.checked, chkNeg5.checked);
      });
      tdPct5.style.textAlign='center'; tdPct5.appendChild(chk5); tr.appendChild(tdPct5);

      const tdNeg5 = document.createElement('td');
      const chkNeg5 = document.createElement('input');
      chkNeg5.type = 'checkbox'; chkNeg5.checked = !!neg5; chkNeg5.disabled = !emp;
      chkNeg5.addEventListener('change', ()=>{
        if(chkNeg5.checked){ chk5.checked = false; }
        saveMonthlyAllowance(empId, year, m, chkM3.checked, chk5.checked, chkNeg5.checked);
      });
      tdNeg5.style.textAlign='center'; tdNeg5.appendChild(chkNeg5); tr.appendChild(tdNeg5);
    }
    const tdTotal = document.createElement('td');
    tdTotal.textContent = totalF;
    tdTotal.className = 'sumcell';
    tdTotal.style.textAlign = 'center';
    tr.appendChild(tdTotal);

    tbody.appendChild(tr);
  });
  table.appendChild(tbody);
  applyRolePermissions();
}

/* ================= Ghi chu tab ================= */
function renderLegendTable(){
  const body = document.getElementById('legendBody');
  body.innerHTML='';
  const usageMap = {
    X:'AJ (Công lương SP)', 'XĐ':'AJ, AK (Ca 3)', XL:'AJ, AL, AO (Lễ/phép, Bù lễ)', 'XLĐ':'AJ, AL, AO, AR (Ca 3 lễ)',
    K1:'AJ (Công lương SP)', K2:'AJ (Công lương SP)', KD:'AJ, AK (Ca 3)',
    K1L:'AJ, AL, AO', K2L:'AJ, AL, AO', KDL:'AJ, AL, AO, AR (Ca 3 lễ)',
    F:'AL, AU (Số ngày phép)', L:'AL, AV (Số ngày lễ)', DL:'AM (Du lịch)', Rc:'AP (Riêng có lương)',
    Ro:'(không tính công, không lương)', 'Ô':'AQ (Ốm/TN/TS)', TS:'AQ (Ốm/TN/TS)', TN:'AQ (Ốm/TN/TS)',
    B:'AW (Số ngày nghỉ bù)', BL:'AW (Số ngày nghỉ bù)', CT:'(ghi nhận riêng, không cộng vào AJ)'
  };
  CODE_ORDER.filter(c=>c!=='').forEach(c=>{
    const tr = document.createElement('tr');
    tr.innerHTML = `<td><b>${c}</b></td><td>${CODES[c].name}</td><td>${usageMap[c]||''}</td>`;
    body.appendChild(tr);
  });
}

/* ================= Khoi dong ung dung ================= */
async function bootApp(){
  try{
    state = await api('GET', '/api/state');
  }catch(e){
    return; // showLogin() da duoc goi ben trong api() neu 401
  }
  if(!state.phepOverrides) state.phepOverrides = {}; // phong ban server cu hon (chua co truong nay)
  initMonthYearControls();
  await refreshActiveCommon();
  renderCommon();
  renderBacTable();
  renderKipTable();
  renderLegendTable();
  renderCalendar();
  renderDangKy();
  if(currentRole==='admin'){ renderSnapshots(); renderShareBackups(); }
}

(async function init(){
  updateRoleBadge();
  const loggedIn = await checkSession();
  if(loggedIn) await bootApp();
})();

if('serviceWorker' in navigator){
  window.addEventListener('load', ()=>{
    navigator.serviceWorker.register('/sw.js').catch(()=>{});
  });
}
