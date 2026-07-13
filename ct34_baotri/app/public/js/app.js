const state = { user: null, view: 'dashboard', engines: [], engineMap: {}, engineFields: [] };

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

// ---------- Engine fields (cột động, admin tự quản lý) ----------
async function loadEngineFields(force = false) {
  if (!force && state.engineFields.length) return state.engineFields;
  const { items } = await api('/engine-fields');
  state.engineFields = items;
  return items;
}

// Chọn ra 1 giá trị làm "tên hiển thị" + 1-2 giá trị phụ để hiện trong danh sách
function engineTitleAndSub(e) {
  const fields = state.engineFields;
  let primary = fields.find(f => f.is_display_name);
  let primaryVal = primary ? (e[primary.field_key] || '') : '';
  if (!primaryVal) {
    const found = fields.find(f => e[f.field_key]);
    if (found) { primary = found; primaryVal = e[found.field_key]; }
  }
  const subParts = [];
  for (const f of fields) {
    if (primary && f.field_key === primary.field_key) continue;
    const v = e[f.field_key];
    if (v) subParts.push(v);
    if (subParts.length >= 2) break;
  }
  return { title: primaryVal || '', sub: subParts.join(' · ') };
}

function openFieldManager(onDone) {
  const fields = state.engineFields;
  const html = `
    <div class="modal-title">Quản lý trường dữ liệu động cơ</div>
    <p style="font-size:12.5px; color:var(--ink-dim); margin-top:-6px;">
      Đây là các cột thông tin cho từng động cơ — bạn tự thêm mới, đổi tên, xóa, hoặc sắp xếp lại,
      không cần nhờ ai sửa code. Bấm ★ để chọn trường dùng làm "tên hiển thị" trong danh sách.
    </p>
    <div id="field-manager-list" style="max-height:42vh; overflow-y:auto; margin:10px 0;">
      ${fields.length ? fields.map((f, i) => `
        <div class="list-item" data-id="${f.id}">
          <div class="list-item-main">
            <div class="list-item-title">${f.is_display_name ? '★ ' : ''}${escapeHtml(f.label)}</div>
            <div class="list-item-sub">${escapeHtml(f.field_key)}</div>
          </div>
          <div style="display:flex; gap:4px; flex-shrink:0;">
            <button type="button" class="btn btn-ghost btn-sm" data-act="up" ${i === 0 ? 'disabled' : ''}>↑</button>
            <button type="button" class="btn btn-ghost btn-sm" data-act="down" ${i === fields.length - 1 ? 'disabled' : ''}>↓</button>
            <button type="button" class="btn btn-ghost btn-sm" data-act="star" title="Đặt làm tên hiển thị">★</button>
            <button type="button" class="btn btn-ghost btn-sm" data-act="rename">Sửa</button>
            <button type="button" class="btn btn-danger btn-sm" data-act="del">Xóa</button>
          </div>
        </div>
      `).join('') : '<div class="empty-state">Chưa có trường nào</div>'}
    </div>
    <div style="display:flex; gap:8px;">
      <input type="text" id="new-field-label" placeholder="Tên trường mới, vd: Ngày bảo trì gần nhất..." style="flex:1; padding:9px 10px; border:1.5px solid var(--border); border-radius:7px;">
      <button type="button" class="btn btn-primary" id="add-field-btn">+ Thêm</button>
    </div>
    <div class="modal-actions">
      <button type="button" class="btn btn-primary btn-block" id="done-field-manager-btn">Xong</button>
    </div>
  `;
  openModal(html);

  document.getElementById('done-field-manager-btn').addEventListener('click', () => { closeModal(); if (onDone) onDone(); });

  document.getElementById('add-field-btn').addEventListener('click', async () => {
    const input = document.getElementById('new-field-label');
    const label = input.value.trim();
    if (!label) return;
    try {
      await api('/engine-fields', { method: 'POST', body: JSON.stringify({ label }) });
      await loadEngineFields(true);
      closeModal(); openFieldManager(onDone);
    } catch (err) { toast(err.message); }
  });

  document.querySelectorAll('#field-manager-list .list-item').forEach(row => {
    const id = Number(row.dataset.id);
    row.querySelectorAll('button').forEach(btn => {
      btn.addEventListener('click', async () => {
        const act = btn.dataset.act;
        const idx = state.engineFields.findIndex(f => f.id === id);
        try {
          if (act === 'up' || act === 'down') {
            const arr = [...state.engineFields];
            const swapIdx = act === 'up' ? idx - 1 : idx + 1;
            [arr[idx], arr[swapIdx]] = [arr[swapIdx], arr[idx]];
            await api('/engine-fields/reorder', { method: 'POST', body: JSON.stringify({ orderedIds: arr.map(f => f.id) }) });
          } else if (act === 'star') {
            await api('/engine-fields/' + id, { method: 'PUT', body: JSON.stringify({ is_display_name: true }) });
          } else if (act === 'rename') {
            const cur = state.engineFields[idx];
            const newLabel = prompt('Đổi tên trường:', cur.label);
            if (!newLabel || !newLabel.trim()) return;
            await api('/engine-fields/' + id, { method: 'PUT', body: JSON.stringify({ label: newLabel.trim() }) });
          } else if (act === 'del') {
            if (!confirm('Xóa trường này? Dữ liệu đã nhập cho trường này ở tất cả động cơ sẽ không còn hiển thị nữa.')) return;
            await api('/engine-fields/' + id, { method: 'DELETE' });
          }
          await loadEngineFields(true);
          closeModal(); openFieldManager(onDone);
        } catch (err) { toast(err.message); }
      });
    });
  });
}

// ---------- Engines ----------
async function renderEngines(query = '') {
  const root = document.getElementById('view-root');
  await loadEngineFields();
  const { items } = await api('/engines?q=' + encodeURIComponent(query) + '&pageSize=1000');
  state.engines = items;
  items.forEach(e => state.engineMap[e.id] = e);

  root.innerHTML = `
    <div class="search-row">
      <input type="text" id="engine-search" placeholder="Tìm mã thiết bị hoặc bất kỳ thông tin nào..." value="${escapeHtml(query)}">
    </div>
    <div class="card" style="padding:0;" id="engine-list"></div>
    ${state.user.role === 'admin' ? '<button class="fab" id="add-engine-btn">+</button>' : ''}
  `;

  const list = document.getElementById('engine-list');
  if (!items.length) {
    list.innerHTML = `<div class="empty-state"><div class="empty-icon">⚙</div>Chưa có động cơ nào.<br>Vào tab "Dữ liệu" để nhập từ Excel.</div>`;
  } else {
    list.innerHTML = items.map(e => {
      const { title, sub } = engineTitleAndSub(e);
      return `
      <div class="list-item" data-id="${e.id}">
        <div class="list-item-main">
          <div class="list-item-title"><span class="engine-code">${escapeHtml(e.ma_thiet_bi || '—')}</span> ${escapeHtml(title)}</div>
          <div class="list-item-sub">${escapeHtml(sub || '—')}</div>
        </div>
      </div>
    `;
    }).join('');
    list.querySelectorAll('.list-item').forEach(el => el.addEventListener('click', () => openEngineDetail(el.dataset.id)));
  }

  document.getElementById('engine-search').addEventListener('input', debounce((e) => renderEngines(e.target.value), 350));
  const addBtn = document.getElementById('add-engine-btn');
  if (addBtn) addBtn.addEventListener('click', () => openEngineForm());
}

function openEngineForm(engine = null) {
  const fields = state.engineFields;
  const html = `
    <div class="modal-title">${engine ? 'Sửa động cơ' : 'Thêm động cơ mới'}</div>
    <form id="engine-form" class="form-grid">
      <div class="full">
        <label>Mã thiết bị (bắt buộc, dùng làm mã định danh)
          <input name="ma_thiet_bi" required value="${escapeHtml(engine ? (engine.ma_thiet_bi || '') : '')}">
        </label>
      </div>
      ${fields.map(f => `
        <div>
          <label>${f.is_display_name ? '★ ' : ''}${escapeHtml(f.label)}
            <input name="${escapeAttr(f.field_key)}" value="${escapeHtml(engine ? (engine[f.field_key] || '') : '')}">
          </label>
        </div>
      `).join('')}
      <div class="full" style="text-align:right; margin-top:2px;">
        <button type="button" class="btn btn-ghost btn-sm" id="manage-fields-btn">⚙ Quản lý trường dữ liệu</button>
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
  document.getElementById('manage-fields-btn').addEventListener('click', () => {
    closeModal();
    openFieldManager(() => openEngineForm(engine));
  });
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
  await loadEngineFields();
  const engine = await api('/engines/' + id);
  const { items: tasks } = await api('/maintenance?engine_id=' + id);
  const { title } = engineTitleAndSub(engine);
  const detailLines = state.engineFields
    .filter(f => engine[f.field_key])
    .map(f => `<b>${escapeHtml(f.label)}:</b> ${escapeHtml(engine[f.field_key])}`)
    .join('<br>');
  const html = `
    <div class="modal-title"><span class="engine-code">${escapeHtml(engine.ma_thiet_bi || '')}</span> ${escapeHtml(title)}</div>
    <div style="font-size:13px; color:var(--ink-dim); margin-bottom:14px; line-height:1.7;">
      ${detailLines || 'Chưa có thông tin chi tiết — bấm "Sửa thông tin" để nhập.'}
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
        <div class="list-item-title"><span class="engine-code">${escapeHtml(t.ma_thiet_bi || '')}</span> ${LOAI_LABEL[t.loai_cong_viec] || t.loai_cong_viec}</div>
        <div class="list-item-sub">${escapeHtml(t.ten_goi || '')} · Đến hạn: ${t.ngay_den_han || '—'}</div>
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
    `<option value="${e.id}" ${(task && task.engine_id === e.id) || (presetEngine && presetEngine.id === e.id) ? 'selected' : ''}>${escapeHtml(e.ma_thiet_bi)} - ${escapeHtml(e.ten_goi || '')}</option>`
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
    <div class="modal-title"><span class="engine-code">${escapeHtml(task.ma_thiet_bi)}</span> ${LOAI_LABEL[task.loai_cong_viec]}</div>
    <div style="font-size:13px; color:var(--ink-dim); margin-bottom:14px; line-height:1.7;">
      ${escapeHtml(task.ten_goi || '')}<br>
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
  await loadEngineFields();
  const { files } = await api('/data/exports');

  root.innerHTML = `
    <div class="section-title">Trường dữ liệu động cơ</div>
    <div class="card">
      <p style="font-size:13px; color:var(--ink-dim); margin-top:0;">Tự thêm/sửa/xóa/sắp xếp các cột thông tin của động cơ (không cần sửa code).</p>
      <button class="btn btn-primary btn-block" id="open-field-manager-btn">⚙ Quản lý trường dữ liệu (${state.engineFields.length} trường)</button>
    </div>

    <div class="section-title">Nhập dữ liệu từ Excel</div>
    <div class="card">
      <p style="font-size:13px; color:var(--ink-dim); margin-top:0;">Chọn file Excel (.xlsx) — hệ thống tự dò dòng tiêu đề thật (kể cả file có tiêu đề nhiều tầng, ô gộp), bạn chỉ cần chọn cột nào tương ứng với trường nào.</p>
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

  document.getElementById('open-field-manager-btn').addEventListener('click', () => openFieldManager(() => renderData()));

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
  let targetFields = target === 'engines' ? [...previewData.targetFieldsEngine] : [...previewData.targetFieldsMaintenance];
  const currentMapping = {};

  const guess = (label) => previewData.headers.find(h => h.toLowerCase().includes(label.toLowerCase().split(' ')[0])) || '';

  function render() {
    const headerOptions = (selected) => `<option value="">— Bỏ qua —</option>` +
      previewData.headers.map(h => `<option value="${escapeAttr(h)}" ${h === selected ? 'selected' : ''}>${escapeHtml(h)}</option>`).join('');

    const html = `
      <div class="modal-title">Chọn cột tương ứng (${previewData.totalRows} dòng dữ liệu)</div>
      <div style="max-height:40vh; overflow-y:auto;" id="mapping-rows-container">
        ${targetFields.map(f => `
          <div class="mapping-row">
            <label>${escapeHtml(f.label)}</label>
            <select data-field="${escapeAttr(f.key)}">${headerOptions(currentMapping[f.key] !== undefined ? currentMapping[f.key] : guess(f.label))}</select>
          </div>
        `).join('')}
      </div>
      ${target === 'engines' ? `
        <div class="section-title" style="margin-top:14px;">Cột chưa có trường tương ứng?</div>
        <p style="font-size:12px; color:var(--ink-dim); margin-top:-6px; margin-bottom:8px;">Bấm để tạo trường mới ngay từ tên cột, rồi chọn map như bình thường ở trên.</p>
        <div style="display:flex; flex-wrap:wrap; gap:6px; margin-bottom:6px;">
          ${previewData.headers.map(h => `<button type="button" class="chip" data-create-field="${escapeAttr(h)}">+ ${escapeHtml(h)}</button>`).join('')}
        </div>
      ` : ''}
      <div class="modal-actions">
        <button type="button" class="btn btn-ghost" id="cancel-import-btn">Hủy</button>
        <button type="button" class="btn btn-primary" id="confirm-import-btn">Nhập dữ liệu</button>
      </div>
    `;
    closeModal();
    openModal(html);

    document.getElementById('cancel-import-btn').addEventListener('click', closeModal);

    document.querySelectorAll('.mapping-row select').forEach(sel => {
      sel.addEventListener('change', () => { currentMapping[sel.dataset.field] = sel.value; });
    });

    document.querySelectorAll('[data-create-field]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const headerName = btn.dataset.createField;
        try {
          const created = await api('/engine-fields', { method: 'POST', body: JSON.stringify({ label: headerName }) });
          targetFields.push({ key: created.field_key, label: created.label });
          currentMapping[created.field_key] = headerName;
          await loadEngineFields(true);
          toast('Đã tạo trường "' + headerName + '"');
          render();
        } catch (err) { toast(err.message); }
      });
    });

    document.getElementById('confirm-import-btn').addEventListener('click', async () => {
      document.querySelectorAll('.mapping-row select').forEach(sel => { currentMapping[sel.dataset.field] = sel.value; });
      try {
        const result = await api('/data/commit', {
          method: 'POST',
          body: JSON.stringify({ uploadId: previewData.uploadId, target, mapping: currentMapping }),
        });
        closeModal();
        toast(`Xong: thêm mới ${result.inserted}, cập nhật ${result.updated}, bỏ qua ${result.skipped}`);
        renderData();
      } catch (err) { toast(err.message); }
    });
  }

  render();
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
