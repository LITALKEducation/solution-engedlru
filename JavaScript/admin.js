/* ════════════════════════════════════════
   Admin Dashboard — เชื่อมต่อ Cloudflare Worker API
════════════════════════════════════════ */

/* ════ UTIL ════ */
function escHtmlAdmin(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

async function adminFetch(path, options = {}) {
    const token = await auth0Client.getTokenSilently();
    const headers = { ...(options.headers || {}), Authorization: `Bearer ${token}` };
    if (options.body && !headers['Content-Type']) headers['Content-Type'] = 'application/json';
    return fetch(`${API_BASE_URL}${path}`, { ...options, headers });
}

/* ════ TOAST ════ */
function showToast(message, type = 'info', ttl = 3800) {
    const container = document.getElementById('toastContainer');
    const icons = { success: 'fa-circle-check', error: 'fa-circle-xmark', info: 'fa-circle-info' };
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    el.innerHTML = `<i class="fa-solid ${icons[type] || icons.info}"></i><div class="toast-msg">${escHtmlAdmin(message)}</div>`;
    container.appendChild(el);
    setTimeout(() => {
        el.classList.add('leaving');
        setTimeout(() => el.remove(), 200);
    }, ttl);
}

/* ════ CONFIRM DIALOG ════ */
function confirmDialog({ title = 'ยืนยันการทำรายการ', body = '', okText = 'ยืนยัน', danger = true } = {}) {
    return new Promise(resolve => {
        const overlay = document.getElementById('confirmDialog');
        document.getElementById('confirmTitle').textContent = title;
        document.getElementById('confirmBody').textContent = body;
        const okBtn = document.getElementById('confirmOkBtn');
        const cancelBtn = document.getElementById('confirmCancelBtn');
        okBtn.textContent = okText;
        okBtn.className = 'admin-btn' + (danger ? ' danger' : ' primary');
        document.getElementById('confirmIcon').className = 'modal-icon ' + (danger ? 'danger' : 'info');
        document.getElementById('confirmIcon').innerHTML = `<i class="fa-solid ${danger ? 'fa-triangle-exclamation' : 'fa-circle-info'}"></i>`;

        function cleanup(result) {
            overlay.classList.remove('show');
            okBtn.removeEventListener('click', onOk);
            cancelBtn.removeEventListener('click', onCancel);
            overlay.removeEventListener('click', onOverlay);
            resolve(result);
        }
        function onOk() { cleanup(true); }
        function onCancel() { cleanup(false); }
        function onOverlay(e) { if (e.target === overlay) cleanup(false); }

        okBtn.addEventListener('click', onOk);
        cancelBtn.addEventListener('click', onCancel);
        overlay.addEventListener('click', onOverlay);
        overlay.classList.add('show');
    });
}

/* ════ ROW ACTIONS (⋮) MENU ════ */
function renderActionsMenu(id, actions) {
    const menuId = `actionsMenu-${id}`;
    return `<div class="dt-actions">
        <button class="dt-actions-btn" onclick="toggleActionsMenu('${menuId}', event)"><i class="fa-solid fa-ellipsis-vertical"></i></button>
        <div class="dt-actions-menu" id="${menuId}">
            ${actions.map(a => `<button class="${a.danger ? 'danger' : ''}" onclick="${a.onClick}"><i class="fa-solid ${a.icon}"></i> ${escHtmlAdmin(a.label)}</button>`).join('')}
        </div>
    </div>`;
}
function toggleActionsMenu(id, event) {
    event.stopPropagation();
    const menu = document.getElementById(id);
    const isOpen = menu.classList.contains('show');
    document.querySelectorAll('.dt-actions-menu.show').forEach(m => m.classList.remove('show'));
    if (!isOpen) menu.classList.add('show');
}
document.addEventListener('click', () => document.querySelectorAll('.dt-actions-menu.show').forEach(m => m.classList.remove('show')));

/* ════ GENERIC DATA TABLE (search + sort + paginate + skeleton/empty/error) ════ */
function createDataTable({ tableSelector, tbodyId, paginationId, searchInputId, searchKeys, getRows, renderRow, colSpan, pageSize = 10, emptyText = 'ไม่มีข้อมูล' }) {
    let allRows = [];
    let filtered = [];
    let sortKey = null, sortDir = 1;
    let page = 1;

    function apply() {
        const q = searchInputId ? (document.getElementById(searchInputId)?.value || '').trim().toLowerCase() : '';
        filtered = !q ? allRows.slice() : allRows.filter(r => searchKeys.some(k => String(r[k] ?? '').toLowerCase().includes(q)));
        if (sortKey) {
            filtered.sort((a, b) => {
                const av = a[sortKey], bv = b[sortKey];
                if (av == null && bv == null) return 0;
                if (av == null) return 1;
                if (bv == null) return -1;
                return (av > bv ? 1 : av < bv ? -1 : 0) * sortDir;
            });
        }
        const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
        page = Math.min(page, totalPages);
        render();
    }

    function render() {
        const tbody = document.getElementById(tbodyId);
        if (!filtered.length) {
            tbody.innerHTML = `<tr><td colspan="${colSpan}" class="dt-empty"><i class="fa-regular fa-folder-open"></i>${escHtmlAdmin(emptyText)}</td></tr>`;
        } else {
            const start = (page - 1) * pageSize;
            tbody.innerHTML = filtered.slice(start, start + pageSize).map(renderRow).join('');
        }
        if (paginationId) renderPagination();
    }

    function renderPagination() {
        const el = document.getElementById(paginationId);
        if (!el) return;
        const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
        const start = filtered.length ? (page - 1) * pageSize + 1 : 0;
        const end = Math.min(page * pageSize, filtered.length);
        el.innerHTML = `
            <div class="dt-pagination-info">แสดง ${start}-${end} จาก ${filtered.length} รายการ</div>
            <div class="dt-pagination-btns">
                <button class="admin-btn sm" ${page <= 1 ? 'disabled' : ''} data-dt="prev">‹ ก่อนหน้า</button>
                <button class="admin-btn sm" ${page >= totalPages ? 'disabled' : ''} data-dt="next">ถัดไป ›</button>
            </div>`;
        el.querySelector('[data-dt="prev"]')?.addEventListener('click', () => { page--; render(); });
        el.querySelector('[data-dt="next"]')?.addEventListener('click', () => { page++; render(); });
    }

    function skeleton() {
        const tbody = document.getElementById(tbodyId);
        tbody.innerHTML = Array.from({ length: 4 }, () =>
            `<tr class="skeleton-row">${Array.from({ length: colSpan }, () => '<td><div class="skeleton skeleton-line" style="width:80%"></div></td>').join('')}</tr>`
        ).join('');
    }

    async function reload() {
        skeleton();
        try {
            allRows = await getRows();
        } catch (e) {
            document.getElementById(tbodyId).innerHTML =
                `<tr><td colspan="${colSpan}" class="dt-error"><i class="fa-solid fa-triangle-exclamation"></i>โหลดข้อมูลไม่สำเร็จ: ${escHtmlAdmin(e.message)}</td></tr>`;
            return;
        }
        page = 1;
        apply();
    }

    if (searchInputId) {
        document.getElementById(searchInputId)?.addEventListener('input', () => { page = 1; apply(); });
    }
    if (tableSelector) {
        document.querySelectorAll(`${tableSelector} th.sortable`).forEach(th => {
            th.addEventListener('click', () => {
                if (sortKey === th.dataset.sort) sortDir *= -1; else { sortKey = th.dataset.sort; sortDir = 1; }
                document.querySelectorAll(`${tableSelector} th.sortable`).forEach(t => t.classList.remove('sort-active'));
                th.classList.add('sort-active');
                apply();
            });
        });
    }

    return { reload, apply, getAllRows: () => allRows, getFiltered: () => filtered };
}

/* ════ GATE / AUTH ════ */
let currentAdminEmail = null;

function showGate(id) {
    document.getElementById('gateWrap').classList.remove('hidden');
    document.getElementById('mainApp').classList.add('hidden');
    ['loadingScreen', 'authScreen', 'deniedScreen'].forEach(s => {
        document.getElementById(s).style.display = (s === id) ? 'block' : 'none';
    });
}

async function checkAdminAccess() {
    showGate('loadingScreen');
    try {
        const res = await adminFetch('/admin/me');
        const data = await res.json();
        if (data.isAdmin) {
            currentAdminEmail = data.email;
            document.getElementById('gateWrap').classList.add('hidden');
            document.getElementById('mainApp').classList.remove('hidden');
            navigateTo('dashboard');
        } else {
            document.getElementById('deniedEmail').textContent = data.email || '—';
            showGate('deniedScreen');
        }
    } catch (e) {
        showGate('deniedScreen');
    }
}

document.addEventListener('authStateChanged', (e) => {
    if (e.detail.isAuthenticated) checkAdminAccess();
    else showGate('authScreen');
});

/* ════ APP SHELL: sidebar / mobile drawer / breadcrumb / navigation ════ */
const NAV_ITEMS = [
    { view: 'dashboard', label: 'แดชบอร์ด', icon: 'fa-gauge-high' },
    { view: 'checkin', label: 'เช็คชื่อตามกิจกรรม', icon: 'fa-list-check' },
    { view: 'schedule', label: 'กิจกรรม & พิกัด', icon: 'fa-calendar-days' },
    { view: 'qr', label: 'สแกน QR เช็คชื่อ', icon: 'fa-qrcode' },
    { view: 'roster', label: 'รายชื่อนักศึกษา', icon: 'fa-users' },
    { view: 'tokens', label: 'จัดการ Token Key', icon: 'fa-key' },
    { view: 'admins', label: 'จัดการแอดมิน', icon: 'fa-user-shield' }
];

let currentView = 'dashboard';

function navigateTo(view, opts = {}) {
    if (currentView === 'qr' && view !== 'qr') stopQrScan();
    currentView = view;

    document.querySelectorAll('.nav-item').forEach(b => b.classList.toggle('active', b.dataset.view === view));
    document.querySelectorAll('.view').forEach(v => v.classList.toggle('active', v.id === 'view-' + view));
    const item = NAV_ITEMS.find(n => n.view === view);
    document.getElementById('breadcrumbCurrent').textContent = item ? item.label : view;
    closeMobileSidebar();

    if (view === 'dashboard') loadDashboard();
    if (view === 'checkin') loadCheckinTab();
    if (view === 'schedule') loadScheduleTab();
    if (view === 'roster') loadRosterTab();
    if (view === 'tokens') loadTokensTab();
    if (view === 'admins') loadAdminsTab();

    if (opts.focus) setTimeout(() => document.getElementById(opts.focus)?.focus(), 250);
}

document.querySelectorAll('.nav-item').forEach(btn => btn.addEventListener('click', () => navigateTo(btn.dataset.view)));

function closeMobileSidebar() {
    document.getElementById('sidebar').classList.remove('mobile-open');
    document.getElementById('sidebarOverlay').classList.remove('show');
}
document.getElementById('mobileMenuBtn').addEventListener('click', () => {
    document.getElementById('sidebar').classList.add('mobile-open');
    document.getElementById('sidebarOverlay').classList.add('show');
});
document.getElementById('sidebarCollapseBtn').addEventListener('click', () => {
    document.getElementById('sidebar').classList.toggle('collapsed');
});

/* Quick-jump search (Cmd/Ctrl+K) */
const topbarSearchInput = document.getElementById('topbarSearchInput');
const searchDropdown = document.getElementById('searchDropdown');
topbarSearchInput.addEventListener('input', () => {
    const q = topbarSearchInput.value.trim().toLowerCase();
    if (!q) { searchDropdown.classList.remove('show'); return; }
    const matches = NAV_ITEMS.filter(n => n.label.toLowerCase().includes(q));
    searchDropdown.innerHTML = matches.length
        ? matches.map(m => `<button type="button" data-view="${m.view}"><i class="fa-solid ${m.icon}"></i> ${escHtmlAdmin(m.label)}</button>`).join('')
        : '<div style="padding:12px;color:var(--ink-30);font-size:12.5px">ไม่พบผลลัพธ์</div>';
    searchDropdown.classList.add('show');
});
searchDropdown.addEventListener('click', e => {
    const btn = e.target.closest('button[data-view]');
    if (btn) { navigateTo(btn.dataset.view); topbarSearchInput.value = ''; searchDropdown.classList.remove('show'); }
});
document.addEventListener('click', e => {
    if (!document.getElementById('topbarSearchWrap').contains(e.target)) searchDropdown.classList.remove('show');
});
document.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); topbarSearchInput.focus(); }
});

/* ════ QUICK ACTIONS ════ */
function quickAction(action) {
    if (action === 'addStudent') { navigateTo('roster'); setTimeout(() => document.getElementById('showAddStudentBtn')?.click(), 150); }
    if (action === 'addToken') navigateTo('tokens', { focus: 'trActivity' });
    if (action === 'addSchedule') navigateTo('schedule', { focus: 'schName' });
    if (action === 'exportCheckin') exportCheckinCsv();
}

/* ════════════════════════════════════════
   DASHBOARD
════════════════════════════════════════ */
let lastLogsForChart = [];

async function loadDashboard() {
    document.getElementById('statGrid').innerHTML = Array.from({ length: 4 }, () => '<div class="stat-card"><div class="skeleton skeleton-card"></div></div>').join('');

    try {
        const [statsRes, logsRes] = await Promise.all([adminFetch('/admin/stats'), adminFetch('/admin/checkup/logs')]);
        const stats = await statsRes.json();
        const logs = await logsRes.json();
        lastLogsForChart = logs;
        renderStats(stats);
        renderChart(logs);
        renderRecentActivity(logs.slice(0, 6));
    } catch (e) {
        document.getElementById('statGrid').innerHTML = `<div class="dt-error" style="grid-column:1/-1"><i class="fa-solid fa-triangle-exclamation"></i>โหลดข้อมูลไม่สำเร็จ: ${escHtmlAdmin(e.message)}</div>`;
    }
    checkSystemHealth();
}

function renderStats(s) {
    const cards = [
        { icon: 'fa-users', color: 'blue', value: s.students, label: 'นักศึกษาในระบบ' },
        { icon: 'fa-user-check', color: 'green', value: s.logsToday, label: 'เช็คชื่อวันนี้' },
        { icon: 'fa-key', color: 'amber', value: s.tokenRecords, label: 'Token Key ทั้งหมด' },
        { icon: 'fa-calendar-check', color: 'gray', value: s.activeNow, label: 'กิจกรรมที่เปิดอยู่ตอนนี้' }
    ];
    document.getElementById('statGrid').innerHTML = cards.map(c => `
        <div class="stat-card">
            <div class="stat-card-top"><div class="stat-card-icon ${c.color}"><i class="fa-solid ${c.icon}"></i></div></div>
            <div class="stat-card-value">${c.value}</div>
            <div class="stat-card-label">${c.label}</div>
        </div>`).join('');
}

function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
}

function renderChart(logs) {
    const canvas = document.getElementById('activityChart');
    const wrap = canvas.parentElement;
    const w = wrap.clientWidth, h = wrap.clientHeight;
    if (!w || !h) return;

    const days = [];
    for (let i = 13; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        days.push(d.toISOString().slice(0, 10));
    }
    const counts = days.map(d => logs.filter(l => (l.created_at || '').slice(0, 10) === d).length);

    const dpr = window.devicePixelRatio || 1;
    canvas.width = w * dpr; canvas.height = h * dpr;
    canvas.style.width = w + 'px'; canvas.style.height = h + 'px';
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const max = Math.max(1, ...counts);
    const padBottom = 8, padTop = 6;
    const barW = w / days.length;
    const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#000';

    const bars = [];
    counts.forEach((c, i) => {
        const barH = (c / max) * (h - padBottom - padTop);
        const x = i * barW + barW * 0.22;
        const bw = barW * 0.56;
        const y = h - padBottom - Math.max(barH, 2);
        ctx.fillStyle = accent;
        ctx.globalAlpha = c === 0 ? 0.10 : 0.85;
        roundRect(ctx, x, y, bw, Math.max(barH, 2), 3);
        ctx.fill();
        bars.push({ x, y, w: bw, h: Math.max(barH, 2), date: days[i], count: c });
    });
    ctx.globalAlpha = 1;
    canvas._bars = bars;
}

const activityChartCanvas = document.getElementById('activityChart');
const chartTooltip = document.getElementById('chartTooltip');
activityChartCanvas.addEventListener('mousemove', e => {
    const bars = activityChartCanvas._bars || [];
    const rect = activityChartCanvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const bar = bars.find(b => x >= b.x - 5 && x <= b.x + b.w + 5);
    if (bar) {
        chartTooltip.style.display = 'block';
        chartTooltip.style.left = (bar.x + bar.w / 2) + 'px';
        chartTooltip.style.top = bar.y + 'px';
        chartTooltip.textContent = `${bar.date} · ${bar.count} คน`;
    } else {
        chartTooltip.style.display = 'none';
    }
});
activityChartCanvas.addEventListener('mouseleave', () => chartTooltip.style.display = 'none');

let chartResizeTimer = null;
window.addEventListener('resize', () => {
    clearTimeout(chartResizeTimer);
    chartResizeTimer = setTimeout(() => { if (currentView === 'dashboard') renderChart(lastLogsForChart); }, 200);
});

function renderRecentActivity(logs) {
    const el = document.getElementById('recentActivityList');
    if (!logs.length) { el.innerHTML = '<div class="qr-history-empty">ยังไม่มีการเช็คชื่อ</div>'; return; }
    el.innerHTML = logs.map(l => `
        <div class="activity-row">
            <div class="activity-row-icon ${l.method}"><i class="fa-solid ${l.method === 'qr' ? 'fa-qrcode' : 'fa-location-dot'}"></i></div>
            <div class="activity-row-main">
                <div class="activity-row-name">${escHtmlAdmin(l.name)}</div>
                <div class="activity-row-sub">${escHtmlAdmin(l.student_id)} · ${escHtmlAdmin(l.schedule_name || '-')}</div>
            </div>
            <div class="activity-row-time">${escHtmlAdmin((l.created_at || '').slice(5, 16))}</div>
        </div>`).join('');
}

async function checkSystemHealth() {
    const box = document.getElementById('systemHealthBox');
    const t0 = performance.now();
    try {
        const res = await fetch(`${API_BASE_URL}/checkup/schedule`);
        const ms = Math.round(performance.now() - t0);
        if (!res.ok) throw new Error('HTTP ' + res.status);
        box.innerHTML = `<div style="display:flex;align-items:center;justify-content:space-between">
            <span style="font-size:13px;font-weight:700">Cloudflare Worker API</span>
            <span class="stat-card-badge ok">Online · ${ms}ms</span>
        </div>`;
    } catch (e) {
        box.innerHTML = `<div style="display:flex;align-items:center;justify-content:space-between">
            <span style="font-size:13px;font-weight:700">Cloudflare Worker API</span>
            <span class="stat-card-badge error">Offline</span>
        </div>`;
    }
}

/* ════════════════════════════════════════
   CHECK-IN LOGS
════════════════════════════════════════ */
const checkinTable = createDataTable({
    tableSelector: '#view-checkin table',
    tbodyId: 'checkinTableBody',
    paginationId: 'checkinPagination',
    searchInputId: 'checkinSearchInput',
    searchKeys: ['student_id', 'name', 'schedule_name'],
    colSpan: 6,
    emptyText: 'ไม่มีข้อมูลเช็คชื่อ',
    getRows: async () => {
        const id = document.getElementById('checkinScheduleFilter').value;
        const res = await adminFetch(`/admin/checkup/logs${id ? '?scheduleId=' + encodeURIComponent(id) : ''}`);
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
    },
    renderRow: r => `<tr>
        <td>${escHtmlAdmin(r.created_at)}</td>
        <td>${escHtmlAdmin(r.student_id)}</td>
        <td>${escHtmlAdmin(r.name)}</td>
        <td>${escHtmlAdmin(r.schedule_name || '-')}</td>
        <td><span class="admin-pill ${r.method}">${r.method === 'qr' ? 'QR' : 'GPS'}</span></td>
        <td>${r.distance != null ? r.distance + ' ม.' : '-'}</td>
    </tr>`
});

async function loadCheckinTab() {
    try {
        const res = await adminFetch('/admin/checkup/schedule');
        const schedules = await res.json();
        const sel = document.getElementById('checkinScheduleFilter');
        const prev = sel.value;
        sel.innerHTML = '<option value="">ทุกกิจกรรม</option>' + schedules.map(s => `<option value="${s.id}">${escHtmlAdmin(s.name)}</option>`).join('');
        sel.value = prev;
    } catch (e) { /* filter จะยังใช้ค่าเดิมได้ถ้าดึงไม่สำเร็จ */ }
    await checkinTable.reload();
    document.getElementById('checkinCount').textContent = checkinTable.getFiltered().length;
}

document.getElementById('checkinScheduleFilter').addEventListener('change', () => checkinTable.reload());

async function exportCheckinCsv() {
    navigateTo('checkin');
    const id = document.getElementById('checkinScheduleFilter').value;
    const res = await adminFetch(`/admin/checkup/logs/export.csv${id ? '?scheduleId=' + encodeURIComponent(id) : ''}`);
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'checkin-log.csv';
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
    showToast('ดาวน์โหลด CSV เช็คชื่อสำเร็จ', 'success');
}
document.getElementById('exportCheckinCsvBtn').addEventListener('click', exportCheckinCsv);

/* ════════════════════════════════════════
   SCHEDULE + COORDINATES
════════════════════════════════════════ */
let scheduleEditingId = null;
let scheduleRows = [];

function scheduleRowHtml(r) {
    return `<tr>
        <td>${escHtmlAdmin(r.name)}</td>
        <td>${escHtmlAdmin(r.open_at)}</td>
        <td>${escHtmlAdmin(r.close_at)}</td>
        <td>${r.lat ?? '-'}, ${r.lng ?? '-'}</td>
        <td>${r.radius_m} ม.</td>
        <td>${renderActionsMenu('sch' + r.id, [
            { label: 'แก้ไข', icon: 'fa-pen', onClick: `editSchedule(${r.id})` },
            { label: 'ทำซ้ำ', icon: 'fa-copy', onClick: `duplicateScheduleRow(${r.id})` },
            { label: 'ลบ', icon: 'fa-trash', onClick: `deleteScheduleRow(${r.id})`, danger: true }
        ])}</td>
    </tr>`;
}

async function loadScheduleTab() {
    const tbody = document.getElementById('scheduleTableBody');
    tbody.innerHTML = Array.from({ length: 3 }, () => `<tr class="skeleton-row">${Array.from({ length: 6 }, () => '<td><div class="skeleton skeleton-line" style="width:80%"></div></td>').join('')}</tr>`).join('');
    try {
        const res = await adminFetch('/admin/checkup/schedule');
        scheduleRows = await res.json();
        tbody.innerHTML = scheduleRows.length
            ? scheduleRows.map(scheduleRowHtml).join('')
            : `<tr><td colspan="6" class="dt-empty"><i class="fa-regular fa-calendar"></i>ยังไม่มีกิจกรรม</td></tr>`;
    } catch (e) {
        tbody.innerHTML = `<tr><td colspan="6" class="dt-error"><i class="fa-solid fa-triangle-exclamation"></i>โหลดข้อมูลไม่สำเร็จ: ${escHtmlAdmin(e.message)}</td></tr>`;
    }
}

function editSchedule(id) {
    const row = scheduleRows.find(r => r.id === id);
    if (!row) return;
    scheduleEditingId = id;
    document.getElementById('schName').value = row.name;
    document.getElementById('schOpen').value = row.open_at.replace(' ', 'T');
    document.getElementById('schClose').value = row.close_at.replace(' ', 'T');
    document.getElementById('schLat').value = row.lat ?? '';
    document.getElementById('schLng').value = row.lng ?? '';
    document.getElementById('schRadius').value = row.radius_m;
    document.getElementById('scheduleFormTitle').textContent = 'แก้ไขกิจกรรม';
    document.getElementById('scheduleFormSubmitBtn').textContent = 'บันทึกการแก้ไข';
    document.getElementById('scheduleFormCancelBtn').style.display = 'inline-block';
    document.getElementById('schName').scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function cancelScheduleEdit() {
    scheduleEditingId = null;
    document.getElementById('scheduleForm').reset();
    document.getElementById('schRadius').value = 100;
    document.getElementById('scheduleFormTitle').textContent = 'เพิ่มกิจกรรมใหม่';
    document.getElementById('scheduleFormSubmitBtn').textContent = 'เพิ่มกิจกรรม';
    document.getElementById('scheduleFormCancelBtn').style.display = 'none';
}

async function deleteScheduleRow(id) {
    const ok = await confirmDialog({ title: 'ลบกิจกรรมนี้?', body: 'ประวัติเช็คชื่อที่ผูกกับกิจกรรมนี้จะยังคงอยู่ในระบบ', okText: 'ลบกิจกรรม' });
    if (!ok) return;
    await adminFetch(`/admin/checkup/schedule/${id}`, { method: 'DELETE' });
    showToast('ลบกิจกรรมแล้ว', 'success');
    loadScheduleTab();
}

async function duplicateScheduleRow(id) {
    const res = await adminFetch(`/admin/checkup/schedule/${id}/duplicate`, { method: 'POST' });
    const data = await res.json();
    if (data.status === 'success') {
        showToast('ทำซ้ำกิจกรรมสำเร็จ แก้ไขวันเวลาได้เลย', 'success');
        loadScheduleTab();
    } else {
        showToast(data.error || 'เกิดข้อผิดพลาด', 'error');
    }
}

function useCurrentLocationForSchedule() {
    if (!navigator.geolocation) { showToast('อุปกรณ์นี้ไม่รองรับ GPS', 'error'); return; }
    navigator.geolocation.getCurrentPosition(pos => {
        document.getElementById('schLat').value = pos.coords.latitude.toFixed(7);
        document.getElementById('schLng').value = pos.coords.longitude.toFixed(7);
        showToast('ดึงตำแหน่งปัจจุบันแล้ว', 'success');
    }, () => showToast('ไม่สามารถระบุตำแหน่งปัจจุบันได้', 'error'));
}

document.getElementById('scheduleForm').addEventListener('submit', async e => {
    e.preventDefault();
    const body = {
        name: document.getElementById('schName').value.trim(),
        open_at: document.getElementById('schOpen').value.trim().replace('T', ' '),
        close_at: document.getElementById('schClose').value.trim().replace('T', ' '),
        lat: document.getElementById('schLat').value || null,
        lng: document.getElementById('schLng').value || null,
        radius_m: document.getElementById('schRadius').value || 100
    };
    const path = scheduleEditingId ? `/admin/checkup/schedule/${scheduleEditingId}` : '/admin/checkup/schedule';
    const method = scheduleEditingId ? 'PUT' : 'POST';
    const res = await adminFetch(path, { method, body: JSON.stringify(body) });
    const data = await res.json();
    if (data.status === 'success') {
        showToast(scheduleEditingId ? 'บันทึกการแก้ไขแล้ว' : 'เพิ่มกิจกรรมแล้ว', 'success');
        cancelScheduleEdit();
        loadScheduleTab();
    } else {
        showToast(data.error || 'เกิดข้อผิดพลาด', 'error');
    }
});
document.getElementById('scheduleFormCancelBtn').addEventListener('click', cancelScheduleEdit);

/* ════════════════════════════════════════
   QR SCAN (ต่อเนื่อง)
════════════════════════════════════════ */
let qrStream = null, qrScanning = false, qrProcessing = false, qrSessionCount = 0;
let qrHistory = [];

async function startQrScan() {
    const video = document.getElementById('qrVideo');
    try {
        qrStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
    } catch (e) {
        showToast('ไม่สามารถเข้าถึงกล้องได้: ' + e.message, 'error');
        return;
    }
    video.srcObject = qrStream;
    await video.play();
    qrScanning = true;
    document.getElementById('startScanBtn').style.display = 'none';
    document.getElementById('stopScanBtn').style.display = 'inline-block';
    document.getElementById('qrLiveBadge').style.display = 'flex';
    requestAnimationFrame(scanQrFrame);
}

function stopQrScan() {
    qrScanning = false;
    qrProcessing = false;
    if (qrStream) { qrStream.getTracks().forEach(t => t.stop()); qrStream = null; }
    document.getElementById('startScanBtn').style.display = 'inline-block';
    document.getElementById('stopScanBtn').style.display = 'none';
    document.getElementById('qrLiveBadge').style.display = 'none';
}

function scanQrFrame() {
    if (!qrScanning) return;
    if (!qrProcessing) {
        const video = document.getElementById('qrVideo');
        const canvas = document.getElementById('qrCanvas');
        if (video.readyState === video.HAVE_ENOUGH_DATA) {
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const code = jsQR(imageData.data, imageData.width, imageData.height);
            if (code && code.data) {
                qrProcessing = true;
                submitQrCode(code.data.trim()).finally(() => {
                    setTimeout(() => { qrProcessing = false; }, 1500);
                });
            }
        }
    }
    requestAnimationFrame(scanQrFrame);
}

document.getElementById('startScanBtn').addEventListener('click', startQrScan);
document.getElementById('stopScanBtn').addEventListener('click', stopQrScan);

document.getElementById('qrManualForm').addEventListener('submit', e => {
    e.preventDefault();
    const input = document.getElementById('qrManualInput');
    const val = input.value.trim();
    if (val) submitQrCode(val);
    input.value = '';
});

function flashVideoWrap(ok) {
    const wrap = document.getElementById('qrVideoWrap');
    wrap.classList.remove('flash-success', 'flash-error');
    wrap.classList.add(ok ? 'flash-success' : 'flash-error');
    setTimeout(() => wrap.classList.remove('flash-success', 'flash-error'), 700);
}

function renderQrHistory() {
    const list = document.getElementById('qrHistoryList');
    if (!qrHistory.length) { list.innerHTML = '<div class="qr-history-empty">ยังไม่มีการสแกนในรอบนี้</div>'; return; }
    list.innerHTML = qrHistory.slice(0, 20).map(h => `
        <div class="qr-history-item ${h.ok ? 'success' : 'error'}">
            <i class="fa-solid ${h.ok ? 'fa-circle-check' : 'fa-circle-xmark'} qr-history-icon"></i>
            <div class="qr-history-main">
                <div class="qr-history-name">${escHtmlAdmin(h.title)}</div>
                <div class="qr-history-sub">${escHtmlAdmin(h.sub)}</div>
            </div>
            <div class="qr-history-time">${h.time}</div>
        </div>`).join('');
}

async function submitQrCode(code) {
    const resultBox = document.getElementById('qrResultBox');
    resultBox.innerHTML = '<div class="qr-result-card"><div class="loader-mini"></div> กำลังตรวจสอบ...</div>';
    const time = new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

    try {
        const res = await adminFetch('/admin/checkup/qr/scan', { method: 'POST', body: JSON.stringify({ code }) });
        const data = await res.json();
        if (data.status === 'success') {
            flashVideoWrap(true);
            qrSessionCount++;
            document.getElementById('qrSessionCount').textContent = qrSessionCount;
            resultBox.innerHTML = `<div class="qr-result-card success">
                <i class="fa-solid fa-circle-check" style="color:var(--success);font-size:32px"></i>
                <div class="qr-result-code">${escHtmlAdmin(data.code)}</div>
                <div>${escHtmlAdmin(data.name)} (${escHtmlAdmin(data.studentId)})</div>
                <div style="color:var(--success);font-weight:700;margin-top:6px">เช็คชื่อสำเร็จ</div>
            </div>`;
            qrHistory.unshift({ ok: true, title: data.name, sub: `${data.studentId} · รหัส ${data.code}`, time });
        } else {
            flashVideoWrap(false);
            const message = data.message || data.error || 'ไม่สามารถยืนยันได้';
            resultBox.innerHTML = `<div class="qr-result-card error">
                <i class="fa-solid fa-circle-xmark" style="color:var(--error);font-size:32px"></i>
                <div style="margin-top:8px">${escHtmlAdmin(message)}</div>
            </div>`;
            qrHistory.unshift({ ok: false, title: 'ไม่สำเร็จ', sub: `${message} · รหัส ${code}`, time });
        }
    } catch (e) {
        flashVideoWrap(false);
        resultBox.innerHTML = `<div class="qr-result-card error">เกิดข้อผิดพลาด: ${escHtmlAdmin(e.message)}</div>`;
        qrHistory.unshift({ ok: false, title: 'เกิดข้อผิดพลาด', sub: e.message, time });
    }
    renderQrHistory();
}

/* ════════════════════════════════════════
   STUDENT ROSTER
════════════════════════════════════════ */
const rosterTable = createDataTable({
    tableSelector: '#view-roster table',
    tbodyId: 'rosterTableBody',
    paginationId: 'rosterPagination',
    searchInputId: 'rosterSearchInput',
    searchKeys: ['student_id', 'name'],
    colSpan: 3,
    emptyText: 'ยังไม่มีนักศึกษาในระบบ',
    getRows: async () => {
        const res = await adminFetch('/admin/checkup/students');
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
    },
    renderRow: r => `<tr>
        <td>${escHtmlAdmin(r.student_id)}</td>
        <td>${escHtmlAdmin(r.name)}</td>
        <td>${renderActionsMenu('stu' + r.student_id, [
            { label: 'ลบ', icon: 'fa-trash', onClick: `deleteStudentRow('${r.student_id.replace(/'/g, "\\'")}')`, danger: true }
        ])}</td>
    </tr>`
});

function loadRosterTab() { rosterTable.reload(); }

document.getElementById('showAddStudentBtn').addEventListener('click', () => {
    document.getElementById('addStudentCard').style.display = 'block';
    document.getElementById('newStudentId').focus();
});
document.getElementById('cancelAddStudentBtn').addEventListener('click', () => {
    document.getElementById('addStudentCard').style.display = 'none';
    document.getElementById('addStudentForm').reset();
});

document.getElementById('addStudentForm').addEventListener('submit', async e => {
    e.preventDefault();
    const studentId = document.getElementById('newStudentId').value.trim();
    const name = document.getElementById('newStudentName').value.trim();
    const res = await adminFetch('/admin/checkup/students', { method: 'POST', body: JSON.stringify({ studentId, name }) });
    const data = await res.json();
    if (data.status === 'success') {
        showToast('เพิ่มนักศึกษาแล้ว', 'success');
        document.getElementById('addStudentForm').reset();
        document.getElementById('addStudentCard').style.display = 'none';
        rosterTable.reload();
    } else {
        showToast(data.error || 'เกิดข้อผิดพลาด', 'error');
    }
});

async function deleteStudentRow(studentId) {
    const ok = await confirmDialog({ title: 'ลบนักศึกษาคนนี้?', body: `รหัสนักศึกษา ${studentId} จะไม่สามารถเช็คชื่อได้อีกจนกว่าจะเพิ่มกลับ`, okText: 'ลบ' });
    if (!ok) return;
    await adminFetch(`/admin/checkup/students/${encodeURIComponent(studentId)}`, { method: 'DELETE' });
    showToast('ลบนักศึกษาแล้ว', 'success');
    rosterTable.reload();
}

/* ════════════════════════════════════════
   TOKEN KEY
════════════════════════════════════════ */
const MAX_TOKEN_PAIRS = 5;
let trSelected = new Set();

async function loadTokensTab() {
    try {
        const res = await fetch(`${API_BASE_URL}/tokens?action=getActivities`);
        const activities = await res.json();
        document.getElementById('activityDatalist').innerHTML = activities.map(a => `<option value="${escHtmlAdmin(a)}">`).join('');
    } catch (e) { /* ไม่ critical ถ้าโหลด datalist ไม่สำเร็จ */ }

    if (!document.getElementById('trPairsWrap').children.length) {
        document.getElementById('trPairsWrap').innerHTML = Array.from({ length: MAX_TOKEN_PAIRS }, (_, i) => `
            <div class="admin-row">
                <span style="width:60px;color:var(--ink-50);font-size:12.5px">คู่ที่ ${i + 1}</span>
                <input class="admin-input" id="trCode${i + 1}" placeholder="รหัสกิจกรรม">
                <input class="admin-input" id="trToken${i + 1}" placeholder="Token Key">
            </div>`).join('');
    }
}

/* ── CSV import (dropzone) ── */
const csvDropzone = document.getElementById('csvDropzone');
const csvFileInput = document.getElementById('csvFile');
let selectedCsvFile = null;

function setCsvFile(file) {
    selectedCsvFile = file;
    document.getElementById('importCsvBtn').disabled = !file;
    if (file) {
        csvDropzone.innerHTML = `<i class="fa-solid fa-file-csv"></i>${escHtmlAdmin(file.name)} <span style="color:var(--ink-30)">(คลิกเพื่อเปลี่ยนไฟล์)</span>`;
    } else {
        csvDropzone.innerHTML = `<i class="fa-solid fa-file-arrow-up"></i>ลากไฟล์ CSV มาวางที่นี่ หรือคลิกเพื่อเลือกไฟล์`;
    }
}

csvDropzone.addEventListener('click', () => csvFileInput.click());
csvFileInput.addEventListener('change', () => setCsvFile(csvFileInput.files[0] || null));
csvDropzone.addEventListener('dragover', e => { e.preventDefault(); csvDropzone.classList.add('dragover'); });
csvDropzone.addEventListener('dragleave', () => csvDropzone.classList.remove('dragover'));
csvDropzone.addEventListener('drop', e => {
    e.preventDefault();
    csvDropzone.classList.remove('dragover');
    const file = e.dataTransfer.files[0];
    if (file) setCsvFile(file);
});

document.getElementById('downloadTemplateBtn').addEventListener('click', async () => {
    const res = await adminFetch('/admin/tokens/template.csv');
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'token-template.csv';
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
});

document.getElementById('importCsvBtn').addEventListener('click', async () => {
    const msg = document.getElementById('importResultMsg');
    msg.className = 'admin-msg';
    if (!selectedCsvFile) { showToast('กรุณาเลือกไฟล์ CSV', 'error'); return; }

    const text = await selectedCsvFile.text();
    const mode = document.getElementById('csvReplaceMode').checked ? 'replace' : 'append';
    const btn = document.getElementById('importCsvBtn');
    btn.disabled = true;
    btn.innerHTML = '<div class="loader-mini"></div> กำลังนำเข้า...';
    try {
        const res = await adminFetch('/admin/tokens/import', { method: 'POST', body: JSON.stringify({ csv: text, mode }) });
        const data = await res.json();
        if (data.status === 'success') {
            msg.className = 'admin-msg success show';
            msg.textContent = `นำเข้าสำเร็จ: กิจกรรม ${data.insertedActivities} รายการ, ข้อมูล ${data.insertedRecords} แถว (ข้าม ${data.skipped} แถว)` +
                (data.errors?.length ? ' — ' + data.errors.slice(0, 5).join('; ') : '');
            showToast('นำเข้า Token Key สำเร็จ', 'success');
            setCsvFile(null); csvFileInput.value = '';
            loadTokensTab();
        } else {
            msg.className = 'admin-msg error show';
            msg.textContent = data.error || 'เกิดข้อผิดพลาด';
        }
    } catch (e) {
        msg.className = 'admin-msg error show';
        msg.textContent = 'เกิดข้อผิดพลาด: ' + e.message;
    } finally {
        btn.disabled = !selectedCsvFile;
        btn.textContent = 'นำเข้าข้อมูล';
    }
});

/* ── Manual entry ── */
document.getElementById('tokenRecordForm').addEventListener('submit', async e => {
    e.preventDefault();
    const msg = document.getElementById('tokenRecordMsg');
    msg.className = 'admin-msg';

    const activityName = document.getElementById('trActivity').value.trim();
    const studentId = document.getElementById('trStudentId').value.trim();
    const studentName = document.getElementById('trStudentName').value.trim();
    const studentGroup = document.getElementById('trStudentGroup').value.trim();
    const pairs = [];
    for (let i = 1; i <= MAX_TOKEN_PAIRS; i++) {
        const code = document.getElementById(`trCode${i}`).value.trim();
        const token = document.getElementById(`trToken${i}`).value.trim();
        if (code || token) pairs.push({ code, token });
    }

    if (!activityName || !studentId) { showToast('กรุณากรอกชื่อกิจกรรมและรหัสนักศึกษา', 'error'); return; }
    if (!pairs.length) { showToast('กรุณากรอกรหัสหรือ Token อย่างน้อย 1 คู่', 'error'); return; }

    try {
        const res = await adminFetch('/admin/tokens/records', {
            method: 'POST',
            body: JSON.stringify({ activityName, studentId, studentName, studentGroup, pairs })
        });
        const data = await res.json();
        if (data.status === 'success') {
            msg.className = 'admin-msg success show';
            msg.textContent = `เพิ่มข้อมูลสำเร็จ ${data.inserted} รายการ`;
            showToast('เพิ่ม Token Key แล้ว', 'success');
            document.getElementById('tokenRecordForm').reset();
            loadTokensTab();
        } else {
            msg.className = 'admin-msg error show';
            msg.textContent = data.error || 'เกิดข้อผิดพลาด';
        }
    } catch (e) {
        msg.className = 'admin-msg error show';
        msg.textContent = 'เกิดข้อผิดพลาด: ' + e.message;
    }
});

/* ── Browse / bulk delete ── */
const tokenRecordsTable = createDataTable({
    tableSelector: '#view-tokens .admin-card:last-child table',
    tbodyId: 'trRecordsBody',
    paginationId: 'trPagination',
    searchInputId: null,
    searchKeys: [],
    colSpan: 7,
    emptyText: 'พิมพ์ชื่อกิจกรรมแล้วกดค้นหา',
    getRows: async () => [],
    renderRow: r => `<tr>
        <td class="dt-checkbox"><input type="checkbox" class="tr-row-check" data-id="${r.id}" ${trSelected.has(r.id) ? 'checked' : ''}></td>
        <td>${escHtmlAdmin(r.student_id)}</td>
        <td>${escHtmlAdmin(r.student_name || '-')}</td>
        <td>${escHtmlAdmin(r.student_group || '-')}</td>
        <td>${escHtmlAdmin(r.code || '-')}</td>
        <td>${escHtmlAdmin(r.token || '-')}</td>
        <td><button class="admin-btn danger sm" onclick="deleteTokenRecordRow(${r.id})"><i class="fa-solid fa-trash"></i></button></td>
    </tr>`
});

function updateTrBulkBar() {
    const bar = document.getElementById('trBulkBar');
    bar.classList.toggle('show', trSelected.size > 0);
    document.getElementById('trBulkCount').textContent = `เลือก ${trSelected.size} รายการ`;
}

document.getElementById('trRecordsBody').addEventListener('change', e => {
    if (e.target.classList.contains('tr-row-check')) {
        const id = Number(e.target.dataset.id);
        if (e.target.checked) trSelected.add(id); else trSelected.delete(id);
        updateTrBulkBar();
    }
});

document.getElementById('trSelectAll').addEventListener('change', e => {
    const ids = tokenRecordsTable.getFiltered().map(r => r.id);
    if (e.target.checked) ids.forEach(id => trSelected.add(id));
    else ids.forEach(id => trSelected.delete(id));
    tokenRecordsTable.apply();
    updateTrBulkBar();
});

async function searchTokenRecords() {
    const activity = document.getElementById('trSearchActivity').value.trim();
    trSelected = new Set();
    updateTrBulkBar();
    if (!activity) {
        document.getElementById('trRecordsBody').innerHTML = `<tr><td colspan="7" class="dt-empty"><i class="fa-regular fa-folder-open"></i>พิมพ์ชื่อกิจกรรมแล้วกดค้นหา</td></tr>`;
        return;
    }
    tokenRecordsTable.getRows = async () => {
        const res = await adminFetch(`/admin/tokens/records?activity=${encodeURIComponent(activity)}`);
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
    };
    await tokenRecordsTable.reload();
}
document.getElementById('trSearchBtn').addEventListener('click', searchTokenRecords);
document.getElementById('trSearchActivity').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); searchTokenRecords(); } });

async function deleteTokenRecordRow(id) {
    const ok = await confirmDialog({ title: 'ลบรายการนี้?', okText: 'ลบ' });
    if (!ok) return;
    await adminFetch(`/admin/tokens/records/${id}`, { method: 'DELETE' });
    showToast('ลบรายการแล้ว', 'success');
    trSelected.delete(id);
    updateTrBulkBar();
    searchTokenRecords();
}

document.getElementById('trBulkDeleteBtn').addEventListener('click', async () => {
    const ids = [...trSelected];
    if (!ids.length) return;
    const ok = await confirmDialog({ title: `ลบ ${ids.length} รายการที่เลือก?`, okText: 'ลบทั้งหมด' });
    if (!ok) return;
    await Promise.all(ids.map(id => adminFetch(`/admin/tokens/records/${id}`, { method: 'DELETE' })));
    showToast(`ลบ ${ids.length} รายการแล้ว`, 'success');
    trSelected = new Set();
    updateTrBulkBar();
    searchTokenRecords();
});

/* ════════════════════════════════════════
   ADMIN EMAIL MANAGEMENT
════════════════════════════════════════ */
const adminsTable = createDataTable({
    tableSelector: '#view-admins table',
    tbodyId: 'adminListBody',
    paginationId: null,
    searchInputId: null,
    searchKeys: [],
    colSpan: 3,
    emptyText: 'ยังไม่มีแอดมิน',
    getRows: async () => {
        const res = await adminFetch('/admin/admins');
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
    },
    renderRow: r => `<tr>
        <td>${escHtmlAdmin(r.email)}</td>
        <td>${escHtmlAdmin(r.created_at)}</td>
        <td>${r.email === currentAdminEmail
            ? '<span style="color:var(--ink-30);font-size:12px">คุณ</span>'
            : `<button class="admin-btn danger sm" onclick="removeAdminRow('${r.email.replace(/'/g, "\\'")}')"><i class="fa-solid fa-trash"></i></button>`}</td>
    </tr>`
});

function loadAdminsTab() { adminsTable.reload(); }

async function removeAdminRow(email) {
    const ok = await confirmDialog({ title: 'ลบสิทธิ์แอดมิน?', body: email, okText: 'ลบสิทธิ์' });
    if (!ok) return;
    await adminFetch(`/admin/admins/${encodeURIComponent(email)}`, { method: 'DELETE' });
    showToast('ลบสิทธิ์แอดมินแล้ว', 'success');
    adminsTable.reload();
}

document.getElementById('addAdminForm').addEventListener('submit', async e => {
    e.preventDefault();
    const input = document.getElementById('newAdminEmail');
    const email = input.value.trim();
    if (!email) return;
    const res = await adminFetch('/admin/admins', { method: 'POST', body: JSON.stringify({ email }) });
    const data = await res.json();
    if (data.status === 'success') {
        showToast('เพิ่มแอดมินแล้ว', 'success');
        input.value = '';
        adminsTable.reload();
    } else {
        showToast(data.error || 'เกิดข้อผิดพลาด', 'error');
    }
});

document.addEventListener('DOMContentLoaded', () => { initAuth(); });
