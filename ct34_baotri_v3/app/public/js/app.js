const state = { user: null, view: 'dashboard', engines: [], engineMap: {} };

const LOAI_LABEL = { ve_sinh: 'Vệ sinh', bao_duong: 'Bảo dưỡng', bao_tri: 'Bảo trì' };
const TRANGTHAI_LABEL = { cho_xu_ly: 'Chờ xử lý', da_xong: 'Đã xong', qua_han: 'Quá hạn' };
const TRANGTHAI_BADGE = { cho_xu_ly: 'badge-ok', da_xong: 'badge-ok', qua_han: 'badge-danger' };

// ---------- API helper ----------
async function api(path, opts = {}) {
  const res = await fetch('/api' + path, {
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    ...opts,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Có lỗi xảy ra');
  return data;
}

function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.remove('hidden');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.classList.add('hidden'), 2600);
}

// ---------- Auth ----------
async function checkSession() {
  try {
    const { user } = await api('/auth/me');
    if (user) { state.user = user; showApp(); return; }
  } catch (e) {}
  showLogin();
}

function showLogin() {
  document.getElementById('login-screen').classList.remove('hidden');
  document.getElementById('app').classList.add('hidden');
}

function showApp() {
  document.getElementById('login-screen').classList.add('hidden');
  document.getElementById('app').classList.remove('hidden');
  document.getElementById('user-email').textContent = state.user.email;
  document.querySelectorAll('.admin-only').forEach(el => {
    el.style.display = state.user.role === 'admin' ? '' : 'none';
  });
  navigate('dashboard');
}

document.getElementById('login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;
  const errEl = document.getElementById('login-error');
  errEl.textContent = '';
  try {
    const { user } = await api('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
    state.user = user;
    showApp();
  } catch (e) {
    errEl.textContent = e.message;
  }
});

document.getElementById('logout-btn').addEventListener('click', async () => {
  await api('/auth/logout', { method: 'POST' });
  state.user = null;
  showLogin();
});

// ---------- Navigation ----------
document.getElementById('tabbar').addEventListener('click', (e) => {
  const btn = e.target.closest('.tab-btn');
  if (!btn) return;
  navigate(btn.dataset.view);
});

function navigate(view) {
  state.view = view;
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.view === view));
  const root = document.getElementById('view-root');
  root.innerHTML = '<div class="empty-state">Đang tải...</div>';
  if (view === 'dashboard') renderDashboard();
  else if (view === 'engines') renderEngines();
  else if (view === 'maintenance') renderMaintenance();
  else if (view === 'data') renderData();
}

// ---------- Modal helpers ----------
function openModal(html) {
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  backdrop.id = 'modal-backdrop';
  backdrop.innerHTML = `<div class="modal">${html}</div>`;
  backdrop.addEventListener('click', (e) => { if (e.target === backdrop) closeModal(); });
  document.body.appendChild(backdrop);
}
function closeModal() {
  const el = document.getElementById('modal-backdrop');
  if (el) el.remove();
}

// ---------- Dashboard ----------
async function renderDashboard() {
  const root = document.getElementById('view-root');
  const [{ total: totalEngines }, { items: tasks }] = await Promise.all([
    api('/engines?pageSize=1'),
    api('/maintenance'),
  ]);
  const overdue = tasks.filter(t => t.trang_thai_hien_thi === 'qua_han');
  const pending = tasks.filter(t => t.trang_thai_hien_thi === 'cho_xu_ly');
  const done = tasks.filter(t => t.trang_thai_hien_thi === 'da_xong');

  root.innerHTML = `
    <div class="stat-grid">
      <div class="stat-card"><div class="stat-num">${totalEngines}</div><div class="stat-label">Động cơ</div></div>
      <div class="stat-card danger"><div class="stat-num">${overdue.length}</div><div class="stat-label">Quá hạn</div></div>
      <div class="stat-card warn"><div class="stat-num">${pending.length}</div><div class="stat-label">Chờ xử lý</div></div>
      <div class="stat-card ok"><div class="stat-num">${done.length}</div><div class="stat-label">Đã xong</div></div>
    </div>
    <div class="section-title">Việc quá hạn cần xử lý</div>
    <div class="card" id="overdue-list"></div>
  `;
  const list = document.getElementById('overdue-list');
  if (!overdue.length) {
    list.innerHTML = `<div class="empty-state"><div class="empty-icon">✓</div>Không có việc nào quá hạn</div>`;
  } else {
    list.innerHTML = overdue.slice(0, 15).map(taskListItemHtml).join('');
    list.querySelectorAll('.list-item').forEach(el => el.addEventListener('click', () => openTaskDetail(el.dataset.id)));
  }
}

// ---------- Engines ----------
async function renderEngines(query = '') {
  const root = document.getElementById('view-root');
  const { items } = await api('/engines?q=' + encodeURIComponent(query) + '&pageSize=200');
  state.engines = items;
  items.forEach(e => state.engineMap[e.id] = e);

  root.innerHTML = `
    <div class="search-row">
      <input type="text" id="engine-search" placeholder="Tìm mã, tên, vị trí, hãng SX..." value="${escapeHtml(query)}">
    </div>
    <div class="card" style="padding:0;" id="engine-list"></div>
    ${state.user.role === 'admin' ? '<button class="fab" id="add-engine-btn">+</button>' : ''}
  `;

  const list = document.getElementById('engine-list');
  if (!items.length) {
    list.innerHTML = `<div class="empty-state"><div class="empty-icon">⚙</div>Chưa có động cơ nào.<br>Vào tab "Dữ liệu" để nhập từ Excel.</div>`;
  } else {
    list.innerHTML = items.map(e => `
      <div class="list-item" data-id="${e.id}">
        <div class="list-item-main">
          <div class="list-item-title"><span class="engine-code">${escapeHtml(e.ma_dong_co || '—')}</span> ${escapeHtml(e.ten_thiet_bi || '')}</div>
          <div class="list-item-sub">${escapeHtml(e.vi_tri || 'Chưa rõ vị trí')} · ${escapeHtml(e.hang_sx || '')}</div>
        </div>
      </div>
    `).join('');
    list.querySelectorAll('.list-item').forEach(el => el.addEventListener('click', () => openEngineDetail(el.dataset.id)));
  }

  document.getElementById('engine-search').addEventListener('input', debounce((e) => renderEngines(e.target.value), 350));
  const addBtn = document.getElementById('add-engine-btn');
  if (addBtn) addBtn.addEventListener('click', () => openEngineForm());
}

function engineFormFields() {
  return [
    ['ma_dong_co', 'Mã động cơ'], ['ten_thiet_bi', 'Tên thiết bị'], ['vi_tri', 'Vị trí lắp đặt'],
    ['cong_suat', 'Công suất'], ['dien_ap', 'Điện áp'], ['dong_dien', 'Dòng điện'],
    ['hang_sx', 'Hãng sản xuất'], ['model', 'Model'], ['so_serial', 'Số serial'],
    ['ngay_lap_dat', 'Ngày lắp đặt', 'date'], ['tinh_trang', 'Tình trạng'],
  ];
}

function openEngineForm(engine = null) {
  const fields = engineFormFields();
  const html = `
    <div class="modal-title">${engine ? 'Sửa động cơ' : 'Thêm động cơ mới'}</div>
    <form id="engine-form" class="form-grid">
      ${fields.map(([key, label, type]) => `
        <div>
          <label>${label}
            <input name="${key}" type="${type || 'text'}" value="${escapeHtml(engine ? (engine[key] || '') : '')}">
          </label>
        </div>
      `).join('')}
      <div class="full">
        <label>Ghi chú
          <textarea name="ghi_chu" rows="2">${escapeHtml(engine ? (engine.ghi_chu || '') : '')}</textarea>
        </label>
      </div>
      <div class="modal-actions full">
        ${engine ? '<button type="button" class="btn btn-danger" id="delete-engine-btn">Xóa</button>' : ''}
        <button type="button" class="btn btn-ghost" id="cancel-engine-btn">Hủy</button>
        <button type="submit" class="btn btn-primary">Lưu</button>
      </div>
    </form>
  `;
  openModal(html);
  document.getElementById('cancel-engine-btn').addEventListener('click', closeModal);
  if (engine) {
    document.getElementById('delete-engine-btn').addEventListener('click', async () => {
      if (!confirm('Xóa động cơ này? Toàn bộ lịch bảo trì liên quan cũng sẽ bị xóa.')) return;
      await api('/engines/' + engine.id, { method: 'DELETE' });
      closeModal(); toast('Đã xóa'); renderEngines();
    });
  }
  document.getElementById('engine-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const body = Object.fromEntries(new FormData(e.target).entries());
    try {
      if (engine) await api('/engines/' + engine.id, { method: 'PUT', body: JSON.stringify(body) });
      else await api('/engines', { method: 'POST', body: JSON.stringify(body) });
      closeModal(); toast('Đã lưu'); renderEngines();
    } catch (err) { toast(err.message); }
  });
}

async function openEngineDetail(id) {
  const engine = await api('/engines/' + id);
  const { items: tasks } = await api('/maintenance?engine_id=' + id);
  const html = `
    <div class="modal-title"><span class="engine-code">${escapeHtml(engine.ma_dong_co || '')}</span> ${escapeHtml(engine.ten_thiet_bi || '')}</div>
    <div style="font-size:13px; color:var(--ink-dim); margin-bottom:14px; line-height:1.7;">
      Vị trí: ${escapeHtml(engine.vi_tri || '—')}<br>
      Công suất: ${escapeHtml(engine.cong_suat || '—')} · Điện áp: ${escapeHtml(engine.dien_ap || '—')} · Dòng điện: ${escapeHtml(engine.dong_dien || '—')}<br>
      Hãng SX: ${escapeHtml(engine.hang_sx || '—')} · Model: ${escapeHtml(engine.model || '—')} · Serial: ${escapeHtml(engine.so_serial || '—')}<br>
      Ngày lắp đặt: ${escapeHtml(engine.ngay_lap_dat || '—')} · Tình trạng: ${escapeHtml(engine.tinh_trang || '—')}
      ${engine.ghi_chu ? '<br>Ghi chú: ' + escapeHtml(engine.ghi_chu) : ''}
    </div>
    <div class="section-title">Lịch bảo trì</div>
    <div id="detail-task-list">${tasks.length ? tasks.map(taskListItemHtml).join('') : '<div class="empty-state">Chưa có công việc nào</div>'}</div>
    <div class="modal-actions">
      <button type="button" class="btn btn-ghost" id="close-detail-btn">Đóng</button>
      <button type="button" class="btn btn-primary" id="edit-engine-btn">Sửa thông tin</button>
      <button type="button" class="btn btn-primary" id="add-task-btn">+ Thêm việc</button>
    </div>
  `;
  openModal(html);
  document.getElementById('close-detail-btn').addEventListener('click', closeModal);
  document.getElementById('edit-engine-btn').addEventListener('click', () => { closeModal(); openEngineForm(engine); });
  document.getElementById('add-task-btn').addEventListener('click', () => { closeModal(); openTaskForm(null, engine); });
  document.querySelectorAll('#detail-task-list .list-item').forEach(el =>
    el.addEventListener('click', () => { closeModal(); openTaskDetail(el.dataset.id); }));
}

// ---------- Maintenance ----------
let maintFilter = { loai: '', trang_thai: '' };

function taskListItemHtml(t) {
  const badgeClass = t.trang_thai_hien_thi === 'qua_han' ? 'badge-danger' : (t.trang_thai_hien_thi === 'da_xong' ? 'badge-ok' : 'badge-warn');
  return `
    <div class="list-item" data-id="${t.id}">
      <div class="list-item-main">
        <div class="list-item-title"><span class="engine-code">${escapeHtml(t.ma_dong_co || '')}</span> ${LOAI_LABEL[t.loai_cong_viec] || t.loai_cong_viec}</div>
        <div class="list-item-sub">${escapeHtml(t.ten_thiet_bi || '')} · Đến hạn: ${t.ngay_den_han || '—'}</div>
      </div>
      <span class="badge ${badgeClass}">${TRANGTHAI_LABEL[t.trang_thai_hien_thi] || t.trang_thai_hien_thi}</span>
    </div>
  `;
}

async function renderMaintenance() {
  const root = document.getElementById('view-root');
  const params = new URLSearchParams();
  if (maintFilter.loai) params.set('loai_cong_viec', maintFilter.loai);
  if (maintFilter.trang_thai) params.set('trang_thai', maintFilter.trang_thai);
  const { items } = await api('/maintenance?' + params.toString());

  const chip = (key, val, label) => `<button class="chip ${maintFilter[key] === val ? 'active' : ''}" data-key="${key}" data-val="${val}">${label}</button>`;

  root.innerHTML = `
    <div class="filter-chips">
      ${chip('loai', '', 'Tất cả loại')}
      ${chip('loai', 've_sinh', 'Vệ sinh')}
      ${chip('loai', 'bao_duong', 'Bảo dưỡng')}
      ${chip('loai', 'bao_tri', 'Bảo trì')}
    </div>
    <div class="filter-chips">
      ${chip('trang_thai', '', 'Mọi trạng thái')}
      ${chip('trang_thai', 'qua_han', 'Quá hạn')}
      ${chip('trang_thai', 'cho_xu_ly', 'Chờ xử lý')}
      ${chip('trang_thai', 'da_xong', 'Đã xong')}
    </div>
    <div class="card" style="padding:0;" id="task-list"></div>
    <button class="fab" id="add-task-btn2">+</button>
  `;

  root.querySelectorAll('.chip').forEach(c => c.addEventListener('click', () => {
    maintFilter[c.dataset.key] = c.dataset.val;
    renderMaintenance();
  }));

  const list = document.getElementById('task-list');
  list.innerHTML = items.length ? items.map(taskListItemHtml).join('')
    : `<div class="empty-state"><div class="empty-icon">✓</div>Không có công việc phù hợp bộ lọc</div>`;
  list.querySelectorAll('.list-item').forEach(el => el.addEventListener('click', () => openTaskDetail(el.dataset.id)));
  document.getElementById('add-task-btn2').addEventListener('click', () => openTaskForm());
}

async function openTaskForm(task = null, presetEngine = null) {
  if (!state.engines.length) {
    const { items } = await api('/engines?pageSize=500');
    state.engines = items;
  }
  const engineOptions = state.engines.map(e =>
    `<option value="${e.id}" ${(task && task.engine_id === e.id) || (presetEngine && presetEngine.id === e.id) ? 'selected' : ''}>${escapeHtml(e.ma_dong_co)} - ${escapeHtml(e.ten_thiet_bi || '')}</option>`
  ).join('');

  const html = `
    <div class="modal-title">${task ? 'Sửa công việc' : 'Thêm công việc bảo trì'}</div>
    <form id="task-form" class="form-grid">
      <div class="full"><label>Động cơ
        <select name="engine_id" required>${engineOptions}</select>
      </label></div>
      <div><label>Loại công việc
        <select name="loai_cong_viec">
          <option value="ve_sinh" ${task && task.loai_cong_viec === 've_sinh' ? 'selected' : ''}>Vệ sinh</option>
          <option value="bao_duong" ${task && task.loai_cong_viec === 'bao_duong' ? 'selected' : ''}>Bảo dưỡng</option>
          <option value="bao_tri" ${task && task.loai_cong_viec === 'bao_tri' ? 'selected' : ''}>Bảo trì</option>
        </select>
      </label></div>
      <div><label>Chu kỳ (ngày)
        <input type="number" name="chu_ky_ngay" value="${task ? (task.chu_ky_ngay || '') : ''}">
      </label></div>
      <div><label>Ngày thực hiện gần nhất
        <input type="date" name="ngay_thuc_hien_gan_nhat" value="${task ? (task.ngay_thuc_hien_gan_nhat || '') : ''}">
      </label></div>
      <div><label>Ngày đến hạn
        <input type="date" name="ngay_den_han" value="${task ? (task.ngay_den_han || '') : ''}">
      </label></div>
      <div class="full"><label>Người phụ trách
        <input type="text" name="nguoi_phu_trach" value="${task ? (task.nguoi_phu_trach || '') : ''}">
      </label></div>
      <div class="full"><label>Mô tả
        <textarea name="mo_ta" rows="2">${task ? (task.mo_ta || '') : ''}</textarea>
      </label></div>
      <div class="modal-actions full">
        ${task ? '<button type="button" class="btn btn-danger" id="delete-task-btn">Xóa</button>' : ''}
        <button type="button" class="btn btn-ghost" id="cancel-task-btn">Hủy</button>
        <button type="submit" class="btn btn-primary">Lưu</button>
      </div>
    </form>
  `;
  openModal(html);
  document.getElementById('cancel-task-btn').addEventListener('click', closeModal);
  if (task) {
    document.getElementById('delete-task-btn').addEventListener('click', async () => {
      if (!confirm('Xóa công việc này?')) return;
      await api('/maintenance/' + task.id, { method: 'DELETE' });
      closeModal(); toast('Đã xóa'); navigate(state.view);
    });
  }
  document.getElementById('task-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const body = Object.fromEntries(new FormData(e.target).entries());
    try {
      if (task) await api('/maintenance/' + task.id, { method: 'PUT', body: JSON.stringify(body) });
      else await api('/maintenance', { method: 'POST', body: JSON.stringify(body) });
      closeModal(); toast('Đã lưu'); navigate(state.view);
    } catch (err) { toast(err.message); }
  });
}

async function openTaskDetail(id) {
  const task = await api('/maintenance/' + id);
  const logsHtml = task.logs.length ? task.logs.map(l => `
    <div class="list-item"><div class="list-item-main">
      <div class="list-item-title">${l.ngay_thuc_hien}</div>
      <div class="list-item-sub">${escapeHtml(l.nguoi_thuc_hien || '—')} ${l.ghi_chu ? '· ' + escapeHtml(l.ghi_chu) : ''}</div>
    </div></div>
  `).join('') : '<div class="empty-state">Chưa có lịch sử thực hiện</div>';

  const html = `
    <div class="modal-title"><span class="engine-code">${escapeHtml(task.ma_dong_co)}</span> ${LOAI_LABEL[task.loai_cong_viec]}</div>
    <div style="font-size:13px; color:var(--ink-dim); margin-bottom:14px; line-height:1.7;">
      ${escapeHtml(task.ten_thiet_bi || '')}<br>
      Chu kỳ: ${task.chu_ky_ngay ? task.chu_ky_ngay + ' ngày' : '—'} · Đến hạn: ${task.ngay_den_han || '—'}<br>
      Người phụ trách: ${escapeHtml(task.nguoi_phu_trach || '—')}
      ${task.mo_ta ? '<br>Mô tả: ' + escapeHtml(task.mo_ta) : ''}
    </div>
    <div class="section-title">Lịch sử thực hiện</div>
    <div style="margin-bottom:14px;">${logsHtml}</div>
    <div class="modal-actions">
      <button type="button" class="btn btn-ghost" id="close-task-btn">Đóng</button>
      <button type="button" class="btn btn-ghost" id="edit-task-btn">Sửa</button>
      <button type="button" class="btn btn-primary" id="complete-task-btn">✓ Đánh dấu đã làm hôm nay</button>
    </div>
  `;
  openModal(html);
  document.getElementById('close-task-btn').addEventListener('click', closeModal);
  document.getElementById('edit-task-btn').addEventListener('click', () => { closeModal(); openTaskForm(task); });
  document.getElementById('complete-task-btn').addEventListener('click', async () => {
    const nguoi = prompt('Người thực hiện:', state.user.email) || '';
    try {
      await api('/maintenance/' + task.id + '/complete', { method: 'POST', body: JSON.stringify({ nguoi_thuc_hien: nguoi }) });
      closeModal(); toast('Đã ghi nhận hoàn thành'); navigate(state.view);
    } catch (err) { toast(err.message); }
  });
}

// ---------- Data (import/export) ----------
async function renderData() {
  const root = document.getElementById('view-root');
  if (state.user.role !== 'admin') {
    root.innerHTML = `<div class="empty-state">Chỉ admin mới xem được mục này</div>`;
    return;
  }
  const { files } = await api('/data/exports');

  root.innerHTML = `
    <div class="section-title">Nhập dữ liệu từ Excel</div>
    <div class="card">
      <p style="font-size:13px; color:var(--ink-dim); margin-top:0;">Chọn file Excel (.xlsx) — hệ thống sẽ đọc tiêu đề cột để bạn tự chọn cột nào tương ứng với trường nào, không cần đúng khuôn mẫu có sẵn.</p>
      <input type="file" id="import-file" accept=".xlsx">
      <div style="margin-top:10px;">
        <label style="font-size:13px; margin-right:12px;"><input type="radio" name="import-target" value="engines" checked> Danh sách động cơ</label>
        <label style="font-size:13px;"><input type="radio" name="import-target" value="maintenance"> Lịch bảo trì</label>
      </div>
      <button class="btn btn-primary btn-block" id="import-preview-btn" style="margin-top:12px;">Tải lên &amp; xem trước</button>
    </div>

    <div class="section-title">Xuất Excel</div>
    <div class="card">
      <p style="font-size:13px; color:var(--ink-dim); margin-top:0;">Hệ thống tự động xuất file vào 23h50 Chủ nhật hàng tuần, lưu trong thư mục chia sẻ <code>/share/baotri_exports</code>. Bạn cũng có thể xuất ngay tại đây.</p>
      <button class="btn btn-primary btn-block" id="export-now-btn">Xuất Excel ngay</button>
      <div class="section-title" style="margin-top:16px;">File đã xuất</div>
      <div id="export-file-list"></div>
    </div>
  `;

  const fileList = document.getElementById('export-file-list');
  fileList.innerHTML = files.length ? files.map(f => `
    <div class="list-item"><div class="list-item-main"><div class="list-item-title">${f}</div></div>
    <a class="btn btn-ghost btn-sm" href="/api/data/exports/${encodeURIComponent(f)}">Tải về</a></div>
  `).join('') : '<div class="empty-state">Chưa có file nào</div>';

  document.getElementById('export-now-btn').addEventListener('click', async () => {
    try { await api('/data/export-now'); toast('Đã xuất file mới'); renderData(); }
    catch (err) { toast(err.message); }
  });

  document.getElementById('import-preview-btn').addEventListener('click', async () => {
    const fileInput = document.getElementById('import-file');
    if (!fileInput.files.length) { toast('Chọn file trước đã'); return; }
    const target = document.querySelector('input[name="import-target"]:checked').value;
    const fd = new FormData();
    fd.append('file', fileInput.files[0]);
    try {
      const res = await fetch('/api/data/preview', { method: 'POST', body: fd, credentials: 'same-origin' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      openImportMappingModal(data, target);
    } catch (err) { toast(err.message); }
  });
}

function openImportMappingModal(previewData, target) {
  const targetFields = target === 'engines' ? previewData.targetFieldsEngine : previewData.targetFieldsMaintenance;
  const headerOptions = (selected) => `<option value="">— Bỏ qua —</option>` +
    previewData.headers.map(h => `<option value="${escapeAttr(h)}" ${h === selected ? 'selected' : ''}>${escapeHtml(h)}</option>`).join('');

  // đoán mapping tự động theo tên gần giống
  const guess = (label) => previewData.headers.find(h => h.toLowerCase().includes(label.toLowerCase().split(' ')[0])) || '';

  const html = `
    <div class="modal-title">Chọn cột tương ứng (${previewData.totalRows} dòng dữ liệu)</div>
    <div style="max-height:50vh; overflow-y:auto;">
      ${targetFields.map(f => `
        <div class="mapping-row">
          <label>${f.label}</label>
          <select data-field="${f.key}">${headerOptions(guess(f.label))}</select>
        </div>
      `).join('')}
    </div>
    <div class="modal-actions">
      <button type="button" class="btn btn-ghost" id="cancel-import-btn">Hủy</button>
      <button type="button" class="btn btn-primary" id="confirm-import-btn">Nhập dữ liệu</button>
    </div>
  `;
  openModal(html);
  document.getElementById('cancel-import-btn').addEventListener('click', closeModal);
  document.getElementById('confirm-import-btn').addEventListener('click', async () => {
    const mapping = {};
    document.querySelectorAll('.mapping-row select').forEach(sel => { mapping[sel.dataset.field] = sel.value; });
    try {
      const result = await api('/data/commit', {
        method: 'POST',
        body: JSON.stringify({ uploadId: previewData.uploadId, target, mapping }),
      });
      closeModal();
      toast(`Xong: thêm mới ${result.inserted}, cập nhật ${result.updated}, bỏ qua ${result.skipped}`);
      renderData();
    } catch (err) { toast(err.message); }
  });
}

// ---------- Utils ----------
function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function escapeAttr(str) { return escapeHtml(str); }
function debounce(fn, ms) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

// ---------- Boot ----------
checkSession();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
}
