const state = {
  token: '',
  user: null,
  settings: {},
  publicCategories: [],
  admin: null,
  lobbyCategories: [],
  currentPanel: '',
  keepAliveTimer: null
};

const navByRole = {
  SUPER_ADMIN: [
    { label: 'Beranda', icon: 'B', panel: 'home' },
    { label: 'Kategori', icon: 'K', panel: 'adminCategoriesPanel', description: 'Kelola kategori checklist' },
    { label: 'Item', icon: 'I', panel: 'adminItemsPanel', description: 'Kelola item dan role ACC' },
    { label: 'Role', icon: 'R', panel: 'adminRolesPanel', description: 'Kelola role pemberi ACC' },
    { label: 'User', icon: 'U', panel: 'adminUsersPanel', description: 'Kelola akun login' },
    { label: 'Cetak', icon: 'C', panel: 'adminSettingsPanel', description: 'Logo, institusi, dan tanda tangan' }
  ],
  LOBBY: [
    { label: 'Beranda', icon: 'B', panel: 'home' },
    { label: 'Daftar', icon: '+', panel: 'lobbyRegisterPanel', description: 'Daftarkan checklist mahasiswa' },
    { label: 'Data', icon: 'S', panel: 'lobbyDataPanel', description: 'Cari data dan print checklist' }
  ],
  APPROVER: [
    { label: 'Beranda', icon: 'B', panel: 'home' },
    { label: 'ACC', icon: 'A', panel: 'approveView', description: 'Cari mahasiswa dan beri ACC' }
  ]
};

const crudLabels = {
  categoryForm: ['Tambah Kategori Baru', 'Simpan Perubahan Kategori'],
  itemForm: ['Tambah Item Baru', 'Simpan Perubahan Item'],
  roleForm: ['Tambah Role ACC Baru', 'Simpan Perubahan Role ACC'],
  userForm: ['Tambah User Baru', 'Simpan Perubahan User']
};

const $ = (id) => document.getElementById(id);

document.addEventListener('DOMContentLoaded', init);
window.addEventListener('afterprint', () => {
  document.body.classList.remove('printing');
  $('printArea').innerHTML = '';
});

async function init() {
  lockViewportGesture();
  bindEvents();
  registerServiceWorker();

  const params = new URLSearchParams(window.location.search);
  if (params.has('verify')) {
    await showVerification(params.get('verify'), params.get('token'));
    return;
  }

  await run(async () => {
    await loadPublicCategories();
    showAuthPanel('authMenu');
  }, false);
}

function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {
      // Install support is optional; the app still works without service worker.
    });
  });
}

function bindEvents() {
  $('loginForm').addEventListener('submit', onLogin);
  $('publicSearchForm').addEventListener('submit', onPublicSearch);
  $('logoutBtn').addEventListener('click', onLogout);
  $('categoryForm').addEventListener('submit', onSaveCategory);
  $('itemForm').addEventListener('submit', onSaveItem);
  $('roleForm').addEventListener('submit', onSaveRole);
  $('userForm').addEventListener('submit', onSaveUser);
  $('settingsForm').addEventListener('submit', onSaveSettings);
  $('registerForm').addEventListener('submit', onRegisterStudent);
  $('lobbySearchForm').addEventListener('submit', onLobbySearch);
  $('approverSearchForm').addEventListener('submit', onApproverSearch);
  $('userRoleType').addEventListener('change', updateUserRoleFields);

  document.body.addEventListener('click', onBodyClick);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && state.token) heartbeatNow();
  });
}

function lockViewportGesture() {
  ['gesturestart', 'gesturechange', 'gestureend'].forEach((eventName) => {
    document.addEventListener(eventName, (event) => event.preventDefault(), { passive: false });
  });
  document.addEventListener('wheel', (event) => {
    if (event.ctrlKey) event.preventDefault();
  }, { passive: false });
}

async function api(action, payload = {}, token = state.token) {
  if (window.GAS_WEB_APP_URL) {
    return jsonpApi(action, payload, token);
  }

  const response = await fetch('/api/gas', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, payload, token })
  });
  const data = await response.json().catch(() => null);
  if (!data) throw new Error('Respons server tidak valid.');
  if (!data.ok) throw new Error((data.error && data.error.message) || 'Permintaan gagal.');
  return data.result;
}

function jsonpApi(action, payload = {}, token = state.token) {
  return new Promise((resolve, reject) => {
    const callback = `__checklistGas_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const script = document.createElement('script');
    const url = new URL(window.GAS_WEB_APP_URL);

    url.searchParams.set('action', action);
    url.searchParams.set('token', token || '');
    url.searchParams.set('payload', JSON.stringify(payload || {}));
    url.searchParams.set('callback', callback);

    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error('Backend GAS tidak merespons. Pastikan Web App GAS sudah dideploy ulang.'));
    }, 25000);

    function cleanup() {
      clearTimeout(timeout);
      delete window[callback];
      script.remove();
    }

    window[callback] = (data) => {
      cleanup();
      if (!data || !data.ok) {
        reject(new Error((data && data.error && data.error.message) || 'Permintaan ke GAS gagal.'));
        return;
      }
      resolve(data.result);
    };

    script.onerror = () => {
      cleanup();
      reject(new Error('Tidak bisa memuat endpoint GAS. Periksa URL di src/config.js.'));
    };

    script.src = url.toString();
    document.head.appendChild(script);
  });
}

async function loadPublicCategories() {
  const result = await api('publicGetCategories', {}, '');
  state.publicCategories = result.categories || [];
  state.settings = Object.assign({}, state.settings, result.settings || {});
  renderBranding();
  fillCategorySelect($('publicCategory'), state.publicCategories, 'Semua kategori');
}

async function onLogin(event) {
  event.preventDefault();
  const payload = formToObject(event.target);
  await run(async () => {
    const result = await api('login', payload, '');
    state.token = result.token;
    state.user = result.user;
    state.settings = result.settings || {};
    event.target.reset();
    startKeepAlive();
    await routeAfterLogin();
    toast('Login berhasil.');
  });
}

async function onLogout() {
  await run(async () => {
    if (state.token) await api('logout', {}, state.token);
    clearSession();
    $('appScreen').classList.add('d-none');
    $('authScreen').classList.remove('d-none');
    showAuthPanel('authMenu');
    toast('Anda sudah keluar.');
  });
}

function clearSession() {
  state.token = '';
  state.user = null;
  state.admin = null;
  state.currentPanel = '';
  stopKeepAlive();
}

function startKeepAlive() {
  stopKeepAlive();
  state.keepAliveTimer = setInterval(heartbeatNow, 240000);
}

function stopKeepAlive() {
  if (state.keepAliveTimer) clearInterval(state.keepAliveTimer);
  state.keepAliveTimer = null;
}

async function heartbeatNow() {
  if (!state.token || document.visibilityState !== 'visible') return;
  try {
    await api('keepAliveSession');
  } catch (err) {
    handleSessionExpired(err);
  }
}

async function routeAfterLogin() {
  $('authScreen').classList.add('d-none');
  $('verifyScreen').classList.add('d-none');
  $('appScreen').classList.remove('d-none');
  renderShell();

  if (state.user.roleType === 'SUPER_ADMIN') {
    await loadAdmin();
  } else if (state.user.roleType === 'LOBBY') {
    await loadLobby();
  } else if (state.user.roleType === 'APPROVER') {
    await loadApprover();
  }
  renderShell();
  showPanel('home');
}

function renderShell() {
  const name = state.settings.appName || 'Aplikasi Checklist';
  $('appName').textContent = name;
  $('userBadge').textContent = state.user
    ? `${state.user.fullName || state.user.username} - ${labelRoleType(state.user.roleType)}${state.user.approverRole ? ' / ' + state.user.approverRole : ''}`
    : '-';
  renderBranding();
  renderHomeDashboard();
  renderBottomNav();
}

function showRoleView(viewId) {
  document.querySelectorAll('.role-view').forEach((view) => {
    view.classList.toggle('d-none', view.id !== viewId);
  });
}

function showPanel(panelId) {
  state.currentPanel = panelId;

  if (panelId === 'home') {
    showRoleView('roleHomeView');
    document.querySelectorAll('.app-panel').forEach((panel) => panel.classList.add('d-none'));
    renderBottomNav();
    window.scrollTo({ top: 0, behavior: 'smooth' });
    return;
  }

  if (panelId.startsWith('admin')) showRoleView('adminView');
  if (panelId.startsWith('lobby')) showRoleView('lobbyView');
  if (panelId === 'approveView') showRoleView('approveView');

  document.querySelectorAll('.app-panel').forEach((panel) => {
    panel.classList.toggle('d-none', panel.id !== panelId);
  });
  renderBottomNav();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function renderBottomNav() {
  const nav = $('bottomNav');
  const items = state.user ? (navByRole[state.user.roleType] || []) : [];
  nav.innerHTML = items.map((item) => `
    <button type="button" class="${state.currentPanel === item.panel ? 'active' : ''}" data-panel="${esc(item.panel)}">
      <span class="nav-icon">${esc(item.icon)}</span>
      <span>${esc(item.label)}</span>
    </button>
  `).join('');
}

async function loadAdmin() {
  state.admin = await api('adminGetDashboard');
  renderAdmin();
}

function renderAdmin() {
  const data = state.admin || { categories: [], roles: [], items: [], users: [], settings: {} };
  fillCategorySelect($('itemCategory'), data.categories.filter(isActive), 'Pilih kategori');
  fillRoleSelect($('userApproverRole'), data.roles.filter(isActive));
  renderItemRoleChecks(data.roles.filter(isActive));
  updateUserRoleFields();
  renderCategories(data.categories);
  renderRoles(data.roles);
  renderItems(data.items, data.categories);
  renderUsers(data.users);
  fillSettingsForm(data.settings || {});
  renderHomeDashboard();
}

function renderCategories(rows) {
  $('categoryList').innerHTML = rows.map((row) => entityCard({
    title: row.name,
    meta: row.description || '-',
    badge: activeBadge(row.active),
    action: `<button class="btn btn-light" type="button" data-edit-category="${esc(row.id)}">Edit</button>`
  })).join('') || emptyState('Belum ada kategori.');
}

function renderRoles(rows) {
  $('roleList').innerHTML = rows.map((row) => entityCard({
    title: row.name,
    meta: row.description || '-',
    badge: activeBadge(row.active),
    action: `<button class="btn btn-light" type="button" data-edit-role="${esc(row.id)}">Edit</button>`
  })).join('') || emptyState('Belum ada role ACC.');
}

function renderItems(items, categories) {
  const categoryMap = Object.fromEntries(categories.map((item) => [item.id, item.name]));
  $('itemList').innerHTML = items.map((item) => entityCard({
    title: item.name,
    meta: `${categoryMap[item.categoryId] || '-'} | Role: ${item.allowedRoles || '-'} | Urutan: ${item.sortOrder || 0}`,
    badge: activeBadge(item.active),
    action: `<button class="btn btn-light" type="button" data-edit-item="${esc(item.id)}">Edit</button>`
  })).join('') || emptyState('Belum ada item checklist.');
}

function renderUsers(users) {
  $('userList').innerHTML = users.map((user) => entityCard({
    title: user.fullName || user.username,
    meta: `${user.username} | ${labelRoleType(user.roleType)}${user.approverRole ? ' | ' + user.approverRole : ''}`,
    badge: activeBadge(user.active),
    action: `<button class="btn btn-light" type="button" data-edit-user="${esc(user.id)}">Edit</button>`
  })).join('') || emptyState('Belum ada user.');
}

function renderItemRoleChecks(roles) {
  $('itemRoleChecks').innerHTML = roles.map((role) => `
    <label class="check-pill">
      <input type="checkbox" value="${esc(role.name)}">
      <span>${esc(role.name)}</span>
    </label>
  `).join('') || '<div class="text-muted">Belum ada role ACC aktif.</div>';
}

async function onSaveCategory(event) {
  event.preventDefault();
  await run(async () => {
    state.admin = await api('saveCategory', formToObject(event.target));
    resetCrudForm('categoryForm');
    renderAdmin();
    toast('Kategori tersimpan.');
  });
}

async function onSaveRole(event) {
  event.preventDefault();
  await run(async () => {
    state.admin = await api('saveApproverRole', formToObject(event.target));
    resetCrudForm('roleForm');
    renderAdmin();
    toast('Role ACC tersimpan.');
  });
}

async function onSaveItem(event) {
  event.preventDefault();
  const payload = formToObject(event.target);
  payload.allowedRoles = Array.from(document.querySelectorAll('#itemRoleChecks input:checked')).map((input) => input.value);
  await run(async () => {
    state.admin = await api('saveChecklistItem', payload);
    resetCrudForm('itemForm');
    renderAdmin();
    toast('Item checklist tersimpan.');
  });
}

async function onSaveUser(event) {
  event.preventDefault();
  await run(async () => {
    state.admin = await api('saveUser', formToObject(event.target));
    resetCrudForm('userForm');
    renderAdmin();
    toast('User tersimpan.');
  });
}

async function onSaveSettings(event) {
  event.preventDefault();
  await run(async () => {
    state.admin = await api('saveAppSettings', formToObject(event.target));
    state.settings = state.admin.settings || {};
    renderShell();
    renderAdmin();
    toast('Pengaturan tersimpan.');
  });
}

async function loadLobby() {
  const result = await api('lobbyGetData');
  state.lobbyCategories = result.categories || [];
  state.settings = Object.assign({}, state.settings, result.settings || {});
  fillCategorySelect($('registerCategory'), state.lobbyCategories, 'Pilih kategori');
  fillCategorySelect($('lobbyCategory'), state.lobbyCategories, 'Semua kategori');
  renderHomeDashboard();
}

async function onRegisterStudent(event) {
  event.preventDefault();
  await run(async () => {
    const detail = await api('registerStudentChecklist', formToObject(event.target));
    event.target.reset();
    $('lobbyRegisterDetail').innerHTML = renderDetail(detail, { allowPrint: true, source: 'LOBBY' });
    toast('Checklist mahasiswa berhasil didaftarkan.');
  });
}

async function onLobbySearch(event) {
  event.preventDefault();
  await run(async () => {
    const rows = await api('searchRegistrations', formToObject(event.target));
    $('lobbyCount').textContent = `${rows.length} data`;
    $('lobbyResults').innerHTML = renderResultCards(rows, 'lobby');
    $('lobbyDetail').innerHTML = '';
  });
}

async function loadLobbyDetail(id) {
  await run(async () => {
    const detail = await api('getChecklistDetail', { registrationId: id });
    $('lobbyDetail').innerHTML = renderDetail(detail, { allowPrint: true, source: 'LOBBY' });
  });
}

async function loadApprover() {
  const result = await api('getStaffBootstrap');
  fillCategorySelect($('approverCategory'), result.categories || [], 'Semua kategori');
  $('approverRoleBadge').textContent = state.user.approverRole || '-';
  renderHomeDashboard();
}

async function onApproverSearch(event) {
  event.preventDefault();
  await run(async () => {
    const rows = await api('searchRegistrations', formToObject(event.target));
    $('approverResults').innerHTML = renderResultCards(rows, 'approver');
    $('approverDetail').innerHTML = '';
  });
}

async function loadApproverDetail(id) {
  await run(async () => {
    const detail = await api('getChecklistDetail', { registrationId: id });
    $('approverDetail').innerHTML = renderDetail(detail, { allowPrint: false, source: 'APPROVER' });
  });
}

async function approveItem(approvalId) {
  const noteInput = document.querySelector(`[data-note-for="${cssEscape(approvalId)}"]`);
  await run(async () => {
    const detail = await api('approveChecklistItem', {
      approvalId,
      note: noteInput ? noteInput.value : ''
    });
    $('approverDetail').innerHTML = renderDetail(detail, { allowPrint: false, source: 'APPROVER' });
    toast('Item berhasil di-ACC.');
  });
}

async function onPublicSearch(event) {
  event.preventDefault();
  await run(async () => {
    const rows = await api('publicSearch', formToObject(event.target), '');
    $('publicCount').textContent = `${rows.length} data`;
    $('publicResults').innerHTML = renderResultCards(rows, 'public');
    $('publicDetail').innerHTML = '';
  });
}

async function loadPublicDetail(id) {
  await run(async () => {
    const detail = await api('publicGetChecklistDetail', { registrationId: id }, '');
    $('publicDetail').innerHTML = renderDetail(detail, { allowPrint: false, source: 'PUBLIC' });
  });
}

async function showVerification(registrationId, publicToken) {
  $('authScreen').classList.add('d-none');
  $('appScreen').classList.add('d-none');
  $('verifyScreen').classList.remove('d-none');

  await run(async () => {
    const detail = await api('verifyChecklist', { registrationId, publicToken }, '');
    if (!detail.valid) {
      $('verifyBadge').textContent = 'Tidak valid';
      $('verifyBadge').className = 'soft-badge wait';
      $('verifyContent').innerHTML = `<div class="alert alert-warning mb-0">${esc(detail.message || 'Kode verifikasi tidak valid.')}</div>`;
      return;
    }
    $('verifyBadge').textContent = 'Valid';
    $('verifyBadge').className = 'soft-badge ok';
    $('verifyContent').innerHTML = renderDetail(detail, { allowPrint: false, source: 'VERIFY' });
  });
}

function renderResultCards(rows, mode) {
  return rows.map((row) => {
    const buttons = [`<button class="btn btn-light" type="button" data-open-${mode}="${esc(row.id)}">Lihat</button>`];
    if (mode === 'lobby' && row.canPrint) {
      buttons.push(`<button class="btn btn-gradient" type="button" data-print="${esc(row.id)}">Print</button>`);
    }
    return entityCard({
      title: row.studentName,
      meta: `${row.nim} | ${row.jurusan} | ${row.categoryName}`,
      badge: `<span class="soft-badge ${row.complete ? 'ok' : 'wait'}">${row.approvedCount} / ${row.totalCount}</span>`,
      action: buttons.join('')
    });
  }).join('') || emptyState('Belum ada data.');
}

function renderDetail(detail, options) {
  const allowPrint = Boolean(options && options.allowPrint);
  const source = options && options.source;
  const printButton = allowPrint && detail.complete
    ? `<button class="btn btn-gradient" type="button" data-print="${esc(detail.registration.id)}">Print</button>`
    : '';

  const items = (detail.items || []).map((item) => {
    const approveControl = source === 'APPROVER' && item.canApprove
      ? `<div class="card-actions"><input class="form-control" data-note-for="${esc(item.approvalId)}" placeholder="Catatan opsional"><button class="btn btn-gradient" type="button" data-approve="${esc(item.approvalId)}">ACC</button></div>`
      : `<div class="meta">${esc(item.note || item.approvedBy || '-')}</div>`;
    return `
      <div class="list-card">
        <div class="d-flex align-items-start justify-content-between gap-3">
          <div>
            <p class="list-card-title">${esc(item.name)}</p>
            <div class="meta">${esc(item.description || '')}</div>
            <div class="meta">Role ACC: ${esc((item.allowedRoles || []).join(', ') || '-')}</div>
          </div>
          <span class="soft-badge ${item.approved ? 'ok' : 'wait'}">${item.approved ? 'ACC' : 'Menunggu'}</span>
        </div>
        <div class="mt-3">${approveControl}</div>
      </div>
    `;
  }).join('');

  return `
    <section class="app-card mt-3">
      <div class="app-card-head">
        <div>
          <span class="eyebrow">Detail Checklist</span>
          <h2 class="section-title mb-0">${esc(detail.category.name)}</h2>
        </div>
        <div class="d-flex gap-2 flex-wrap">
          <span class="soft-badge ${detail.complete ? 'ok' : 'wait'}">${detail.approvedCount} / ${detail.totalCount}</span>
          ${printButton}
        </div>
      </div>
      <div class="p-3 p-md-4">
        <div class="mini-grid mb-3">
          <div class="mini-box"><span>Nama</span><strong>${esc(detail.registration.studentName)}</strong></div>
          <div class="mini-box"><span>NIM</span><strong>${esc(detail.registration.nim)}</strong></div>
          <div class="mini-box"><span>Jurusan</span><strong>${esc(detail.registration.jurusan)}</strong></div>
          <div class="mini-box"><span>Terdaftar</span><strong>${esc(detail.registration.createdAt)}</strong></div>
        </div>
        <div class="result-list">${items || emptyState('Belum ada item checklist.')}</div>
      </div>
    </section>
  `;
}

async function openPrint(id) {
  await run(async () => {
    const detail = await api('getPrintData', {
      registrationId: id,
      verifyBaseUrl: `${window.location.origin}${window.location.pathname}`
    });
    $('printArea').innerHTML = renderPrint(detail);
    await waitForImages($('printArea'), 3500);
    document.body.classList.add('printing');
    setTimeout(() => window.print(), 120);
  });
}

function renderPrint(detail) {
  const settings = detail.settings || {};
  const printLogo = settings.logoUrl || logoUrl();
  const rows = (detail.items || []).map((item, index) => `
    <tr>
      <td>${index + 1}</td>
      <td>${esc(item.name)}</td>
      <td style="text-align:center">ACC</td>
      <td>${esc(item.approvedBy)}</td>
      <td>${esc(item.approvedAt)}</td>
      <td>${esc(item.note || '')}</td>
    </tr>
  `).join('');

  return `
    <div class="print-sheet">
      <section class="print-head">
        <div class="print-logo-box">
          ${printLogo ? `<img class="print-logo" alt="Logo institusi" src="${esc(printLogo)}">` : `<div class="print-logo-placeholder">LOGO</div>`}
        </div>
        <div class="print-title-box">
          <h1>${esc(settings.institutionName || '')}</h1>
          <h2>${esc(settings.facultyName || '')}</h2>
        </div>
      </section>
      <h2 style="text-align:center;margin:0 0 18px">${esc(settings.printTitle || 'LEMBAR CHECKLIST')}</h2>
      <div class="mini-grid">
        <div><strong>Nama Mahasiswa</strong><br>${esc(detail.registration.studentName)}</div>
        <div><strong>NIM</strong><br>${esc(detail.registration.nim)}</div>
        <div><strong>Jurusan</strong><br>${esc(detail.registration.jurusan)}</div>
        <div><strong>Kategori</strong><br>${esc(detail.category.name)}</div>
      </div>
      <table class="print-table">
        <thead>
          <tr>
            <th>No</th>
            <th>Item Checklist</th>
            <th>ACC</th>
            <th>Petugas</th>
            <th>Tanggal</th>
            <th>Catatan</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
      <section class="print-bottom">
        <div class="qr-box">
          <img class="qr-image" alt="QR verifikasi" width="148" height="148" referrerpolicy="no-referrer" src="${qrUrl(detail.verifyUrl)}">
          <strong>QR Verifikasi</strong>
          <div>${esc(detail.registration.id)}</div>
          <small>${esc(detail.verifyUrl || '')}</small>
        </div>
        <div></div>
        <div class="signature-box">
          <div>${esc(settings.signatureCity || '')}, ${todayText()}</div>
          <div>Dekan</div>
          <div class="signature-space"></div>
          <strong>${esc(settings.deanName || 'Nama Dekan')}</strong>
          <div>${settings.deanNip ? 'NIP/NIDN. ' + esc(settings.deanNip) : ''}</div>
        </div>
      </section>
    </div>
  `;
}

function onBodyClick(event) {
  const button = event.target.closest('button');
  if (!button) return;

  if (button.dataset.authPanel) showAuthPanel(button.dataset.authPanel);
  if (button.dataset.panel) showPanel(button.dataset.panel);
  if (button.dataset.resetForm) resetCrudForm(button.dataset.resetForm);
  if (button.dataset.editCategory) editCategory(button.dataset.editCategory);
  if (button.dataset.editRole) editRole(button.dataset.editRole);
  if (button.dataset.editItem) editItem(button.dataset.editItem);
  if (button.dataset.editUser) editUser(button.dataset.editUser);
  if (button.dataset.openPublic) loadPublicDetail(button.dataset.openPublic);
  if (button.dataset.openLobby) loadLobbyDetail(button.dataset.openLobby);
  if (button.dataset.openApprover) loadApproverDetail(button.dataset.openApprover);
  if (button.dataset.approve) approveItem(button.dataset.approve);
  if (button.dataset.print) openPrint(button.dataset.print);
}

function editCategory(id) {
  fillForm('categoryForm', state.admin.categories.find((row) => row.id === id));
  setCrudMode('categoryForm', true);
  showPanel('adminCategoriesPanel');
}

function editRole(id) {
  fillForm('roleForm', state.admin.roles.find((row) => row.id === id));
  setCrudMode('roleForm', true);
  showPanel('adminRolesPanel');
}

function editItem(id) {
  const row = state.admin.items.find((item) => item.id === id);
  fillForm('itemForm', row);
  const selected = String(row.allowedRoles || '').split(',').map((value) => value.trim());
  document.querySelectorAll('#itemRoleChecks input').forEach((input) => {
    input.checked = selected.indexOf(input.value) !== -1;
  });
  setCrudMode('itemForm', true);
  showPanel('adminItemsPanel');
}

function editUser(id) {
  const row = state.admin.users.find((user) => user.id === id);
  fillForm('userForm', Object.assign({}, row, { password: '' }));
  updateUserRoleFields();
  setCrudMode('userForm', true);
  showPanel('adminUsersPanel');
}

function resetCrudForm(formId) {
  const form = $(formId);
  form.reset();
  if (form.elements.id) form.elements.id.value = '';
  if (formId === 'itemForm') {
    form.elements.sortOrder.value = '0';
    document.querySelectorAll('#itemRoleChecks input').forEach((input) => {
      input.checked = false;
    });
  }
  if (formId === 'userForm') updateUserRoleFields();
  setCrudMode(formId, false);
}

function setCrudMode(formId, isEdit) {
  const labels = crudLabels[formId];
  if (!labels) return;
  const button = {
    categoryForm: 'categorySubmitBtn',
    itemForm: 'itemSubmitBtn',
    roleForm: 'roleSubmitBtn',
    userForm: 'userSubmitBtn'
  }[formId];
  if (button) $(button).textContent = isEdit ? labels[1] : labels[0];
}

function updateUserRoleFields() {
  const isApprover = $('userRoleType').value === 'APPROVER';
  $('userApproverRole').disabled = !isApprover;
  if (!isApprover) $('userApproverRole').value = '';
}

function fillSettingsForm(settings) {
  const form = $('settingsForm');
  ['logoUrl', 'appName', 'printTitle', 'institutionName', 'facultyName', 'deanName', 'deanNip', 'signatureCity'].forEach((name) => {
    form.elements[name].value = settings[name] || '';
  });
}

function fillForm(formId, data) {
  const form = $(formId);
  Object.keys(data || {}).forEach((key) => {
    if (form.elements[key]) form.elements[key].value = data[key] == null ? '' : data[key];
  });
}

function fillCategorySelect(select, categories, firstLabel) {
  select.innerHTML = `<option value="">${esc(firstLabel)}</option>` + (categories || []).map((category) => (
    `<option value="${esc(category.id)}">${esc(category.name)}</option>`
  )).join('');
}

function fillRoleSelect(select, roles) {
  select.innerHTML = '<option value="">Pilih role ACC</option>' + (roles || []).map((role) => (
    `<option value="${esc(role.name)}">${esc(role.name)}</option>`
  )).join('');
}

function entityCard({ title, meta, badge, action }) {
  return `
    <article class="list-card">
      <div class="d-flex align-items-start justify-content-between gap-3">
        <div>
          <p class="list-card-title">${esc(title || '-')}</p>
          <div class="meta">${esc(meta || '')}</div>
        </div>
        ${badge || ''}
      </div>
      ${action ? `<div class="card-actions">${action}</div>` : ''}
    </article>
  `;
}

function activeBadge(active) {
  return `<span class="soft-badge ${isActive({ active }) ? 'ok' : 'wait'}">${isActive({ active }) ? 'Aktif' : 'Nonaktif'}</span>`;
}

function emptyState(message) {
  return `<div class="list-card text-muted">${esc(message)}</div>`;
}

function formToObject(form) {
  return Object.fromEntries(new FormData(form).entries());
}

function showAuthPanel(panelId) {
  ['authMenu', 'loginPane', 'studentPane'].forEach((id) => {
    const panel = $(id);
    if (panel) panel.classList.toggle('d-none', id !== panelId);
  });
  document.body.classList.toggle('auth-panel-open', panelId !== 'authMenu');
  const authCard = document.querySelector('.auth-card');
  if (authCard) authCard.scrollTop = 0;
}

function renderBranding() {
  const settings = state.settings || {};
  const appName = settings.appName || 'Aplikasi Checklist';
  const institution = settings.institutionName || 'Checklist digital mahasiswa';
  const faculty = settings.facultyName || '';
  const logo = logoUrl();

  if ($('authAppName')) $('authAppName').innerHTML = esc(appName).replace(/\s+/g, '<br>');
  if ($('authCampusName')) $('authCampusName').textContent = faculty ? `${institution} - ${faculty}` : institution;
  setImage('authLogo', 'authLogoFallback', logo, appName.slice(0, 1));
  setImage('dashboardLogo', 'dashboardLogoFallback', logo, appName.slice(0, 1));
}

function renderHomeDashboard() {
  if (!state.user || !$('panelMenu')) return;

  const settings = state.settings || {};
  const menuItems = (navByRole[state.user.roleType] || []).filter((item) => item.panel !== 'home');
  $('dashboardRoleLabel').textContent = labelRoleType(state.user.roleType);
  $('dashboardInstitution').textContent = settings.institutionName || settings.appName || 'Aplikasi Checklist';
  $('dashboardFaculty').textContent = settings.facultyName || 'Checklist digital mahasiswa';
  $('panelMenu').innerHTML = menuItems.map((item) => `
    <button class="panel-menu-item" type="button" data-panel="${esc(item.panel)}">
      <span class="nav-icon">${esc(item.icon)}</span>
      <strong>${esc(item.label)}</strong>
      <small>${esc(item.description || '')}</small>
    </button>
  `).join('');

  $('dashboardStats').innerHTML = dashboardStats().map((item) => `
    <div class="dashboard-stat">
      <strong>${esc(item.value)}</strong>
      <span>${esc(item.label)}</span>
    </div>
  `).join('');
}

function dashboardStats() {
  if (!state.user) return [];
  if (state.user.roleType === 'SUPER_ADMIN') {
    const data = state.admin || {};
    return [
      { label: 'Kategori', value: (data.categories || []).length },
      { label: 'Item', value: (data.items || []).length },
      { label: 'Role ACC', value: (data.roles || []).length },
      { label: 'User', value: (data.users || []).length }
    ];
  }
  if (state.user.roleType === 'LOBBY') {
    return [
      { label: 'Kategori Aktif', value: state.lobbyCategories.length || 0 },
      { label: 'Panel', value: '2' }
    ];
  }
  return [
    { label: 'Role ACC', value: state.user.approverRole || '-' },
    { label: 'Panel', value: '1' }
  ];
}

function setImage(imageId, fallbackId, src, fallbackText) {
  const image = $(imageId);
  const fallback = $(fallbackId);
  if (!image || !fallback) return;

  if (!src) {
    image.classList.add('d-none');
    fallback.classList.remove('d-none');
    fallback.textContent = fallbackText || 'C';
    return;
  }

  image.onload = () => {
    image.classList.remove('d-none');
    fallback.classList.add('d-none');
  };
  image.onerror = () => {
    image.classList.add('d-none');
    fallback.classList.remove('d-none');
  };
  image.src = src;
}

function logoUrl() {
  return (state.settings && state.settings.logoUrl) || window.APP_LOGO_URL || '';
}

function waitForImages(root, timeoutMs) {
  const images = Array.from(root.querySelectorAll('img'));
  if (images.length === 0) return Promise.resolve();
  return Promise.race([
    Promise.all(images.map((image) => {
      if (image.complete) return Promise.resolve();
      return new Promise((resolve) => {
        image.onload = resolve;
        image.onerror = resolve;
      });
    })),
    new Promise((resolve) => setTimeout(resolve, timeoutMs))
  ]);
}

async function run(task, showSpinner = true) {
  let timer = null;
  try {
    if (showSpinner) timer = setTimeout(() => $('loading').classList.remove('d-none'), 150);
    await task();
  } catch (err) {
    if (!handleSessionExpired(err)) {
      toast(err && err.message ? err.message : String(err), 'error');
    }
  } finally {
    if (timer) clearTimeout(timer);
    $('loading').classList.add('d-none');
  }
}

function handleSessionExpired(err) {
  const message = err && err.message ? err.message : String(err || '');
  if (!/Sesi|Akun tidak aktif/i.test(message)) return false;
  clearSession();
  $('appScreen').classList.add('d-none');
  $('authScreen').classList.remove('d-none');
  showAuthPanel('authMenu');
  toast('Sesi habis. Silakan login ulang.', 'error');
  return true;
}

function toast(message, type) {
  const box = $('toast');
  box.textContent = message;
  box.className = `toast-box ${type === 'error' ? 'error' : ''}`;
  box.classList.remove('d-none');
  clearTimeout(window.__toastTimer);
  window.__toastTimer = setTimeout(() => box.classList.add('d-none'), 3600);
}

function isActive(row) {
  return row && row.active !== false && String(row.active).toUpperCase() !== 'FALSE';
}

function labelRoleType(roleType) {
  return {
    SUPER_ADMIN: 'Admin Super',
    LOBBY: 'Tim Loby',
    APPROVER: 'Tim ACC'
  }[roleType] || roleType || '-';
}

function qrUrl(text) {
  return `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(text || window.location.href)}`;
}

function todayText() {
  return new Intl.DateTimeFormat('id-ID', { day: '2-digit', month: 'long', year: 'numeric' }).format(new Date());
}

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[char]));
}

function cssEscape(value) {
  if (window.CSS && CSS.escape) return CSS.escape(value);
  return String(value).replace(/"/g, '\\"');
}
