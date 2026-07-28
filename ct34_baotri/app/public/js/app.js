const state = { user: null, view: 'dashboard', engines: [], engineMap: {}, engineFields: [], logMap: {}, maintenanceCategories: [], materials: [] };

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

  const renderers = {
    dashboard: renderDashboard,
    engines: renderEngines,
    maintenance: renderMaintenance,
    materials: renderMaterialsReport,
    data: renderData,
  };
  const fn = renderers[view];
  if (!fn) return;
  Promise.resolve(fn()).catch(err => {
    console.error('Loi tai tab', view, err);
    root.innerHTML = `<div class="empty-state">Có lỗi khi tải mục này: ${escapeHtml(err.message || String(err))}<br><br>
      <button class="btn btn-primary" onclick="navigate('${view}')">Thử lại</button></div>`;
  });
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
  const [{ total: totalEngines }, { items: logs }] = await Promise.all([
    api('/engines?pageSize=1'),
    api('/maintenance'),
  ]);

  const cutoff30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const last30 = logs.filter(l => l.ngay_thuc_hien && l.ngay_thuc_hien >= cutoff30);
  const enginesWithHistory = new Set(logs.map(l => l.engine_id)).size;
  const enginesNoHistory = Math.max(totalEngines - enginesWithHistory, 0);

  root.innerHTML = `
    <div class="stat-grid">
      <div class="stat-card"><div class="stat-num">${totalEngines}</div><div class="stat-label">Động cơ</div></div>
      <div class="stat-card ok"><div class="stat-num">${logs.length}</div><div class="stat-label">Lần ghi nhận</div></div>
      <div class="stat-card warn"><div class="stat-num">${last30.length}</div><div class="stat-label">30 ngày qua</div></div>
      <div class="stat-card danger"><div class="stat-num">${enginesNoHistory}</div><div class="stat-label">Chưa có lịch sử</div></div>
    </div>
    <div class="section-title">Hoạt động gần đây</div>
    <div class="card" id="recent-list"></div>
  `;
  const list = document.getElementById('recent-list');
  logs.forEach(l => { state.logMap[l.id] = l; });
  if (!logs.length) {
    list.innerHTML = `<div class="empty-state"><div class="empty-icon">📋</div>Chưa có lịch sử bảo trì nào được ghi nhận</div>`;
  } else {
    list.innerHTML = logs.slice(0, 15).map(logListItemHtml).join('');
    list.querySelectorAll('.list-item').forEach(el => el.addEventListener('click', () => openLogForm(state.logMap[el.dataset.id])));
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

  root.innerHTML = `
    <div class="search-row">
      <input type="text" id="engine-search" placeholder="Tìm mã thiết bị hoặc bất kỳ thông tin nào..." value="${escapeHtml(query)}">
    </div>
    <div class="card" style="padding:0;" id="engine-list"></div>
    ${state.user.role === 'admin' ? '<button class="fab" id="add-engine-btn">+</button>' : ''}
  `;

  await renderEngineListOnly(query);

  const searchInput = document.getElementById('engine-search');
  searchInput.addEventListener('input', debounce((e) => renderEngineListOnly(e.target.value), 350));
  const addBtn = document.getElementById('add-engine-btn');
  if (addBtn) addBtn.addEventListener('click', () => openEngineForm());
}

// Chỉ vẽ lại phần danh sách kết quả (không đụng tới khung/ô tìm kiếm), để gõ tìm kiếm không bị mất focus
async function renderEngineListOnly(query = '') {
  const { items } = await api('/engines?q=' + encodeURIComponent(query) + '&pageSize=1000');
  state.engines = items;
  items.forEach(e => state.engineMap[e.id] = e);

  const list = document.getElementById('engine-list');
  if (!list) return; // nguoi dung da chuyen tab truoc khi ket qua ve kip
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
  const { items: logs } = await api('/maintenance?engine_id=' + id);
  logs.forEach(l => { state.logMap[l.id] = l; });
  const { title } = engineTitleAndSub(engine);
  const detailLines = state.engineFields
    .filter(f => engine[f.field_key])
    .map(f => `<b>${escapeHtml(f.label)}:</b> ${escapeHtml(engine[f.field_key])}`)
    .join('<br>');
  const html = `
    <div class="modal-title"><span class="engine-code">${escapeHtml(engine.ma_thiet_bi || '')}</span> ${escapeHtml(title)}</div>
    <div class="detail-info">
      ${detailLines || 'Chưa có thông tin chi tiết — bấm "Sửa thông tin" để nhập.'}
    </div>
    <div class="section-title">Lịch sử bảo trì (${logs.length})</div>
    <div id="detail-log-list">${logs.length ? logs.map(logListItemHtml).join('') : '<div class="empty-state">Chưa có lịch sử nào</div>'}</div>
    <div class="modal-actions">
      <button type="button" class="btn btn-ghost" id="close-detail-btn">Đóng</button>
      <button type="button" class="btn btn-primary" id="edit-engine-btn">Sửa thông tin</button>
      <button type="button" class="btn btn-primary" id="add-log-btn">+ Ghi nhận</button>
    </div>
  `;
  openModal(html);
  document.getElementById('close-detail-btn').addEventListener('click', closeModal);
  document.getElementById('edit-engine-btn').addEventListener('click', () => { closeModal(); openEngineForm(engine); });
  document.getElementById('add-log-btn').addEventListener('click', () => { closeModal(); openLogForm(null, engine); });
  document.querySelectorAll('#detail-log-list .list-item').forEach(el =>
    el.addEventListener('click', () => { closeModal(); openLogForm(state.logMap[el.dataset.id]); }));
}

// ---------- Maintenance (lịch sử bảo trì) ----------
let maintFilter = { hang_muc: '', q: '', from: '', to: '' };

async function loadMaintenanceCategories(force = false) {
  if (!force && state.maintenanceCategories.length) return state.maintenanceCategories;
  const { items } = await api('/maintenance-categories');
  state.maintenanceCategories = items;
  return items;
}

function openCategoryManager(onDone) {
  const cats = state.maintenanceCategories;
  const html = `
    <div class="modal-title">Quản lý hạng mục bảo trì</div>
    <p style="font-size:12.5px; color:var(--ink-dim); margin-top:-6px;">
      Đây là danh sách hạng mục dùng khi ghi nhận lịch sử bảo trì — tự thêm mới, đổi tên, xóa, hoặc
      sắp xếp lại, không cần nhờ ai sửa code.
    </p>
    <div id="category-manager-list" style="max-height:42vh; overflow-y:auto; margin:10px 0;">
      ${cats.length ? cats.map((c, i) => `
        <div class="list-item" data-id="${c.id}">
          <div class="list-item-main"><div class="list-item-title">${escapeHtml(c.name)}</div></div>
          <div style="display:flex; gap:4px; flex-shrink:0;">
            <button type="button" class="btn btn-ghost btn-sm" data-act="up" ${i === 0 ? 'disabled' : ''}>↑</button>
            <button type="button" class="btn btn-ghost btn-sm" data-act="down" ${i === cats.length - 1 ? 'disabled' : ''}>↓</button>
            <button type="button" class="btn btn-ghost btn-sm" data-act="rename">Sửa</button>
            <button type="button" class="btn btn-danger btn-sm" data-act="del">Xóa</button>
          </div>
        </div>
      `).join('') : '<div class="empty-state">Chưa có hạng mục nào</div>'}
    </div>
    <div style="display:flex; gap:8px;">
      <input type="text" id="new-category-name" placeholder="Tên hạng mục mới..." style="flex:1; padding:9px 10px; border:1.5px solid var(--border); border-radius:7px;">
      <button type="button" class="btn btn-primary" id="add-category-btn">+ Thêm</button>
    </div>
    <div class="modal-actions">
      <button type="button" class="btn btn-primary btn-block" id="done-category-manager-btn">Xong</button>
    </div>
  `;
  openModal(html);

  document.getElementById('done-category-manager-btn').addEventListener('click', () => { closeModal(); if (onDone) onDone(); });

  document.getElementById('add-category-btn').addEventListener('click', async () => {
    const input = document.getElementById('new-category-name');
    const name = input.value.trim();
    if (!name) return;
    try {
      await api('/maintenance-categories', { method: 'POST', body: JSON.stringify({ name }) });
      await loadMaintenanceCategories(true);
      closeModal(); openCategoryManager(onDone);
    } catch (err) { toast(err.message); }
  });

  document.querySelectorAll('#category-manager-list .list-item').forEach(row => {
    const id = Number(row.dataset.id);
    row.querySelectorAll('button').forEach(btn => {
      btn.addEventListener('click', async () => {
        const act = btn.dataset.act;
        const idx = state.maintenanceCategories.findIndex(c => c.id === id);
        try {
          if (act === 'up' || act === 'down') {
            const arr = [...state.maintenanceCategories];
            const swapIdx = act === 'up' ? idx - 1 : idx + 1;
            [arr[idx], arr[swapIdx]] = [arr[swapIdx], arr[idx]];
            await api('/maintenance-categories/reorder', { method: 'POST', body: JSON.stringify({ orderedIds: arr.map(c => c.id) }) });
          } else if (act === 'rename') {
            const cur = state.maintenanceCategories[idx];
            const newName = prompt('Đổi tên hạng mục:', cur.name);
            if (!newName || !newName.trim()) return;
            await api('/maintenance-categories/' + id, { method: 'PUT', body: JSON.stringify({ name: newName.trim() }) });
          } else if (act === 'del') {
            if (!confirm('Xóa hạng mục này? Các bản ghi lịch sử đã dùng hạng mục này vẫn giữ nguyên, chỉ không còn chọn được trong danh sách nữa.')) return;
            await api('/maintenance-categories/' + id, { method: 'DELETE' });
          }
          await loadMaintenanceCategories(true);
          closeModal(); openCategoryManager(onDone);
        } catch (err) { toast(err.message); }
      });
    });
  });
}

async function loadMaterials(force = false) {
  if (!force && state.materials.length) return state.materials;
  const { items } = await api('/materials');
  state.materials = items;
  return items;
}

function openMaterialManager(onDone) {
  const mats = state.materials;
  const html = `
    <div class="modal-title">Quản lý vật tư</div>
    <p style="font-size:12.5px; color:var(--ink-dim); margin-top:-6px;">
      Danh sách vật tư/linh kiện dùng khi ghi nhận bảo trì — để hệ thống tự cộng dồn số lượng đã dùng
      theo từng năm, phục vụ lên kế hoạch mua sắm.
    </p>
    <div id="material-manager-list" style="max-height:38vh; overflow-y:auto; margin:10px 0;">
      ${mats.length ? mats.map((m, i) => `
        <div class="list-item" data-id="${m.id}">
          <div class="list-item-main">
            <div class="list-item-title">${escapeHtml(m.name)}</div>
            <div class="list-item-sub">${escapeHtml(m.unit || 'chưa có đơn vị')}</div>
          </div>
          <div style="display:flex; gap:4px; flex-shrink:0;">
            <button type="button" class="btn btn-ghost btn-sm" data-act="up" ${i === 0 ? 'disabled' : ''}>↑</button>
            <button type="button" class="btn btn-ghost btn-sm" data-act="down" ${i === mats.length - 1 ? 'disabled' : ''}>↓</button>
            <button type="button" class="btn btn-ghost btn-sm" data-act="rename">Sửa</button>
            <button type="button" class="btn btn-danger btn-sm" data-act="del">Xóa</button>
          </div>
        </div>
      `).join('') : '<div class="empty-state">Chưa có vật tư nào</div>'}
    </div>
    <div style="display:flex; gap:8px;">
      <input type="text" id="new-material-name" placeholder="Tên vật tư mới (vd: Aptomat MCB 20A)..." style="flex:2; padding:9px 10px; border:1.5px solid var(--border); border-radius:7px;">
      <input type="text" id="new-material-unit" placeholder="Đơn vị (cái, bộ, mét...)" style="flex:1; padding:9px 10px; border:1.5px solid var(--border); border-radius:7px;">
      <button type="button" class="btn btn-primary" id="add-material-btn">+ Thêm</button>
    </div>
    <div class="modal-actions">
      <button type="button" class="btn btn-primary btn-block" id="done-material-manager-btn">Xong</button>
    </div>
  `;
  openModal(html);

  document.getElementById('done-material-manager-btn').addEventListener('click', () => { closeModal(); if (onDone) onDone(); });

  document.getElementById('add-material-btn').addEventListener('click', async () => {
    const nameInput = document.getElementById('new-material-name');
    const unitInput = document.getElementById('new-material-unit');
    const name = nameInput.value.trim();
    if (!name) return;
    try {
      await api('/materials', { method: 'POST', body: JSON.stringify({ name, unit: unitInput.value.trim() }) });
      await loadMaterials(true);
      closeModal(); openMaterialManager(onDone);
    } catch (err) { toast(err.message); }
  });

  document.querySelectorAll('#material-manager-list .list-item').forEach(row => {
    const id = Number(row.dataset.id);
    row.querySelectorAll('button').forEach(btn => {
      btn.addEventListener('click', async () => {
        const act = btn.dataset.act;
        const idx = state.materials.findIndex(m => m.id === id);
        try {
          if (act === 'up' || act === 'down') {
            const arr = [...state.materials];
            const swapIdx = act === 'up' ? idx - 1 : idx + 1;
            [arr[idx], arr[swapIdx]] = [arr[swapIdx], arr[idx]];
            await api('/materials/reorder', { method: 'POST', body: JSON.stringify({ orderedIds: arr.map(m => m.id) }) });
          } else if (act === 'rename') {
            const cur = state.materials[idx];
            const newName = prompt('Đổi tên vật tư:', cur.name);
            if (!newName || !newName.trim()) return;
            const newUnit = prompt('Đơn vị tính:', cur.unit || '');
            await api('/materials/' + id, { method: 'PUT', body: JSON.stringify({ name: newName.trim(), unit: (newUnit || '').trim() }) });
          } else if (act === 'del') {
            if (!confirm('Xóa vật tư này? Các bản ghi lịch sử đã dùng vật tư này vẫn giữ nguyên số liệu, chỉ không còn chọn được trong danh sách nữa.')) return;
            await api('/materials/' + id, { method: 'DELETE' });
          }
          await loadMaterials(true);
          closeModal(); openMaterialManager(onDone);
        } catch (err) { toast(err.message); }
      });
    });
  });
}

function logListItemHtml(l) {
  const matCount = (l.materials || []).length;
  return `
    <div class="list-item" data-id="${l.id}">
      <div class="list-item-main">
        <div class="list-item-title"><span class="engine-code">${escapeHtml(l.ma_thiet_bi || '')}</span> ${escapeHtml(l.ten_goi || '')}</div>
        <div class="list-item-sub">${escapeHtml(l.hang_muc || 'Chưa rõ hạng mục')} · ${escapeHtml(l.ngay_thuc_hien || '—')} ${l.nguoi_thuc_hien ? '· ' + escapeHtml(l.nguoi_thuc_hien) : ''}${matCount ? ' · 🔧 ' + matCount + ' vật tư' : ''}</div>
      </div>
    </div>
  `;
}

async function renderMaintenance() {
  const root = document.getElementById('view-root');
  await loadMaintenanceCategories();

  const chip = (val, label) => `<button class="chip ${maintFilter.hang_muc === val ? 'active' : ''}" data-val="${escapeAttr(val)}">${escapeHtml(label)}</button>`;

  root.innerHTML = `
    <div class="search-row">
      <input type="text" id="log-search" placeholder="Tìm mã thiết bị, nội dung..." value="${escapeHtml(maintFilter.q)}">
    </div>
    <div style="display:flex; gap:8px; margin-bottom:10px; flex-wrap:wrap;">
      <label style="font-size:12.5px; color:var(--ink-dim);">Từ ngày
        <input type="date" id="log-from" value="${escapeAttr(maintFilter.from)}" style="display:block; margin-top:4px; padding:7px 9px; border:1.5px solid var(--border); border-radius:7px;">
      </label>
      <label style="font-size:12.5px; color:var(--ink-dim);">Đến ngày
        <input type="date" id="log-to" value="${escapeAttr(maintFilter.to)}" style="display:block; margin-top:4px; padding:7px 9px; border:1.5px solid var(--border); border-radius:7px;">
      </label>
      ${(maintFilter.from || maintFilter.to) ? '<button type="button" class="btn btn-ghost btn-sm" id="clear-date-btn" style="align-self:flex-end;">Bỏ lọc ngày</button>' : ''}
    </div>
    <div class="filter-chips" id="hangmuc-chips">
      ${chip('', 'Tất cả hạng mục')}
      ${state.maintenanceCategories.map(c => chip(c.name, c.name)).join('')}
    </div>
    <div style="margin-bottom:10px;">
      <button type="button" class="btn btn-ghost btn-sm" id="manage-categories-btn">⚙ Quản lý hạng mục</button>
    </div>
    <div class="card" style="padding:0;" id="log-list"></div>
    <button class="fab" id="add-log-btn2">+</button>
  `;

  await renderMaintenanceListOnly();

  document.getElementById('log-search').addEventListener('input', debounce((e) => {
    maintFilter.q = e.target.value;
    renderMaintenanceListOnly();
  }, 350));

  document.getElementById('log-from').addEventListener('change', (e) => { maintFilter.from = e.target.value; renderMaintenanceListOnly(); });
  document.getElementById('log-to').addEventListener('change', (e) => { maintFilter.to = e.target.value; renderMaintenanceListOnly(); });
  const clearDateBtn = document.getElementById('clear-date-btn');
  if (clearDateBtn) clearDateBtn.addEventListener('click', () => { maintFilter.from = ''; maintFilter.to = ''; renderMaintenance(); });

  root.querySelectorAll('#hangmuc-chips .chip').forEach(c => c.addEventListener('click', () => {
    maintFilter.hang_muc = c.dataset.val;
    renderMaintenance();
  }));

  document.getElementById('manage-categories-btn').addEventListener('click', () => openCategoryManager(() => renderMaintenance()));
  document.getElementById('add-log-btn2').addEventListener('click', () => openLogForm());
}

// Chỉ vẽ lại phần danh sách kết quả (không đụng tới khung/ô tìm kiếm), để gõ tìm kiếm không bị mất focus
async function renderMaintenanceListOnly() {
  const params = new URLSearchParams();
  if (maintFilter.hang_muc) params.set('hang_muc', maintFilter.hang_muc);
  if (maintFilter.q) params.set('q', maintFilter.q);
  if (maintFilter.from) params.set('from', maintFilter.from);
  if (maintFilter.to) params.set('to', maintFilter.to);
  const { items } = await api('/maintenance?' + params.toString());
  items.forEach(l => { state.logMap[l.id] = l; });

  const list = document.getElementById('log-list');
  if (!list) return; // nguoi dung da chuyen tab truoc khi ket qua ve kip
  list.innerHTML = items.length ? items.map(logListItemHtml).join('')
    : `<div class="empty-state"><div class="empty-icon">📋</div>Không có lịch sử phù hợp bộ lọc</div>`;
  list.querySelectorAll('.list-item').forEach(el => el.addEventListener('click', () => openLogForm(state.logMap[el.dataset.id])));
}

async function openLogForm(log = null, presetEngine = null) {
  if (!state.engines.length) {
    const { items } = await api('/engines?pageSize=1000');
    state.engines = items;
  }
  await loadMaintenanceCategories();
  await loadMaterials();

  const engineLabel = (e) => {
    const { title } = engineTitleAndSub(e);
    return e.ma_thiet_bi + (title ? ' - ' + title : '');
  };
  const preselectedEngine = log
    ? state.engines.find(e => e.id === log.engine_id)
    : (presetEngine ? state.engines.find(e => e.id === presetEngine.id) : null);

  const currentHangMuc = log ? (log.hang_muc || '') : '';
  const hasCurrentInList = state.maintenanceCategories.some(c => c.name === currentHangMuc);
  const categoryOptions = `<option value="">— Chọn hạng mục —</option>` +
    state.maintenanceCategories.map(c => `<option value="${escapeAttr(c.name)}" ${c.name === currentHangMuc ? 'selected' : ''}>${escapeHtml(c.name)}</option>`).join('') +
    (currentHangMuc && !hasCurrentInList ? `<option value="${escapeAttr(currentHangMuc)}" selected>${escapeHtml(currentHangMuc)} (đã bị xóa khỏi danh sách)</option>` : '');

  const today = new Date().toISOString().slice(0, 10);

  // Danh sách vật tư đã dùng cho bản ghi này: mảng {material_id, quantity}, sửa được tự do (thêm/bớt dòng)
  let materialRows = log && Array.isArray(log.materials)
    ? log.materials.map(m => ({ material_id: m.material_id, quantity: m.quantity }))
    : [];

  const html = `
    <div class="modal-title">${log ? 'Sửa lịch sử bảo trì' : 'Ghi nhận bảo trì mới'}</div>
    ${log ? `<p id="edit-warning" style="font-size:12px; color:var(--amber); background:var(--amber-bg); border-radius:7px; padding:8px 10px; margin-top:-6px;">
      Bạn đang <b>sửa</b> bản ghi có sẵn này — bấm "Lưu" sẽ ghi đè lên đúng bản ghi này.
      Nếu muốn thêm 1 việc <b>khác</b> (hạng mục khác, ngày khác...) cho cùng động cơ mà <b>không mất</b> bản ghi hiện tại,
      hãy sửa nội dung rồi bấm <b>"Lưu thành bản ghi mới"</b> thay vì "Lưu".
    </p>` : ''}
    <form id="log-form" class="form-grid">
      <div class="full" style="position:relative;">
        <label>Động cơ
          <input type="text" id="engine-combo-input" autocomplete="off" placeholder="Gõ mã hoặc tên thiết bị để tìm..."
            value="${preselectedEngine ? escapeAttr(engineLabel(preselectedEngine)) : ''}">
        </label>
        <input type="hidden" name="engine_id" id="engine-combo-value" value="${preselectedEngine ? preselectedEngine.id : ''}">
        <div id="engine-combo-results" class="combo-results" style="display:none;"></div>
      </div>
      <div class="full">
        <label>Hạng mục / loại công việc
          <select name="hang_muc">${categoryOptions}</select>
        </label>
        <button type="button" class="btn btn-ghost btn-sm" id="manage-categories-inline-btn" style="margin-top:6px;">⚙ Quản lý hạng mục</button>
      </div>
      <div><label>Ngày thực hiện
        <input type="date" name="ngay_thuc_hien" value="${log ? (log.ngay_thuc_hien || '') : today}">
      </label></div>
      <div><label>Người thực hiện
        <input type="text" name="nguoi_thuc_hien" value="${log ? (log.nguoi_thuc_hien || '') : escapeAttr(state.user.email)}">
      </label></div>
      <div class="full"><label>Nội dung / ghi chú
        <textarea name="noi_dung" rows="3">${escapeHtml(log ? (log.noi_dung || '') : '')}</textarea>
      </label></div>
      <div class="full">
        <label>Vật tư đã dùng (không bắt buộc)</label>
        <div id="material-rows"></div>
        <div style="display:flex; gap:6px; margin-top:6px;">
          <button type="button" class="btn btn-ghost btn-sm" id="add-material-row-btn">+ Thêm vật tư</button>
          <button type="button" class="btn btn-ghost btn-sm" id="manage-materials-inline-btn">⚙ Quản lý vật tư</button>
        </div>
      </div>
      <div class="modal-actions full">
        ${log ? '<button type="button" class="btn btn-danger" id="delete-log-btn">Xóa</button>' : ''}
        <button type="button" class="btn btn-ghost" id="cancel-log-btn">Hủy</button>
        ${log ? '<button type="button" class="btn btn-primary" id="save-as-new-btn">Lưu thành bản ghi mới</button>' : ''}
        <button type="submit" class="btn btn-primary">Lưu</button>
      </div>
    </form>
  `;
  openModal(html);
  document.getElementById('cancel-log-btn').addEventListener('click', closeModal);

  // Danh sách dòng vật tư: vẽ lại mỗi khi thêm/bớt/đổi dòng
  function renderMaterialRows() {
    const wrap = document.getElementById('material-rows');
    if (!materialRows.length) {
      wrap.innerHTML = `<p style="font-size:12.5px; color:var(--ink-dim); margin:4px 0;">Chưa có vật tư nào — bấm "+ Thêm vật tư" nếu lần này có thay/dùng vật tư.</p>`;
      return;
    }
    wrap.innerHTML = materialRows.map((row, i) => `
      <div class="material-row" data-idx="${i}" style="display:flex; gap:6px; margin-bottom:6px; align-items:center;">
        <select data-idx="${i}" class="material-select" style="flex:2; padding:8px 9px; border:1.5px solid var(--border); border-radius:7px;">
          <option value="">— Chọn vật tư —</option>
          ${state.materials.map(m => `<option value="${m.id}" ${String(m.id) === String(row.material_id) ? 'selected' : ''}>${escapeHtml(m.name)}${m.unit ? ' (' + escapeHtml(m.unit) + ')' : ''}</option>`).join('')}
        </select>
        <input type="number" data-idx="${i}" class="material-qty" min="0" step="any" value="${row.quantity || ''}" placeholder="SL"
          style="flex:0 0 70px; padding:8px 9px; border:1.5px solid var(--border); border-radius:7px;">
        <button type="button" class="btn btn-danger btn-sm material-remove" data-idx="${i}">✕</button>
      </div>
    `).join('');

    wrap.querySelectorAll('.material-select').forEach(sel => {
      sel.addEventListener('change', () => { materialRows[Number(sel.dataset.idx)].material_id = sel.value; });
    });
    wrap.querySelectorAll('.material-qty').forEach(inp => {
      inp.addEventListener('input', () => { materialRows[Number(inp.dataset.idx)].quantity = inp.value; });
    });
    wrap.querySelectorAll('.material-remove').forEach(btn => {
      btn.addEventListener('click', () => { materialRows.splice(Number(btn.dataset.idx), 1); renderMaterialRows(); });
    });
  }
  renderMaterialRows();

  document.getElementById('add-material-row-btn').addEventListener('click', () => {
    materialRows.push({ material_id: '', quantity: 1 });
    renderMaterialRows();
  });
  document.getElementById('manage-materials-inline-btn').addEventListener('click', () => {
    closeModal();
    openMaterialManager(() => openLogForm(log, presetEngine));
  });

  // Combobox động cơ: gõ để lọc dần theo mã hoặc tên, click kết quả để chọn
  const comboInput = document.getElementById('engine-combo-input');
  const comboValue = document.getElementById('engine-combo-value');
  const comboResults = document.getElementById('engine-combo-results');

  function renderComboResults(query) {
    const q = query.trim().toLowerCase();
    const matches = !q ? state.engines.slice(0, 30) : state.engines.filter(e => {
      const { title } = engineTitleAndSub(e);
      return (e.ma_thiet_bi || '').toLowerCase().includes(q) || (title || '').toLowerCase().includes(q);
    }).slice(0, 30);

    comboResults.innerHTML = matches.length
      ? matches.map(e => `<div class="combo-result-item" data-id="${e.id}">${escapeHtml(engineLabel(e))}</div>`).join('')
      : `<div class="combo-empty">Không tìm thấy thiết bị nào</div>`;
    comboResults.style.display = 'block';

    comboResults.querySelectorAll('.combo-result-item').forEach(item => {
      item.addEventListener('mousedown', (ev) => {
        ev.preventDefault(); // giu focus tren input, tranh blur chay truoc khi chon xong
        const eng = state.engines.find(x => String(x.id) === item.dataset.id);
        comboInput.value = engineLabel(eng);
        comboValue.value = eng.id;
        comboResults.style.display = 'none';
      });
    });
  }

  comboInput.addEventListener('focus', () => renderComboResults(comboInput.value));
  comboInput.addEventListener('input', () => { comboValue.value = ''; renderComboResults(comboInput.value); });
  comboInput.addEventListener('blur', () => { setTimeout(() => { comboResults.style.display = 'none'; }, 150); });

  document.getElementById('manage-categories-inline-btn').addEventListener('click', () => {
    closeModal();
    openCategoryManager(() => openLogForm(log, presetEngine));
  });
  if (log) {
    document.getElementById('delete-log-btn').addEventListener('click', async () => {
      if (!confirm('Xóa bản ghi lịch sử này?')) return;
      try {
        await api('/maintenance/' + log.id, { method: 'DELETE' });
        closeModal(); toast('Đã xóa'); navigate(state.view);
      } catch (err) { toast(err.message); }
    });

    // "Lưu thành bản ghi mới": tạo 1 dòng lịch sử MỚI với nội dung trên form hiện tại,
    // KHÔNG đụng đến bản ghi gốc (log.id) đang có sẵn — dùng khi muốn ghi thêm 1 việc khác
    // (hạng mục/ngày/nội dung khác) cho cùng động cơ mà không làm mất dữ liệu cũ.
    document.getElementById('save-as-new-btn').addEventListener('click', async () => {
      if (!comboValue.value) { toast('Vui lòng chọn 1 động cơ từ danh sách gợi ý'); comboInput.focus(); return; }
      const form = document.getElementById('log-form');
      const body = Object.fromEntries(new FormData(form).entries());
      body.materials = materialRows.filter(r => r.material_id && Number(r.quantity) > 0);
      try {
        await api('/maintenance', { method: 'POST', body: JSON.stringify(body) });
        closeModal(); toast('Đã lưu thành bản ghi mới, bản ghi cũ vẫn giữ nguyên'); navigate(state.view);
      } catch (err) { toast(err.message); }
    });
  }
  document.getElementById('log-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!comboValue.value) { toast('Vui lòng chọn 1 động cơ từ danh sách gợi ý'); comboInput.focus(); return; }
    const body = Object.fromEntries(new FormData(e.target).entries());
    body.materials = materialRows.filter(r => r.material_id && Number(r.quantity) > 0);
    try {
      if (log) await api('/maintenance/' + log.id, { method: 'PUT', body: JSON.stringify(body) });
      else await api('/maintenance', { method: 'POST', body: JSON.stringify(body) });
      closeModal(); toast('Đã lưu'); navigate(state.view);
    } catch (err) { toast(err.message); }
  });
}

// ---------- Vật tư (báo cáo tiêu hao theo năm, phục vụ lên kế hoạch mua sắm) ----------
async function renderMaterialsReport() {
  const root = document.getElementById('view-root');
  if (state.user.role !== 'admin') {
    root.innerHTML = `<div class="empty-state">Chỉ admin mới xem được mục này</div>`;
    return;
  }
  await loadMaterials(true);
  const { items: usage } = await api('/materials/usage-report');

  // Gom theo vật tư, cot la nam
  const years = [...new Set(usage.map(u => u.year))].sort();
  const byMaterial = new Map();
  state.materials.forEach(m => byMaterial.set(m.id, { name: m.name, unit: m.unit, byYear: {}, total: 0 }));
  usage.forEach(u => {
    if (!byMaterial.has(u.material_id)) byMaterial.set(u.material_id, { name: u.material_name, unit: u.material_unit, byYear: {}, total: 0 });
    const entry = byMaterial.get(u.material_id);
    entry.byYear[u.year] = u.total_qty;
    entry.total += u.total_qty;
  });

  const rows = [...byMaterial.values()];

  root.innerHTML = `
    <div class="card">
      <p style="font-size:13px; color:var(--ink-dim); margin-top:0;">
        Tổng số lượng từng vật tư đã dùng theo năm (cộng dồn từ các lần ghi nhận bảo trì) — dùng để ước lượng
        nhu cầu mua sắm cho năm tới.
      </p>
      <button class="btn btn-primary btn-block" id="open-material-manager-btn">⚙ Quản lý vật tư (${state.materials.length} loại)</button>
    </div>
    <div class="section-title">Tiêu hao theo năm</div>
    <div class="card" style="overflow-x:auto;">
      ${rows.length ? `
        <table style="width:100%; border-collapse:collapse; font-size:13.5px;">
          <thead>
            <tr style="border-bottom:2px solid var(--border);">
              <th style="text-align:left; padding:8px 6px;">Vật tư</th>
              ${years.map(y => `<th style="text-align:right; padding:8px 6px;">${y}</th>`).join('')}
              <th style="text-align:right; padding:8px 6px; font-weight:800;">Tổng</th>
            </tr>
          </thead>
          <tbody>
            ${rows.map(r => `
              <tr style="border-bottom:1px solid var(--border);">
                <td style="padding:8px 6px;">${escapeHtml(r.name)}${r.unit ? ` <span style="color:var(--ink-dim); font-size:12px;">(${escapeHtml(r.unit)})</span>` : ''}</td>
                ${years.map(y => `<td style="text-align:right; padding:8px 6px;">${r.byYear[y] || '—'}</td>`).join('')}
                <td style="text-align:right; padding:8px 6px; font-weight:700;">${r.total || '—'}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      ` : '<div class="empty-state">Chưa có vật tư nào được ghi nhận. Thêm vật tư ở nút phía trên, rồi chọn khi ghi nhận bảo trì.</div>'}
    </div>
  `;

  document.getElementById('open-material-manager-btn').addEventListener('click', () => openMaterialManager(() => renderMaterialsReport()));
}
async function renderData() {
  const root = document.getElementById('view-root');
  if (state.user.role !== 'admin') {
    root.innerHTML = `<div class="empty-state">Chỉ admin mới xem được mục này</div>`;
    return;
  }
  await loadEngineFields();
  await loadMaintenanceCategories();
  const { files } = await api('/data/exports');

  root.innerHTML = `
    <div class="section-title">Trường dữ liệu động cơ</div>
    <div class="card">
      <p style="font-size:13px; color:var(--ink-dim); margin-top:0;">Tự thêm/sửa/xóa/sắp xếp các cột thông tin của động cơ (không cần sửa code).</p>
      <button class="btn btn-primary btn-block" id="open-field-manager-btn">⚙ Quản lý trường dữ liệu (${state.engineFields.length} trường)</button>
    </div>

    <div class="section-title">Hạng mục bảo trì</div>
    <div class="card">
      <p style="font-size:13px; color:var(--ink-dim); margin-top:0;">Tự thêm/sửa/xóa/sắp xếp danh sách hạng mục dùng khi ghi nhận lịch sử bảo trì.</p>
      <button class="btn btn-primary btn-block" id="open-category-manager-btn">⚙ Quản lý hạng mục (${state.maintenanceCategories.length} hạng mục)</button>
    </div>

    <div class="section-title">Nhập dữ liệu từ Excel</div>
    <div class="card">
      <p style="font-size:13px; color:var(--ink-dim); margin-top:0;">Chọn file Excel (.xlsx) — hệ thống tự dò dòng tiêu đề thật (kể cả file có tiêu đề nhiều tầng, ô gộp), bạn chỉ cần chọn cột nào tương ứng với trường nào.</p>
      <input type="file" id="import-file" accept=".xlsx">
      <div style="margin-top:10px;">
        <label style="font-size:13px; display:block; margin-bottom:4px;"><input type="radio" name="import-target" value="engines" checked> Danh sách động cơ</label>
        <label style="font-size:13px; display:block; margin-bottom:4px;"><input type="radio" name="import-target" value="maintenance"> Lịch sử bảo trì - dạng bảng thường (mỗi dòng 1 lần ghi nhận)</label>
        <label style="font-size:13px; display:block;"><input type="radio" name="import-target" value="maintenance_wide"> Lịch sử bảo trì - dạng nhiều hạng mục theo cột (vd file "Đợt kiểm tra")</label>
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

    <div class="section-title">Dọn dẹp dữ liệu</div>
    <div class="card">
      <p style="font-size:13px; color:var(--ink-dim); margin-top:0;">Xóa sạch toàn bộ lịch sử bảo trì đã ghi nhận (không đụng đến danh sách động cơ) — dùng khi cần nhập lại từ đầu cho sạch, ví dụ sau khi nhập thử/nhập nhầm.</p>
      <button class="btn btn-danger btn-block" id="clear-history-btn">🗑 Xóa toàn bộ lịch sử bảo trì</button>
    </div>
  `;

  document.getElementById('open-field-manager-btn').addEventListener('click', () => openFieldManager(() => renderData()));
  document.getElementById('open-category-manager-btn').addEventListener('click', () => openCategoryManager(() => renderData()));
  document.getElementById('clear-history-btn').addEventListener('click', async () => {
    if (!confirm('Xóa TOÀN BỘ lịch sử bảo trì đã ghi nhận? Không thể hoàn tác. Danh sách động cơ vẫn giữ nguyên.')) return;
    if (!confirm('Xác nhận lần cuối: chắc chắn xóa hết?')) return;
    try {
      const res = await api('/maintenance/all', { method: 'DELETE' });
      toast(`Đã xóa ${res.deleted} bản ghi`);
      renderData();
    } catch (err) { toast(err.message); }
  });

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
  let currentMapping = {};
  let checkedCategories = {}; // ten hang muc -> true/false, dung cho che do maintenance_wide
  let currentFixedValues = {}; // field key -> gia tri co dinh ap dung cho moi dong, dung cho che do maintenance bang thuong

  const guess = (label, key) => {
    if (key === 'ma_thiet_bi') {
      return previewData.headers.find(h => /^(mã\s*thiết\s*bị|tên\s*thiết\s*bị)$/i.test(h.trim()))
        || previewData.headers.find(h => /mã|thiết\s*bị|thiet\s*bi/i.test(h)) || '';
    }
    return previewData.headers.find(h => h.toLowerCase().includes(label.toLowerCase().split(' ')[0])) || '';
  };
  const guessMaCol = () => previewData.headers.find(h => /^(mã\s*thiết\s*bị|tên\s*thiết\s*bị)$/i.test(h.trim()))
    || previewData.headers.find(h => /mã|thiết\s*bị|thiet\s*bi/i.test(h)) || '';

  function render() {
    const headerOptions = (selected) => `<option value="">— Bỏ qua —</option>` +
      previewData.headers.map(h => `<option value="${escapeAttr(h)}" ${h === selected ? 'selected' : ''}>${escapeHtml(h)}</option>`).join('');

    const sheetSelector = previewData.sheetNames && previewData.sheetNames.length > 1 ? `
      <label style="font-size:13px; font-weight:600; color:var(--ink-dim); display:block; margin-bottom:12px;">Sheet trong file
        <select id="sheet-select" style="width:100%; margin-top:4px; padding:9px 10px; border:1.5px solid var(--border); border-radius:7px;">
          ${previewData.sheetNames.map(s => `<option value="${escapeAttr(s)}" ${s === previewData.currentSheet ? 'selected' : ''}>${escapeHtml(s)}</option>`).join('')}
        </select>
      </label>
    ` : '';

    let bodyHtml;
    if (target === 'maintenance_wide') {
      if (currentMapping.maCol === undefined) currentMapping.maCol = guessMaCol();
      if (!previewData.categoryPairs || !previewData.categoryPairs.length) {
        bodyHtml = `<div class="empty-state">Không tìm thấy cột dạng "Hạng mục - Ngày làm" trong sheet này. Thử chọn sheet khác, hoặc dùng chế độ "bảng thường".</div>`;
      } else {
        if (!Object.keys(checkedCategories).length) {
          previewData.categoryPairs.forEach(p => { checkedCategories[p.category] = true; });
        }
        bodyHtml = `
          <label style="font-size:13px; font-weight:600; color:var(--ink-dim); display:block; margin-bottom:4px;">Cột mã thiết bị</label>
          <p style="font-size:12px; color:var(--red); margin:0 0 8px;">⚠ Kiểm tra kỹ đúng cột chứa mã máy (vd N4P01M1) trước khi bấm Nhập dữ liệu — app chỉ đoán gần đúng, có thể sai với file lạ.</p>
          <select id="ma-col-select" style="width:100%; margin-bottom:12px; padding:9px 10px; border:1.5px solid var(--border); border-radius:7px;">
            <option value="">— Chọn cột —</option>
            ${previewData.headers.map(h => `<option value="${escapeAttr(h)}" ${h === currentMapping.maCol ? 'selected' : ''}>${escapeHtml(h)}</option>`).join('')}
          </select>
          <div class="section-title">Hạng mục phát hiện được (${previewData.categoryPairs.length})</div>
          <div style="max-height:36vh; overflow-y:auto;" id="category-checklist">
            ${previewData.categoryPairs.map(p => `
              <label style="display:flex; align-items:center; gap:8px; padding:8px 4px; border-bottom:1px solid var(--border); font-size:13.5px;">
                <input type="checkbox" data-category="${escapeAttr(p.category)}" ${checkedCategories[p.category] ? 'checked' : ''}>
                <span>${escapeHtml(p.category)} <span style="color:var(--ink-dim); font-size:12px;">(${escapeHtml(p.ngayCol)}${p.nguoiCol ? ' + ' + escapeHtml(p.nguoiCol) : ''})</span></span>
              </label>
            `).join('')}
          </div>
        `;
      }
    } else {
      bodyHtml = `
        <div style="max-height:40vh; overflow-y:auto;" id="mapping-rows-container">
          ${targetFields.map(f => `
            <div class="mapping-row" style="flex-wrap:wrap;">
              <label>${escapeHtml(f.label)}</label>
              <select data-field="${escapeAttr(f.key)}">${headerOptions(currentMapping[f.key] !== undefined ? currentMapping[f.key] : guess(f.label, f.key))}</select>
              ${target === 'maintenance' && f.key !== 'ma_thiet_bi' ? `
                <input type="text" data-fixed="${escapeAttr(f.key)}" placeholder="...hoặc giá trị cố định cho mọi dòng"
                  value="${escapeAttr(currentFixedValues[f.key] || '')}"
                  style="flex-basis:100%; margin-top:6px; padding:7px 9px; border:1.5px solid var(--border); border-radius:6px; font-size:12.5px;">
              ` : ''}
            </div>
          `).join('')}
        </div>
        ${target === 'maintenance' ? `
          <p style="font-size:12px; color:var(--ink-dim); margin-top:8px;">Nếu file không có cột riêng cho 1 trường (vd không có cột "Hạng mục"), gõ giá trị cố định để áp dụng cho tất cả các dòng nhập lần này.</p>
        ` : ''}
        ${target === 'engines' ? `
          <div class="section-title" style="margin-top:14px;">Cột chưa có trường tương ứng?</div>
          <p style="font-size:12px; color:var(--ink-dim); margin-top:-6px; margin-bottom:8px;">Bấm để tạo trường mới ngay từ tên cột, rồi chọn map như bình thường ở trên.</p>
          <div style="display:flex; flex-wrap:wrap; gap:6px; margin-bottom:6px;">
            ${previewData.headers.map(h => `<button type="button" class="chip" data-create-field="${escapeAttr(h)}">+ ${escapeHtml(h)}</button>`).join('')}
          </div>
        ` : ''}
      `;
    }

    const html = `
      <div class="modal-title">Chọn cột tương ứng (${previewData.totalRows} dòng dữ liệu)</div>
      ${sheetSelector}
      ${bodyHtml}
      <div class="modal-actions">
        <button type="button" class="btn btn-ghost" id="cancel-import-btn">Hủy</button>
        <button type="button" class="btn btn-primary" id="confirm-import-btn">Nhập dữ liệu</button>
      </div>
    `;
    closeModal();
    openModal(html);

    document.getElementById('cancel-import-btn').addEventListener('click', closeModal);

    const sheetSel = document.getElementById('sheet-select');
    if (sheetSel) {
      sheetSel.addEventListener('change', async () => {
        try {
          const fresh = await api('/data/preview-sheet', {
            method: 'POST',
            body: JSON.stringify({ uploadId: previewData.uploadId, sheetName: sheetSel.value }),
          });
          previewData = fresh;
          currentMapping = {};
          checkedCategories = {};
          toast('Đã đổi sang sheet "' + fresh.currentSheet + '"');
          render();
        } catch (err) { toast(err.message); }
      });
    }

    if (target === 'maintenance_wide') {
      const maColSel = document.getElementById('ma-col-select');
      if (maColSel) maColSel.addEventListener('change', () => { currentMapping.maCol = maColSel.value; });
      document.querySelectorAll('#category-checklist input[type="checkbox"]').forEach(cb => {
        cb.addEventListener('change', () => { checkedCategories[cb.dataset.category] = cb.checked; });
      });
    } else {
      document.querySelectorAll('.mapping-row select').forEach(sel => {
        sel.addEventListener('change', () => { currentMapping[sel.dataset.field] = sel.value; });
      });

      document.querySelectorAll('.mapping-row input[data-fixed]').forEach(inp => {
        inp.addEventListener('input', () => { currentFixedValues[inp.dataset.fixed] = inp.value; });
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
    }

    document.getElementById('confirm-import-btn').addEventListener('click', async () => {
      let mapping;
      if (target === 'maintenance_wide') {
        const pairs = (previewData.categoryPairs || []).filter(p => checkedCategories[p.category]);
        if (!pairs.length) { toast('Chọn ít nhất 1 hạng mục'); return; }
        mapping = { maCol: currentMapping.maCol, pairs };
      } else {
        document.querySelectorAll('.mapping-row select').forEach(sel => { currentMapping[sel.dataset.field] = sel.value; });
        document.querySelectorAll('.mapping-row input[data-fixed]').forEach(inp => { currentFixedValues[inp.dataset.fixed] = inp.value; });
        mapping = currentMapping;
      }
      try {
        const result = await api('/data/commit', {
          method: 'POST',
          body: JSON.stringify({ uploadId: previewData.uploadId, target, sheetName: previewData.currentSheet, mapping, fixedValues: currentFixedValues }),
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

// Không dùng service worker nữa (từng gây cache cũ chặn tính năng mới, khó tự phát hiện).
// Đoạn này chủ động gỡ bỏ mọi service worker + cache cũ đã lỡ cài ở các máy đã dùng bản trước,
// để tự "chữa" mà không cần người dùng vào DevTools xóa tay.
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then(regs => {
    regs.forEach(reg => reg.unregister());
  }).catch(() => {});
}
if (window.caches && caches.keys) {
  caches.keys().then(keys => keys.forEach(k => caches.delete(k))).catch(() => {});
}
