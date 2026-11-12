// ฝ่ายบุคคล — students pick a department (Google sign-in, university email); admins manage roster + quotas.
const API = window.CAMPS_API || 'https://engedlru-api.stnetworld.workers.dev';
const AUTH_DOMAIN = 'auth.litalkeducation.com', CLIENT_ID = 'PGqozL94LzOwstm4pD39W5kvalYRiK7w';
const HR_URL = location.origin + '/hr/';          // Auth0 callback + logout URL must include https://<host>/hr/
const CONNECTION = 'google-oauth2';
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const YEARS = [1, 2, 3, 4];
const ICON = {
  direction: '<path d="M4 22V3M4 4h14l-2 4 2 4H4"/>',
  structure: '<rect x="3" y="3" width="14" height="6" rx="1.5"/><path d="M17 6h3v5H12v3"/><rect x="10" y="14" width="4" height="7" rx="1"/>',
  community: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6"/><circle cx="17.5" cy="9" r="2.5"/><path d="M17 14c2.8.2 4.5 2.1 4.5 5"/>',
  teaching: '<path d="M2 4h7a3 3 0 0 1 3 3v13a2 2 0 0 0-2-2H2zM22 4h-7a3 3 0 0 0-3 3v13a2 2 0 0 1 2-2h8z"/>',
  welfare: '<path d="M5 3v8a2 2 0 0 0 2 2 2 2 0 0 0 2-2V3M7 3v18M17 21V3c-2.5 1.5-4 4.5-4 8h4"/>'
};
const TONE = { direction: 't1', structure: 't2', community: 't3', teaching: 't4', welfare: 't5' };
const svg = (p) => '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + p + '</svg>';
const STATE_TEXT = {
  pending: ['เร็วๆ นี้', 'ค่ายของเรามีทั้งหมด 5 ฝ่าย ดูหน้าที่ของแต่ละฝ่ายไว้ก่อน แล้วรอเลือกฝ่ายที่ใช่ในระบบที่กำลังจะเปิด'],
  open: ['เปิดรับสมัคร', 'เข้าสู่ระบบด้วยอีเมลมหาวิทยาลัยแล้วเลือกฝ่ายที่คุณสนใจ ดูจำนวนที่ว่างของชั้นปีคุณได้ทันที'],
  closed: ['ปิดรับสมัครแล้ว', 'ปิดรับการเลือกฝ่ายแล้ว ยังดูรายละเอียดของแต่ละฝ่ายได้ตามปกติ']
};

let auth0Client = null, me = null, deps = [], state = 'pending', authReady = false, adminData = null, tab = 'overview';
const withTimeout = (p, ms, msg) => Promise.race([p, new Promise((_, no) => setTimeout(() => no(new Error(msg)), ms))]);

// ---------- ui helpers ----------
let toastT;
function toast(msg, err) { const t = $('toast'); t.textContent = msg; t.className = (err ? 'err ' : '') + 'show'; clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 3400); }
function confirmDlg(title, text, okLabel) {
  return new Promise((resolve) => {
    const d = document.createElement('div'); d.className = 'dlg';
    d.innerHTML = '<div class="box" role="dialog" aria-modal="true"><h3>' + esc(title) + '</h3><p>' + esc(text) + '</p><div class="btns"><button class="btn" data-r="0">ยกเลิก</button><button class="btn primary" data-r="1">' + esc(okLabel || 'ยืนยัน') + '</button></div></div>';
    d.addEventListener('click', (e) => { const r = e.target.closest('[data-r]'); if (r || e.target === d) { d.remove(); resolve(!!r && r.dataset.r === '1'); } });
    document.body.appendChild(d); d.querySelector('[data-r="1"]').focus();
  });
}
const failBox = (msg, retry) => '<div class="failbox"><b>โหลดข้อมูลไม่สำเร็จ</b><p>' + esc(msg) + '</p><button class="btn primary sm" onclick="' + retry + '">ลองใหม่</button></div>';
async function errMsg(r) { try { const d = await r.json(); return d.error || ('เกิดข้อผิดพลาด (' + r.status + ')'); } catch (e) { return 'เกิดข้อผิดพลาด (' + r.status + ')'; } }
const gBtn = (label, fn) => '<button class="gbtn" onclick="' + fn + '">' + $('gicon').innerHTML + '<span>' + label + '</span></button>';

// ---------- api ----------
async function pub(path) { return fetch(API + path); }
async function api(path, opt = {}) {
  const go = async (fresh) => {
    const t = await auth0Client.getTokenSilently(fresh ? { cacheMode: 'off' } : undefined);
    return fetch(API + path, { ...opt, headers: { ...(opt.headers || {}), Authorization: 'Bearer ' + t } });
  };
  let r = await go(false);
  if (r.status === 401) { try { r = await go(true); } catch (e) { /* fall through */ } }
  return r;
}
const post = (path, body) => api(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) });

// ---------- auth ----------
async function initAuth() {
  try {
    if (!window.auth0) throw new Error('โหลดระบบเข้าสู่ระบบไม่สำเร็จ');
    auth0Client = await withTimeout(auth0.createAuth0Client({ domain: AUTH_DOMAIN, clientId: CLIENT_ID, cacheLocation: 'localstorage', useRefreshTokens: true, authorizationParams: { redirect_uri: HR_URL } }), 12000, 'เชื่อมต่อระบบเข้าสู่ระบบไม่ทัน');
    if (location.search.includes('code=') || location.search.includes('error=')) {
      await withTimeout(auth0Client.handleRedirectCallback(), 12000, 'ยืนยันการเข้าสู่ระบบไม่ทัน');
      history.replaceState({}, document.title, HR_URL);
    }
    authReady = true;
    return await auth0Client.isAuthenticated();
  } catch (e) { console.error(e); authReady = false; renderAcct({ error: e.message }); return null; }
}
async function login() {
  const btns = document.querySelectorAll('.gbtn'); btns.forEach((b) => b.disabled = true);
  try {
    const ap = { connection: CONNECTION };
    try { if (sessionStorage.getItem('chooseGoogle')) { ap.prompt = 'select_account'; sessionStorage.removeItem('chooseGoogle'); } } catch (e) { /* ignore */ }
    await auth0Client.loginWithRedirect({ authorizationParams: ap });
  } catch (e) { btns.forEach((b) => b.disabled = false); toast(e.message || 'เข้าสู่ระบบไม่สำเร็จ', true); }
}
async function logout() { await auth0Client.logout({ logoutParams: { returnTo: HR_URL } }); }
async function switchAccount() { try { sessionStorage.setItem('chooseGoogle', '1'); } catch (e) { /* ignore */ } await logout(); }

// ---------- account card ----------
const REASONS = {
  not_university_email: (m) => 'บัญชี Google นี้ (' + esc(m.email) + ') ไม่ใช่อีเมลมหาวิทยาลัย กรุณาเข้าสู่ระบบด้วยอีเมล @lru.ac.th เช่น sb6740102220@lru.ac.th',
  email_not_verified: (m) => 'อีเมล ' + esc(m.email) + ' ยังไม่ได้รับการยืนยันจาก Google',
  not_in_roster: (m) => 'ไม่พบรหัสนักศึกษา ' + esc(m.studentId || '') + ' ในรายชื่อของค่าย กรุณาติดต่อผู้ดูแลเพื่อให้เพิ่มรหัสและชั้นปีของคุณ'
};
function renderAcct(x) {
  const box = $('acct');
  if (x && x.error) { box.innerHTML = '<div class="warn">' + esc(x.error) + '</div><button class="btn primary sm" onclick="location.reload()">ลองใหม่</button>'; return; }
  if (!me) {
    box.innerHTML = '<h2>เข้าสู่ระบบเพื่อเลือกฝ่าย</h2><p class="meta">ใช้อีเมลมหาวิทยาลัย (@lru.ac.th) เช่น sb6740102220@lru.ac.th ระบบจะอ่านรหัสนักศึกษาจากอีเมลให้เอง</p>' + gBtn('เข้าสู่ระบบด้วย Google', 'login()');
    return;
  }
  const adminPill = me.isAdmin ? ' <span class="pill admin">ผู้ดูแล</span>' : '';
  if (me.reason) {
    const warn = me.isAdmin && me.reason !== 'not_in_roster' ? '' : '<div class="warn">' + REASONS[me.reason](me) + '</div>';
    box.innerHTML = '<div class="row"><div class="avatar">' + esc((me.googleName || me.email || '?').trim()[0].toUpperCase()) + '</div><div><h2>' + esc(me.googleName || me.email) + adminPill + '</h2><div class="meta">' + esc(me.email) + '</div></div></div>' + warn
      + '<div class="act" style="display:flex;gap:8px;flex-wrap:wrap">' + (me.isAdmin ? '' : '<button class="btn primary sm" onclick="switchAccount()">ใช้บัญชี Google อื่น</button>') + '<button class="btn sm" onclick="logout()">ออกจากระบบ</button></div>';
    return;
  }
  const st = me.student, selDep = me.selection && deps.find((d) => d.code === me.selection.department_code);
  box.innerHTML = '<div class="row"><div class="avatar">' + esc((st.name || '?').trim()[0].toUpperCase()) + '</div><div><h2>' + esc(st.name) + adminPill + '</h2><div class="meta">รหัสนักศึกษา ' + esc(st.student_id) + ' · ชั้นปี ' + st.year + '</div></div></div>'
    + '<div class="sel">' + (selDep ? 'ฝ่ายที่เลือก: <b>' + esc(selDep.name) + '</b>' : 'ยังไม่ได้เลือกฝ่าย') + '</div>'
    + '<div><button class="btn sm" onclick="logout()">ออกจากระบบ</button></div>';
}

// ---------- departments ----------
function renderState() {
  const [chip, text] = STATE_TEXT[state] || STATE_TEXT.pending;
  const c = $('stateChip'); c.textContent = chip; c.className = 'state-chip ' + state; $('heroText').textContent = text;
}
function deptCard(d) {
  const st = me && me.student, mine = st ? st.year : 0, selected = me && me.selection && me.selection.department_code === d.code;
  const yrs = YEARS.map((y) => {
    const rem = d.remaining[y], q = d.quota[y];
    return '<div class="yr' + (y === mine ? ' mine' : '') + (q > 0 && rem === 0 ? ' full' : '') + '">ปี ' + y + (y === mine ? ' (คุณ)' : '') + '<b>' + (q ? rem : '–') + '</b>' + (q ? 'เหลือ / ' + q : 'ยังไม่เปิดรับ') + '</div>';
  }).join('');
  let act = '';
  if (st) {
    const rem = d.remaining[mine], q = d.quota[mine];
    if (selected) act = '<span class="chosen">✓ คุณเลือกฝ่ายนี้</span>' + (state === 'open' ? '<button class="btn ghost" onclick="unselect()">ยกเลิกการเลือก</button>' : '');
    else if (state !== 'open') act = '<button class="btn" disabled>' + (state === 'pending' ? 'ยังไม่เปิดรับ' : 'ปิดรับแล้ว') + '</button>';
    else if (!q) act = '<button class="btn" disabled>ไม่เปิดรับชั้นปี ' + mine + '</button>';
    else if (!rem) act = '<button class="btn" disabled>เต็มแล้ว</button>';
    else act = '<button class="btn primary" onclick="choose(\'' + d.code + '\')">' + (me.selection ? 'เปลี่ยนมาฝ่ายนี้' : 'เลือกฝ่ายนี้') + '</button>';
  }
  return '<div class="dept ' + (TONE[d.code] || '') + (selected ? ' mine' : '') + '"><div class="top"><div class="icon">' + svg(ICON[d.code] || ICON.direction) + '</div><div><h3>' + esc(d.name) + '</h3><p>' + esc(d.description) + '</p></div></div><div class="yrs">' + yrs + '</div>' + (act ? '<div class="act">' + act + '</div>' : '') + '</div>';
}
function renderDepts() { $('depts').innerHTML = deps.map(deptCard).join(''); }
async function loadDepartments(quiet) {
  let r;
  try { r = await pub('/camps/departments'); } catch (e) { if (!deps.length) $('depts').innerHTML = failBox('เชื่อมต่อเซิร์ฟเวอร์ไม่ได้', 'loadDepartments()'); return; }
  if (!r.ok) { if (!deps.length) $('depts').innerHTML = failBox(await errMsg(r), 'loadDepartments()'); return; }
  const d = await r.json(); deps = d.departments || []; state = d.registration || 'pending';
  renderState(); renderDepts(); if (me) renderAcct();
}
async function loadMe() {
  let r;
  try { r = await api('/camps/me'); } catch (e) { renderAcct({ error: 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้' }); return; }
  if (r.status === 401) { me = null; renderAcct(); return; }
  if (!r.ok) { renderAcct({ error: await errMsg(r) }); return; }
  me = await r.json(); state = me.registration || state; renderState(); renderAcct(); renderDepts(); renderAdmin();
}
async function choose(code) {
  const d = deps.find((x) => x.code === code), cur = me.selection && deps.find((x) => x.code === me.selection.department_code);
  const ok = await confirmDlg(cur ? 'เปลี่ยนฝ่าย?' : 'ยืนยันเลือกฝ่าย?', cur ? 'เปลี่ยนจาก ' + cur.name + ' เป็น ' + d.name + ' (ที่นั่งเดิมจะถูกคืน)' : 'คุณจะเลือก ' + d.name + ' (ชั้นปี ' + me.student.year + ') เปลี่ยนฝ่ายได้ตลอดช่วงที่เปิดรับ', cur ? 'เปลี่ยนฝ่าย' : 'ยืนยัน');
  if (!ok) return;
  const r = await post('/camps/select', { departmentCode: code });
  if (!r.ok) toast(await errMsg(r), true); else toast('เลือก' + d.name + 'เรียบร้อยแล้ว');
  await Promise.all([loadDepartments(), loadMe()]);
}
async function unselect() {
  if (!(await confirmDlg('ยกเลิกการเลือกฝ่าย?', 'ที่นั่งของคุณจะถูกคืนให้คนอื่น', 'ยกเลิกการเลือก'))) return;
  const r = await post('/camps/unselect');
  if (!r.ok) toast(await errMsg(r), true); else toast('ยกเลิกการเลือกแล้ว');
  await Promise.all([loadDepartments(), loadMe()]);
}

// ---------- admin ----------
const TABS = [['overview', 'ภาพรวม'], ['quota', 'โควตา'], ['students', 'นักศึกษา'], ['settings', 'ตั้งค่า']];
function renderAdmin() {
  const box = $('adminBox');
  if (!me || !me.isAdmin) { box.classList.add('hidden'); return; }
  box.classList.remove('hidden');
  box.innerHTML = '<h2 class="sec-title">จัดการระบบ <em>ผู้ดูแล</em></h2><div class="tabs" role="tablist">' + TABS.map(([k, l]) => '<button class="' + (tab === k ? 'on' : '') + '" onclick="setTab(\'' + k + '\')">' + l + '</button>').join('') + '</div><div id="adminBody"><div class="skeleton"></div></div>';
  loadAdminTab();
}
function setTab(k) { tab = k; renderAdmin(); }
async function loadAdminTab() {
  const body = $('adminBody');
  if (tab === 'students') return loadStudents();
  let r;
  try { r = await api('/camps/admin/overview'); } catch (e) { body.innerHTML = failBox('เชื่อมต่อเซิร์ฟเวอร์ไม่ได้', 'loadAdminTab()'); return; }
  if (!r.ok) { body.innerHTML = failBox(await errMsg(r), 'loadAdminTab()'); return; }
  adminData = await r.json();
  if (tab === 'overview') renderOverview(); else if (tab === 'quota') renderQuota(); else renderSettings();
}
function renderOverview() {
  const a = adminData, rosterTotal = YEARS.reduce((s, y) => s + (a.students[y] || 0), 0);
  const rows = a.departments.map((d) => '<tr><td><b>' + esc(d.name) + '</b></td>' + YEARS.map((y) => { const q = d.quota[y], f = d.filled[y]; return '<td class="' + (q > 0 && f >= q ? 'full' : '') + '">' + f + '/' + q + '</td>'; }).join('') + '<td>' + YEARS.reduce((s, y) => s + d.filled[y], 0) + '/' + YEARS.reduce((s, y) => s + d.quota[y], 0) + '</td></tr>').join('');
  $('adminBody').innerHTML = '<div class="panel"><h3>จำนวนที่เลือกแล้ว / โควตา</h3><div class="tbl-wrap"><table><thead><tr><th>ฝ่าย</th>' + YEARS.map((y) => '<th>ปี ' + y + '</th>').join('') + '<th>รวม</th></tr></thead><tbody>' + rows + '</tbody></table></div></div>'
    + '<div class="panel"><h3>นักศึกษาในรายชื่อ</h3><p class="muted">' + YEARS.map((y) => 'ปี ' + y + ': <b>' + (a.students[y] || 0) + '</b>').join(' · ') + ' · รวม <b>' + rosterTotal + '</b> คน · เลือกฝ่ายแล้ว <b>' + a.selectedTotal + '</b> คน (ยังไม่เลือก ' + Math.max(0, rosterTotal - a.selectedTotal) + ')</p><div style="margin-top:12px"><button class="btn sm" onclick="exportCsv()">ดาวน์โหลด CSV (รายชื่อ + ฝ่าย)</button></div></div>';
}
function renderQuota() {
  $('adminBody').innerHTML = '<p class="muted" style="margin:0 4px 10px">กำหนดจำนวนที่รับของแต่ละฝ่ายแยกตามชั้นปี (0 = ไม่เปิดรับชั้นปีนั้น) ตั้งต่ำกว่าจำนวนที่มีคนเลือกแล้วไม่ได้</p>' + adminData.departments.map((d) =>
    '<div class="panel"><h3>' + esc(d.name) + '</h3><div class="qgrid">' + YEARS.map((y) => '<label>ปี ' + y + '<input type="number" inputmode="numeric" min="0" max="9999" id="q-' + d.code + '-' + y + '" value="' + d.quota[y] + '"><span>เลือกแล้ว ' + d.filled[y] + '</span></label>').join('') + '</div><button class="btn primary sm" onclick="saveQuota(\'' + d.code + '\')">บันทึกโควตา</button></div>').join('');
}
async function saveQuota(code) {
  const quotas = {}; for (const y of YEARS) quotas[y] = Number($('q-' + code + '-' + y).value);
  const btn = document.querySelector('button[onclick="saveQuota(\'' + code + '\')"]'); if (btn) btn.disabled = true;
  try {
    const r = await post('/camps/admin/quota', { departmentCode: code, quotas });
    if (!r.ok) return toast(await errMsg(r), true);
    // Update just this department so unsaved edits in the other cards are not thrown away.
    const d = adminData.departments.find((x) => x.code === code); if (d) for (const y of YEARS) d.quota[y] = quotas[y];
    toast('บันทึกโควตาแล้ว'); loadDepartments();
  } finally { if (btn) btn.disabled = false; }
}
function renderSettings() {
  const s = adminData.registration;
  const opts = [['pending', 'เร็วๆ นี้'], ['open', 'เปิดรับ'], ['closed', 'ปิดรับ']];
  $('adminBody').innerHTML = '<div class="panel"><h3>สถานะการเลือกฝ่าย</h3><div class="seg">' + opts.map(([k, l]) => '<button class="' + (s === k ? 'on' : '') + '" onclick="setState(\'' + k + '\')">' + l + '</button>').join('') + '</div><p class="muted" style="margin-top:10px">เร็วๆ นี้ = แสดงป้ายยังไม่เปิด · เปิดรับ = นักศึกษาเลือก/เปลี่ยนฝ่ายได้ · ปิดรับ = ล็อกการเลือกทั้งหมด (ผู้ดูแลยังล้างการเลือกรายคนได้)</p></div>';
}
async function setState(k) {
  if (k === adminData.registration) return;
  if (k === 'open' && !(await confirmDlg('เปิดรับการเลือกฝ่าย?', 'นักศึกษาในรายชื่อจะเริ่มเลือกฝ่ายได้ทันที ตรวจสอบรายชื่อและโควตาให้เรียบร้อยก่อน', 'เปิดรับ'))) return;
  if (k === 'closed' && !(await confirmDlg('ปิดรับการเลือกฝ่าย?', 'นักศึกษาจะเลือกหรือเปลี่ยนฝ่ายไม่ได้อีก', 'ปิดรับ'))) return;
  const r = await post('/camps/admin/state', { registration: k });
  if (!r.ok) return toast(await errMsg(r), true);
  toast('อัปเดตสถานะแล้ว'); await Promise.all([loadAdminTab(), loadDepartments()]);
}
// students
let stQuery = '', stYear = '', stTimer;
function suggestYear(id) {
  const m = /^(\d{2})/.exec(String(id).replace(/^[a-z]{2}/i, '')); if (!m) return '';
  const d = new Date(), be = d.getFullYear() + 543, ac = be - (d.getMonth() < 5 ? 1 : 0), y = ac - (2500 + Number(m[1])) + 1;
  return y >= 1 && y <= 4 ? String(y) : '';
}
async function loadStudents() {
  const body = $('adminBody');
  if (!$('stForm')) {
    body.innerHTML = '<div class="panel"><h3>เพิ่ม / แก้ไขนักศึกษา</h3><form id="stForm" class="form cols"><label>รหัสนักศึกษา<input id="stId" required inputmode="numeric" placeholder="6740102220"></label><label>ชื่อ-นามสกุล<input id="stName" required maxlength="200" placeholder="ชื่อ นามสกุล"></label><label>ชั้นปี<select id="stYr" required><option value="">เลือก</option>' + YEARS.map((y) => '<option value="' + y + '">' + y + '</option>').join('') + '</select></label><button class="btn primary" type="submit">บันทึก</button></form><div class="muted" id="stHint" style="margin-top:6px">พิมพ์รหัสแล้วระบบจะเดาชั้นปีให้จากเลขสองหลักแรก (แก้ได้)</div></div>'
      + '<div class="panel"><h3>นำเข้าหลายคน</h3><p class="muted" style="margin-bottom:8px">วางทีละบรรทัดในรูปแบบ <b>รหัส, ชื่อ, ชั้นปี</b> (คั่นด้วย , หรือแท็บ หรือคัดลอกจาก Excel) รหัสใส่เป็นอีเมล sb…@lru.ac.th ได้</p><textarea id="bulk" placeholder="6740102220, สมชาย ใจดี, 3&#10;6840100001, สมหญิง รักเรียน, 2"></textarea><div style="margin-top:10px"><button class="btn primary sm" id="bulkBtn">นำเข้า</button></div><div id="bulkRes" class="result"></div></div>'
      + '<div class="panel"><h3>รายชื่อนักศึกษา</h3><div class="form" style="grid-template-columns:1fr 120px"><input id="stQ" type="search" placeholder="ค้นหาชื่อหรือรหัส"><select id="stF"><option value="">ทุกชั้นปี</option>' + YEARS.map((y) => '<option value="' + y + '">ปี ' + y + '</option>').join('') + '</select></div><div id="stList" style="margin-top:8px"><div class="skeleton"></div></div></div>';
    $('stId').addEventListener('input', () => { const y = suggestYear($('stId').value); if (y && !$('stYr').dataset.touched) $('stYr').value = y; });
    $('stYr').addEventListener('change', () => { $('stYr').dataset.touched = '1'; });
    $('stForm').addEventListener('submit', saveStudent);
    $('bulkBtn').addEventListener('click', bulkImport);
    $('stQ').addEventListener('input', (e) => { stQuery = e.target.value; clearTimeout(stTimer); stTimer = setTimeout(loadStudentList, 250); });
    $('stF').addEventListener('change', (e) => { stYear = e.target.value; loadStudentList(); });
  }
  loadStudentList();
}
let students = [];
async function loadStudentList() {
  const list = $('stList'); if (!list) return;
  const q = new URLSearchParams(); if (stQuery) q.set('q', stQuery); if (stYear) q.set('year', stYear);
  let r;
  try { r = await api('/camps/admin/students?' + q); } catch (e) { list.innerHTML = failBox('เชื่อมต่อเซิร์ฟเวอร์ไม่ได้', 'loadStudentList()'); return; }
  if (!r.ok) { list.innerHTML = failBox(await errMsg(r), 'loadStudentList()'); return; }
  students = (await r.json()).students || [];
  list.innerHTML = students.map((s, i) => '<div class="srow"><div class="m"><b>' + esc(s.name) + '</b><small>' + esc(s.student_id) + ' · ปี ' + s.year + ' · ' + (s.department_name ? 'ฝ่าย: ' + esc(s.department_name).replace(/^ฝ่าย/, '') : 'ยังไม่เลือกฝ่าย') + '</small></div><div class="acts"><button class="btn sm" onclick="editStudent(' + i + ')">แก้ไข</button>' + (s.department_code ? '<button class="btn sm" onclick="clearSel(' + i + ')">ล้างฝ่าย</button>' : '') + '<button class="btn sm danger" onclick="delStudent(' + i + ')">ลบ</button></div></div>').join('') || '<div class="muted" style="padding:14px 0;text-align:center">ไม่พบนักศึกษา</div>';
}
async function saveStudent(e) {
  e.preventDefault();
  const r = await post('/camps/admin/students', { studentId: $('stId').value, name: $('stName').value, year: Number($('stYr').value) });
  if (!r.ok) return toast(await errMsg(r), true);
  toast('บันทึกนักศึกษาแล้ว'); $('stForm').reset(); delete $('stYr').dataset.touched; loadStudentList();
}
function editStudent(i) { const s = students[i]; $('stId').value = s.student_id; $('stName').value = s.name; $('stYr').value = String(s.year); $('stYr').dataset.touched = '1'; $('stForm').scrollIntoView({ behavior: 'smooth', block: 'center' }); $('stName').focus(); }
async function delStudent(i) {
  const s = students[i]; if (!(await confirmDlg('ลบนักศึกษา?', s.name + ' (' + s.student_id + ') จะถูกลบออกจากรายชื่อและการเลือกฝ่าย', 'ลบ'))) return;
  const r = await post('/camps/admin/students/delete', { studentId: s.student_id });
  if (!r.ok) return toast(await errMsg(r), true); toast('ลบแล้ว'); loadStudentList();
}
async function clearSel(i) {
  const s = students[i]; if (!(await confirmDlg('ล้างการเลือกฝ่าย?', s.name + ' จะกลับไปเป็นยังไม่เลือกฝ่าย และที่นั่งจะถูกคืน', 'ล้างการเลือก'))) return;
  const r = await post('/camps/admin/selections/clear', { studentId: s.student_id });
  if (!r.ok) return toast(await errMsg(r), true); toast('ล้างการเลือกแล้ว'); loadStudentList();
}
async function bulkImport() {
  const text = $('bulk').value.trim(); if (!text) return toast('วางรายชื่อก่อน', true);
  const btn = $('bulkBtn'); btn.disabled = true;
  try {
    const r = await post('/camps/admin/students/bulk', { text });
    if (!r.ok) return toast(await errMsg(r), true);
    const d = await r.json();
    $('bulkRes').innerHTML = '✓ เพิ่มใหม่ <b>' + d.added + '</b> · อัปเดต <b>' + d.updated + '</b>' + (d.errors.length ? ' · ข้าม <b>' + d.errors.length + '</b> บรรทัด:<div class="err">' + d.errors.slice(0, 20).map((x) => 'บรรทัด ' + x.line + ': ' + esc(x.error) + ' — ' + esc(x.text)).join('<br>') + '</div>' : '');
    if (!d.errors.length) $('bulk').value = '';
    toast('นำเข้าเสร็จแล้ว'); loadStudentList();
  } finally { btn.disabled = false; }
}
async function exportCsv() {
  const r = await api('/camps/admin/students'); if (!r.ok) return toast(await errMsg(r), true);
  const list = (await r.json()).students || [];
  const q = (v) => '"' + String(v ?? '').replace(/"/g, '""') + '"';
  const csv = '﻿' + ['รหัสนักศึกษา,ชื่อ,ชั้นปี,ฝ่าย'].concat(list.map((s) => [q(s.student_id), q(s.name), s.year, q(s.department_name || '')].join(','))).join('\r\n');
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' })); a.download = 'camp-students.csv'; document.body.appendChild(a); a.click(); a.remove();
}

// ---------- start ----------
async function start() {
  loadDepartments();
  setInterval(() => { if (!document.hidden) loadDepartments(true); }, 30000);
  const authed = await initAuth();
  if (authed) await loadMe(); else if (authReady) renderAcct();
}
window.addEventListener('DOMContentLoaded', start);
