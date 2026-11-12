// ฝ่ายบุคคล — students pick a department and register (Google sign-in, university email);
// admins manage roster (CSV import), quotas per year and gender, and registration state on separate pages.
const API = window.CAMPS_API || 'https://engedlru-api.stnetworld.workers.dev';
const AUTH_DOMAIN = 'auth.litalkeducation.com', CLIENT_ID = 'PGqozL94LzOwstm4pD39W5kvalYRiK7w';
const HR_URL = location.origin + '/hr/';          // Auth0 callback + logout URL must include https://<host>/hr/
const CONNECTION = 'google-oauth2';
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const YEARS = [1, 2, 3, 4];
const GENDERS = ['M', 'F'];
const GL = new Proxy({ M: 'ชาย', F: 'หญิง' }, { get: (t, k) => t[k] || 'ไม่ระบุเพศ' });   // legacy rows may have no gender yet
const PAGE = document.body.dataset.page || 'student';   // 'student' (/hr/) or 'admin' (/hr/overview, /hr/quota, ...)
const TAB = document.body.dataset.tab || 'overview';     // which admin page this is
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
  pending: ['เร็วๆ นี้', 'ค่ายของเรามีทั้งหมด 5 ฝ่าย ดูหน้าที่และจำนวนที่รับของแต่ละฝ่ายไว้ก่อน แล้วรอลงทะเบียนในระบบที่กำลังจะเปิด'],
  open: ['เปิดลงทะเบียน', 'แตะเลือกฝ่ายที่สนใจ ดูจำนวนที่ลงทะเบียนแล้วและที่ว่างของแต่ละชั้นปี แล้วกดปุ่มลงทะเบียน'],
  closed: ['ปิดลงทะเบียนแล้ว', 'ปิดการลงทะเบียนแล้ว ยังดูรายละเอียดและจำนวนผู้ลงทะเบียนของแต่ละฝ่ายได้ตามปกติ']
};
const ADMIN_PAGES = [['overview', 'ภาพรวม', '/hr/overview'], ['quota', 'โควตา', '/hr/quota'], ['students', 'นักศึกษา', '/hr/students'], ['settings', 'ตั้งค่า', '/hr/settings']];

let auth0Client = null, me = null, deps = [], state = 'pending', authReady = false, adminData = null;
const withTimeout = (p, ms, msg) => Promise.race([p, new Promise((_, no) => setTimeout(() => no(new Error(msg)), ms))]);

// ---------- ui helpers ----------
let toastT;
function toast(msg, err) { const t = $('toast'); t.textContent = msg; t.className = (err ? 'err ' : '') + 'show'; clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 3400); }
function confirmDlg(title, text, okLabel, cancelLabel) {
  return new Promise((resolve) => {
    const d = document.createElement('div'); d.className = 'dlg';
    d.innerHTML = '<div class="box" role="dialog" aria-modal="true"><h3>' + esc(title) + '</h3><p>' + esc(text) + '</p><div class="btns"><button class="btn" data-r="0">' + esc(cancelLabel || 'ยกเลิก') + '</button><button class="btn primary" data-r="1">' + esc(okLabel || 'ยืนยัน') + '</button></div></div>';
    d.addEventListener('click', (e) => { const r = e.target.closest('[data-r]'); if (r || e.target === d) { d.remove(); resolve(!!r && r.dataset.r === '1'); } });
    document.body.appendChild(d); d.querySelector('[data-r="1"]').focus();
  });
}
const infoDlg = (title, text, okLabel) => confirmDlg(title, text, okLabel, 'ปิด');
function openDlg(html) {
  const d = document.createElement('div'); d.className = 'dlg';
  d.innerHTML = '<div class="box wide" role="dialog" aria-modal="true">' + html + '</div>';
  d.addEventListener('mousedown', (e) => { if (e.target === d) d.remove(); });
  document.body.appendChild(d); return d;
}
const failBox = (msg, retry) => '<div class="failbox"><b>โหลดข้อมูลไม่สำเร็จ</b><p>' + esc(msg) + '</p><button class="btn primary sm" onclick="' + retry + '">ลองใหม่</button></div>';
async function errMsg(r) { try { const d = await r.json(); return d.error || ('เกิดข้อผิดพลาด (' + r.status + ')'); } catch (e) { return 'เกิดข้อผิดพลาด (' + r.status + ')'; } }
const gBtn = (label, fn) => '<button class="gbtn" onclick="' + fn + '">' + $('gicon').innerHTML + '<span>' + label + '</span></button>';
const zero = () => ({ M: { 1: 0, 2: 0, 3: 0, 4: 0 }, F: { 1: 0, 2: 0, 3: 0, 4: 0 } });

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
      let back = null; try { back = sessionStorage.getItem('hrReturn'); sessionStorage.removeItem('hrReturn'); } catch (e) { /* ignore */ }
      if (back && /^\/hr\/[\w\-/]*$/.test(back) && back !== location.pathname) { location.replace(back); return 'redirect'; }
    }
    authReady = true;
    return await auth0Client.isAuthenticated();
  } catch (e) { console.error(e); authReady = false; renderAcct({ error: e.message }); return null; }
}
async function login() {
  if (PAGE === 'admin') { try { sessionStorage.setItem('hrReturn', location.pathname); } catch (e) { /* ignore */ } }   // Auth0 always returns to /hr/
  const btns = document.querySelectorAll('.gbtn'); btns.forEach((b) => b.disabled = true);
  try {
    const ap = { connection: CONNECTION };
    try { if (sessionStorage.getItem('chooseGoogle')) { ap.prompt = 'select_account'; sessionStorage.removeItem('chooseGoogle'); } } catch (e) { /* ignore */ }
    await auth0Client.loginWithRedirect({ authorizationParams: ap });
  } catch (e) { btns.forEach((b) => b.disabled = false); toast(e.message || 'เข้าสู่ระบบไม่สำเร็จ', true); }
}
async function logout() { await auth0Client.logout({ logoutParams: { returnTo: HR_URL } }); }
async function switchAccount() { try { sessionStorage.setItem('chooseGoogle', '1'); } catch (e) { /* ignore */ } await logout(); }

// ---------- menu ----------
function renderNav() {
  const el = $('hrNav'); if (!el) return;
  let html = '<a href="/hr/" class="' + (PAGE === 'student' ? 'on' : '') + '">ลงทะเบียน</a>';
  if (me && me.isAdmin) html += '<span class="sep">ผู้ดูแล</span>' + ADMIN_PAGES.map(([k, l, h]) => '<a href="' + h + '" class="adm ' + (PAGE === 'admin' && TAB === k ? 'on' : '') + '">' + l + '</a>').join('');
  el.innerHTML = html;
  const on = el.querySelector('a.on'); if (on) el.scrollLeft = Math.max(0, on.offsetLeft - (el.clientWidth - on.offsetWidth) / 2);   // keep the current item visible on narrow screens
}
function renderState() {
  const [chip, text] = STATE_TEXT[state] || STATE_TEXT.pending;
  const c = $('stateChip'); if (c) { c.textContent = chip; c.className = 'state-chip ' + state; }
  const t = $('heroText'); if (t && !t.dataset.static) t.textContent = text;
}

// ---------- account card (student page) ----------
const REASONS = {
  not_university_email: (m) => 'บัญชี Google นี้ (' + esc(m.email) + ') ไม่ใช่อีเมลมหาวิทยาลัย กรุณาเข้าสู่ระบบด้วยอีเมล @lru.ac.th',
  email_not_verified: (m) => 'อีเมล ' + esc(m.email) + ' ยังไม่ได้รับการยืนยันจาก Google',
  no_gender: () => 'ผู้ดูแลยังไม่ได้ระบุเพศของคุณในรายชื่อ กรุณาติดต่อผู้ดูแลเพื่อให้ระบุ',
  not_in_roster: (m) => 'ไม่พบรหัสนักศึกษา ' + esc(m.studentId || '') + ' ในรายชื่อของค่าย กรุณาติดต่อผู้ดูแลเพื่อให้เพิ่มรหัส ชั้นปี และเพศของคุณ'
};
function renderAcct(x) {
  const box = $('acct');
  if (!box) { if (x && x.error) renderAdmin(x); else if (!me) renderAdmin(); return; }
  if (x && x.error) { box.innerHTML = '<div class="warn">' + esc(x.error) + '</div><button class="btn primary sm" onclick="location.reload()">ลองใหม่</button>'; return; }
  if (!me) {
    box.innerHTML = '<h2>เข้าสู่ระบบเพื่อลงทะเบียน</h2><p class="meta">ใช้อีเมลมหาวิทยาลัย (@lru.ac.th)</p>' + gBtn('เข้าสู่ระบบด้วย Google', 'login()');
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
  box.innerHTML = '<div class="row"><div class="avatar">' + esc((st.name || '?').trim()[0].toUpperCase()) + '</div><div><h2>' + esc(st.name) + adminPill + '</h2><div class="meta">รหัสนักศึกษา ' + esc(st.student_id) + ' · ชั้นปี ' + st.year + ' · ' + GL[st.gender] + '</div></div></div>'
    + '<div class="sel">' + (selDep ? 'ฝ่ายที่ลงทะเบียน: <b>' + esc(selDep.name) + '</b>' : 'ยังไม่ได้ลงทะเบียนฝ่าย') + '</div>'
    + '<div><button class="btn sm" onclick="logout()">ออกจากระบบ</button></div>';
}

// ---------- departments (student page) ----------
// open/closed status of one department + year + gender slot
function slot(q, f) {
  if (state === 'pending') return { t: 'เร็วๆ นี้', c: 'wait', note: 'ยังไม่เปิด' };
  if (state === 'closed') return { t: 'ปิด', c: 'off', note: 'ปิดลงทะเบียน' };
  if (!q) return { t: 'ปิด', c: 'off', note: 'ไม่รับ' };
  if (f >= q) return { t: 'ปิด', c: 'off', note: 'เต็มแล้ว' };
  return { t: 'เปิด', c: 'on', note: 'เหลือ ' + (q - f) + ' ที่' };
}
let picked = null; try { picked = sessionStorage.getItem('hrPicked'); } catch (e) { /* ignore */ }
function setPicked(code) { picked = code; try { code ? sessionStorage.setItem('hrPicked', code) : sessionStorage.removeItem('hrPicked'); } catch (e) { /* ignore */ } }
const myYear = () => (me && me.student ? me.student.year : 0);
const myGender = () => (me && me.student ? me.student.gender : '');
const myDept = () => (me && me.selection ? me.selection.department_code : null);

function deptCard(d) {
  const my = myYear(), mg = myGender(), reg = myDept() === d.code, pk = picked === d.code;
  const yrs = YEARS.map((y) => '<div class="yr' + (y === my ? ' mine' : '') + '"><span class="yl">ปี ' + y + (y === my ? ' (คุณ)' : '') + '</span>' + GENDERS.map((g) => {
    const q = d.quota[g][y], f = d.filled[g][y], st = slot(q, f);
    return '<div class="gr ' + st.c + (y === my && g === mg ? ' me' : '') + '"><span class="gn">' + GL[g] + '</span><b>' + (q ? f + '/' + q : '–') + '</b><span class="st ' + st.c + '" title="' + esc(st.note) + '">' + st.t + (st.c === 'off' && st.note !== 'ปิดลงทะเบียน' ? ' · ' + (q ? 'เต็ม' : 'ไม่รับ') : '') + '</span></div>';
  }).join('') + '</div>').join('');
  const tag = reg ? '<span class="tag ok">✓ ลงทะเบียนแล้ว</span>' : (pk ? '<span class="tag pick">เลือกอยู่</span>' : '');
  return '<div class="dept pickable ' + (TONE[d.code] || '') + (reg ? ' mine' : '') + (pk ? ' picked' : '') + '" role="button" tabindex="0" aria-pressed="' + pk + '" onclick="pick(\'' + d.code + '\')" onkeydown="if(event.key===\'Enter\'||event.key===\' \'){event.preventDefault();pick(\'' + d.code + '\')}"><div class="top"><div class="icon">' + svg(ICON[d.code] || ICON.direction) + '</div><div class="grow"><h3>' + esc(d.name) + '</h3><p>' + esc(d.description) + '</p></div>' + tag + '</div><div class="yrs">' + yrs + '</div></div>';
}
function renderSummary() {
  if (!deps.length || !$('sumBox')) return;
  const my = myYear(), mg = myGender();
  $('sumBox').innerHTML = '<h2>ภาพรวมการลงทะเบียน</h2><div class="sumgrid">' + YEARS.map((y) => '<div class="sy' + (y === my ? ' mine' : '') + '"><div class="sh"><b>ปี ' + y + (y === my ? ' (คุณ)' : '') + '</b></div>' + GENDERS.map((g) => {
    const q = deps.reduce((a, d) => a + d.quota[g][y], 0), f = deps.reduce((a, d) => a + d.filled[g][y], 0), st = slot(q, f), pct = q ? Math.min(100, Math.round(f / q * 100)) : 0;
    return '<div class="sg' + (y === my && g === mg ? ' me' : '') + '"><div class="sl"><span>' + GL[g] + ' <b>' + f + '</b><small>/' + q + '</small></span><span class="st ' + st.c + '">' + st.t + '</span></div><div class="prog"><i style="width:' + pct + '%"></i></div></div>';
  }).join('') + '</div>').join('') + '</div>';
}
function renderDepts() { if (!$('depts')) return; $('depts').innerHTML = deps.map(deptCard).join(''); renderSummary(); renderBar(); }
function pick(code) { setPicked(picked === code ? null : code); renderDepts(); }

// bottom bar: choose a department first, then press ลงทะเบียน (sign-in happens at that point)
function renderBar() {
  const bar = $('bar'); if (!bar) return;
  const reg = myDept(), regDep = reg && deps.find((d) => d.code === reg), pk = picked && deps.find((d) => d.code === picked);
  document.body.classList.toggle('has-bar', !!(regDep || pk));
  if (!regDep && !pk) { bar.classList.add('hidden'); return; }
  bar.classList.remove('hidden');
  const parts = [];
  if (regDep && (!pk || pk.code === regDep.code)) {
    parts.push('<div class="bi"><span class="chosen">✓ ลงทะเบียนแล้ว</span><b>' + esc(regDep.name) + '</b></div>');
    parts.push(state === 'open' ? '<button class="btn ghost" onclick="unselect()">ยกเลิก</button>' : '');
  } else {
    const y = myYear(), g = myGender(), st = y ? slot(pk.quota[g][y], pk.filled[g][y]) : null;
    const blocked = st && st.c !== 'on' ? st.note : '';
    parts.push('<div class="bi"><span class="muted">' + (regDep ? 'เปลี่ยนจาก ' + esc(regDep.name) + ' เป็น' : 'ฝ่ายที่เลือก') + '</span><b>' + esc(pk.name) + '</b>' + (y ? '<span class="muted">ชั้นปี ' + y + ' ' + GL[g] + ': ' + esc(st.note) + '</span>' : '') + '</div>');
    parts.push('<button class="btn primary" ' + (blocked || state !== 'open' ? 'disabled' : '') + ' onclick="register()">' + (state === 'pending' ? 'ยังไม่เปิดลงทะเบียน' : state === 'closed' ? 'ปิดลงทะเบียนแล้ว' : blocked ? 'ลงทะเบียนไม่ได้ (' + esc(blocked) + ')' : 'ลงทะเบียน') + '</button>');
  }
  bar.innerHTML = '<div class="barin">' + parts.join('') + '</div>';
}
async function loadDepartments() {
  if (PAGE !== 'student') return;
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
  me = await r.json(); state = me.registration || state; renderState(); renderAcct(); renderDepts(); renderAdmin(); renderNav();
  if (PAGE === 'student') resumeAfterLogin();
}
async function register() {
  const d = deps.find((x) => x.code === picked); if (!d) return;
  if (!authReady) return toast('ระบบเข้าสู่ระบบยังไม่พร้อม ลองรีเฟรชหน้า', true);
  if (!me) { try { sessionStorage.setItem('hrResume', '1'); } catch (e) { /* ignore */ } return login(); }
  if (me.reason) {
    const sw = !me.isAdmin;
    const go = await infoDlg('ลงทะเบียนไม่ได้', REASONS[me.reason](me).replace(/&amp;/g, '&').replace(/<[^>]+>/g, ''), sw ? 'ใช้บัญชี Google อื่น' : 'ตกลง');
    if (go && sw) switchAccount(); return;
  }
  if (state !== 'open') return toast(state === 'pending' ? 'ยังไม่เปิดลงทะเบียน' : 'ปิดลงทะเบียนแล้ว', true);
  const cur = me.selection && deps.find((x) => x.code === me.selection.department_code);
  const ok = await confirmDlg(cur ? 'เปลี่ยนฝ่าย?' : 'ยืนยันลงทะเบียน?', cur ? 'เปลี่ยนจาก ' + cur.name + ' เป็น ' + d.name + ' (ที่นั่งเดิมจะถูกคืน)' : 'ลงทะเบียน ' + d.name + ' (ชั้นปี ' + me.student.year + ' ' + GL[me.student.gender] + ') เปลี่ยนฝ่ายได้ตลอดช่วงที่เปิดลงทะเบียน', cur ? 'เปลี่ยนฝ่าย' : 'ลงทะเบียน');
  if (!ok) return;
  const r = await post('/camps/select', { departmentCode: d.code });
  if (!r.ok) toast(await errMsg(r), true); else { toast('ลงทะเบียน' + d.name + 'เรียบร้อยแล้ว'); setPicked(null); }
  await Promise.all([loadDepartments(), loadMe()]);
}
// after the Google redirect: pick up where the student left off
function resumeAfterLogin() {
  let flag = null; try { flag = sessionStorage.getItem('hrResume'); sessionStorage.removeItem('hrResume'); } catch (e) { /* ignore */ }
  if (flag && picked && me) setTimeout(register, 400);
}
async function unselect() {
  if (!(await confirmDlg('ยกเลิกการลงทะเบียน?', 'ที่นั่งของคุณจะถูกคืนให้คนอื่น', 'ยกเลิกการลงทะเบียน'))) return;
  const r = await post('/camps/unselect');
  if (!r.ok) toast(await errMsg(r), true); else toast('ยกเลิกการลงทะเบียนแล้ว');
  await Promise.all([loadDepartments(), loadMe()]);
}

// ---------- admin pages ----------
const NO_PERM = (m) => '<div class="card acct"><h2>ไม่มีสิทธิ์ผู้ดูแล</h2><div class="warn">บัญชี ' + esc(m.email) + ' ไม่ได้รับสิทธิ์ผู้ดูแลฝ่ายบุคคล ต้องมี Auth0 role <b>camp_admin</b> หรือ <b>budget_admin</b></div><div class="act" style="display:flex;gap:8px;flex-wrap:wrap"><a class="btn primary sm" href="/hr/">กลับไปหน้าลงทะเบียน</a><button class="btn sm" onclick="switchAccount()">ใช้บัญชี Google อื่น</button></div></div>';
function renderAdmin(x) {
  const box = $('adminBox'); if (!box) return;
  if (x && x.error) { box.innerHTML = '<div class="card acct"><div class="warn">' + esc(x.error) + '</div><button class="btn primary sm" onclick="location.reload()">ลองใหม่</button></div>'; return; }
  if (!me) { box.innerHTML = '<div class="card acct"><h2>เข้าสู่ระบบผู้ดูแล</h2><p class="meta">ต้องเข้าสู่ระบบด้วยบัญชี Google ที่ได้รับสิทธิ์ผู้ดูแล</p>' + gBtn('เข้าสู่ระบบด้วย Google', 'login()') + '</div>'; return; }
  if (!me.isAdmin) { box.innerHTML = NO_PERM(me); return; }
  box.innerHTML = '<div id="adminBody"><div class="skeleton"></div></div>';
  loadAdminPage();
}
async function loadAdminPage() {
  const body = $('adminBody');
  if (TAB === 'students') return loadStudents();
  let r;
  try { r = await api('/camps/admin/overview'); } catch (e) { body.innerHTML = failBox('เชื่อมต่อเซิร์ฟเวอร์ไม่ได้', 'loadAdminPage()'); return; }
  if (!r.ok) { body.innerHTML = failBox(await errMsg(r), 'loadAdminPage()'); return; }
  adminData = await r.json();
  if (TAB === 'overview') renderOverview(); else if (TAB === 'quota') renderQuota(); else renderSettings();
}
const cell = (d, g, y) => { const q = d.quota[g][y], f = d.filled[g][y]; return '<div class="gc' + (q > 0 && f >= q ? ' full' : '') + '"><span>' + GL[g].replace('ชาย', 'ช').replace('หญิง', 'ญ') + '</span> ' + f + '/' + q + '</div>'; };
function renderOverview() {
  const a = adminData, sumG = (g) => YEARS.reduce((s, y) => s + (a.students[g][y] || 0), 0), total = sumG('M') + sumG('F');
  const rows = a.departments.map((d) => '<tr><td><b>' + esc(d.name) + '</b></td>' + YEARS.map((y) => '<td>' + GENDERS.map((g) => cell(d, g, y)).join('') + '</td>').join('') + '<td>' + GENDERS.map((g) => { const q = YEARS.reduce((s, y) => s + d.quota[g][y], 0), f = YEARS.reduce((s, y) => s + d.filled[g][y], 0); return '<div class="gc"><span>' + (g === 'M' ? 'ช' : 'ญ') + '</span> ' + f + '/' + q + '</div>'; }).join('') + '</td></tr>').join('');
  $('adminBody').innerHTML = '<div class="panel"><h3>ลงทะเบียนแล้ว / โควตา (ช = ชาย · ญ = หญิง)</h3><div class="tbl-wrap"><table><thead><tr><th>ฝ่าย</th>' + YEARS.map((y) => '<th>ปี ' + y + '</th>').join('') + '<th>รวม</th></tr></thead><tbody>' + rows + '</tbody></table></div></div>'
    + '<div class="panel"><h3>นักศึกษาในรายชื่อ</h3><div class="tbl-wrap"><table><thead><tr><th></th>' + YEARS.map((y) => '<th>ปี ' + y + '</th>').join('') + '<th>รวม</th></tr></thead><tbody>' + GENDERS.map((g) => '<tr><td><b>' + GL[g] + '</b></td>' + YEARS.map((y) => '<td>' + (a.students[g][y] || 0) + '</td>').join('') + '<td><b>' + sumG(g) + '</b></td></tr>').join('') + '</tbody></table></div><p class="muted" style="margin-top:10px">รวม <b>' + total + '</b> คน · ลงทะเบียนแล้ว <b>' + a.selectedTotal + '</b> คน (ยังไม่ลงทะเบียน ' + Math.max(0, total - a.selectedTotal) + ')</p><div style="margin-top:10px"><button class="btn sm" onclick="exportCsv()">ดาวน์โหลด CSV (รายชื่อ + ฝ่าย)</button></div></div>'
    + '<div class="panel" id="regList"><h3>ผู้ลงทะเบียนแต่ละฝ่าย</h3><div class="skeleton"></div></div>';
  loadRegList();
}
// names of everyone registered, grouped by department, year and gender (admins only); admins can add / remove names by hand
const openReg = new Set(); let allStudents = [];
async function loadRegList() {
  const box = $('regList'); if (!box) return;
  let r; try { r = await api('/camps/admin/students'); } catch (e) { box.innerHTML = '<h3>ผู้ลงทะเบียนแต่ละฝ่าย</h3>' + failBox('เชื่อมต่อเซิร์ฟเวอร์ไม่ได้', 'loadRegList()'); return; }
  if (!r.ok) { box.innerHTML = '<h3>ผู้ลงทะเบียนแต่ละฝ่าย</h3>' + failBox(await errMsg(r), 'loadRegList()'); return; }
  allStudents = (await r.json()).students || [];
  box.innerHTML = '<h3>ผู้ลงทะเบียนแต่ละฝ่าย</h3><p class="muted" style="margin:-4px 0 8px">ผู้ดูแลเพิ่มหรือนำชื่อออกจากฝ่ายเองได้</p>' + adminData.departments.map((d) => {
    const mem = allStudents.filter((x) => x.department_code === d.code);
    return '<details class="reg" data-code="' + d.code + '"' + (openReg.has(d.code) ? ' open' : '') + ' ontoggle="regToggle(this)"><summary><b>' + esc(d.name) + '</b> <span class="muted">' + mem.length + ' คน</span></summary>' + (mem.length ? YEARS.map((y) => GENDERS.map((g) => {
      const m = mem.filter((x) => x.year === y && x.gender === g); return m.length ? '<div class="regy"><span class="pill">ปี ' + y + ' ' + GL[g] + ' · ' + m.length + '/' + d.quota[g][y] + '</span> ' + m.map((x) => '<span class="nm">' + esc(x.name) + '<button type="button" aria-label="นำ ' + esc(x.name) + ' ออก" title="นำออกจากฝ่าย" onclick="removeFrom(\'' + x.student_id + '\')">×</button></span>').join('') + '</div>' : '';
    }).join('')).join('') : '<div class="muted" style="padding:6px 0">ยังไม่มีผู้ลงทะเบียน</div>') + '<div style="margin-top:8px"><button class="btn sm primary" onclick="pickerDialog(\'' + d.code + '\')">＋ เพิ่มรายชื่อเข้า' + esc(d.name.replace(/^ฝ่าย/, '')) + '</button></div></details>';
  }).join('');
}
function regToggle(el) { el.open ? openReg.add(el.dataset.code) : openReg.delete(el.dataset.code); }
async function removeFrom(id) {
  const s = allStudents.find((x) => x.student_id === id); if (!s) return;
  if (!(await confirmDlg('นำออกจากฝ่าย?', s.name + ' จะกลับไปเป็นยังไม่ลงทะเบียน และที่นั่งจะถูกคืน', 'นำออก'))) return;
  const r = await post('/camps/admin/selections/clear', { studentId: id });
  if (!r.ok) return toast(await errMsg(r), true); toast('นำออกแล้ว'); loadAdminPage();
}
// put students into a department; asks before going over the quota
async function doAssign(code, ids, force) {
  const r = await post('/camps/admin/selections/assign', { departmentCode: code, studentIds: ids, force: !!force });
  if (!r.ok) { toast(await errMsg(r), true); return false; }
  const d = await r.json(); let assigned = d.assigned;
  if (d.noGender && d.noGender.length) toast('ข้าม ' + d.noGender.length + ' คนที่ยังไม่ระบุเพศ (' + d.noGender.slice(0, 3).map((x) => x.name).join(', ') + ')', true);
  if (d.full.length && !force) {
    const names = d.full.slice(0, 4).map((x) => x.name).join(', ') + (d.full.length > 4 ? ' และอีก ' + (d.full.length - 4) + ' คน' : '');
    if (await confirmDlg('ฝ่ายเต็มโควตา', 'ที่นั่งของเพศและชั้นปีนี้เต็มแล้ว เพิ่มไม่ได้ ' + d.full.length + ' คน (' + names + ') ต้องการเพิ่มเกินโควตาหรือไม่?', 'เพิ่มเกินโควตา')) {
      const r2 = await post('/camps/admin/selections/assign', { departmentCode: code, studentIds: d.full.map((x) => x.studentId), force: true });
      if (r2.ok) assigned += (await r2.json()).assigned; else toast(await errMsg(r2), true);
    }
  }
  const dep = deps.find((x) => x.code === code) || (adminData && adminData.departments.find((x) => x.code === code));
  toast(assigned ? 'เพิ่ม ' + assigned + ' คนเข้า' + (dep ? dep.name : 'ฝ่าย') + 'แล้ว' + (d.missing.length ? ' (ไม่พบรหัส ' + d.missing.length + ')' : '') : (d.unchanged ? 'อยู่ในฝ่ายนี้อยู่แล้ว' : 'ไม่ได้เพิ่มใคร'), !assigned && !d.unchanged);
  return assigned > 0 || d.unchanged > 0;
}
// pick several students and add them to one department (overview page)
function pickerDialog(code) {
  const dep = adminData.departments.find((x) => x.code === code);
  const slots = YEARS.map((y) => 'ปี ' + y + ': ' + GENDERS.map((g) => (g === 'M' ? 'ช' : 'ญ') + ' ' + dep.filled[g][y] + '/' + dep.quota[g][y]).join(' · ')).join('  |  ');
  const d = openDlg('<h3>เพิ่มรายชื่อเข้า' + esc(dep.name) + '</h3><p class="muted">' + esc(slots) + '</p><input id="pkQ" type="search" placeholder="ค้นหาชื่อหรือรหัส"><label class="chk"><input type="checkbox" id="pkAll"> แสดงคนที่มีฝ่ายอยู่แล้ว (ย้ายมาฝ่ายนี้)</label><div id="pkList" class="pickl"></div><label class="chk"><input type="checkbox" id="pkForce"> เพิ่มแม้ฝ่ายเต็มโควตา</label><div class="btns"><button class="btn" data-x>ยกเลิก</button><button class="btn primary" id="pkOk" disabled>เพิ่ม</button></div>');
  const chosen = new Set();
  const draw = () => {
    const q = $('pkQ').value.trim().toLowerCase(), all = $('pkAll').checked;
    const rows = allStudents.filter((x) => x.department_code !== code && (all || !x.department_code) && (!q || x.name.toLowerCase().includes(q) || x.student_id.includes(q)));
    $('pkList').innerHTML = rows.map((x) => '<label class="pk"><input type="checkbox" value="' + x.student_id + '"' + (chosen.has(x.student_id) ? ' checked' : '') + '><span><b>' + esc(x.name) + '</b><small>' + esc(x.student_id) + ' · ปี ' + x.year + ' · ' + GL[x.gender] + (x.department_name ? ' · อยู่ ' + esc(x.department_name) : '') + '</small></span></label>').join('') || '<div class="muted" style="padding:14px;text-align:center">ไม่พบนักศึกษา</div>';
    $('pkOk').textContent = chosen.size ? 'เพิ่ม ' + chosen.size + ' คน' : 'เพิ่ม'; $('pkOk').disabled = !chosen.size;
  };
  d.addEventListener('change', (e) => { if (e.target.closest('#pkList')) { e.target.checked ? chosen.add(e.target.value) : chosen.delete(e.target.value); draw(); } else if (e.target.id === 'pkAll') draw(); });
  $('pkQ').addEventListener('input', draw);
  d.querySelector('[data-x]').onclick = () => d.remove();
  $('pkOk').onclick = async () => { $('pkOk').disabled = true; const ok = await doAssign(code, [...chosen], $('pkForce').checked); if (ok) { d.remove(); loadAdminPage(); } else draw(); };
  draw(); $('pkQ').focus();
}
// assign one student from the students page
async function assignDialog(i) {
  const s = students[i];
  if (!s.gender) return toast('ยังไม่ได้ระบุเพศของ ' + s.name + ' กด "แก้ไข" เพื่อระบุเพศก่อน', true);
  let r; try { r = await api('/camps/admin/overview'); } catch (e) { return toast('เชื่อมต่อเซิร์ฟเวอร์ไม่ได้', true); }
  if (!r.ok) return toast(await errMsg(r), true);
  adminData = await r.json();
  const opts = adminData.departments.map((x) => { const q = x.quota[s.gender][s.year], f = x.filled[s.gender][s.year], cur = s.department_code === x.code; return '<option value="' + x.code + '"' + (cur ? ' selected' : '') + '>' + esc(x.name) + ' — ปี ' + s.year + ' ' + GL[s.gender] + ' ' + f + '/' + q + (q && f >= q ? ' (เต็ม)' : !q ? ' (ไม่รับ)' : '') + (cur ? ' · ปัจจุบัน' : '') + '</option>'; }).join('');
  const d = openDlg('<h3>กำหนดฝ่าย</h3><p><b>' + esc(s.name) + '</b><br><span class="muted">' + esc(s.student_id) + ' · ปี ' + s.year + ' · ' + GL[s.gender] + '</span></p><label class="fld">ฝ่าย<select id="asDept">' + opts + '</select></label><label class="chk"><input type="checkbox" id="asForce"> เพิ่มแม้ฝ่ายเต็มโควตา</label><div class="btns"><button class="btn" data-x>ยกเลิก</button><button class="btn primary" id="asOk">กำหนดฝ่าย</button></div>');
  d.querySelector('[data-x]').onclick = () => d.remove();
  $('asOk').onclick = async () => { $('asOk').disabled = true; const ok = await doAssign($('asDept').value, [s.student_id], $('asForce').checked); if (ok) { d.remove(); loadStudentList(); } else $('asOk').disabled = false; };
}
function renderQuota() {
  $('adminBody').innerHTML = '<p class="muted" style="margin:0 4px 10px">กำหนดจำนวนที่รับของแต่ละฝ่าย แยก <b>ชาย / หญิง</b> และชั้นปี (0 = ไม่เปิดรับ) ตั้งต่ำกว่าจำนวนที่มีคนลงทะเบียนแล้วไม่ได้</p>' + adminData.departments.map((d) =>
    '<div class="panel"><h3>' + esc(d.name) + '</h3><div class="qm"><div class="qh"></div>' + YEARS.map((y) => '<div class="qh">ปี ' + y + '</div>').join('') + GENDERS.map((g) => '<div class="qg">' + GL[g] + '</div>' + YEARS.map((y) => '<label class="qc"><input type="number" inputmode="numeric" min="0" max="9999" id="q-' + d.code + '-' + g + '-' + y + '" value="' + d.quota[g][y] + '"><span>ลงแล้ว ' + d.filled[g][y] + '</span></label>').join('')).join('') + '</div><div class="qact"><button class="btn primary sm" onclick="saveQuota(\'' + d.code + '\')">บันทึกโควตา</button><button class="btn sm" onclick="copyQuota(\'' + d.code + '\')">คัดลอกค่า ชาย → หญิง</button></div></div>').join('');
}
function copyQuota(code) { for (const y of YEARS) $('q-' + code + '-F-' + y).value = $('q-' + code + '-M-' + y).value; toast('คัดลอกแล้ว กด "บันทึกโควตา" เพื่อยืนยัน'); }
async function saveQuota(code) {
  const quotas = { M: {}, F: {} }; for (const g of GENDERS) for (const y of YEARS) quotas[g][y] = Number($('q-' + code + '-' + g + '-' + y).value);
  const btn = document.querySelector('button[onclick="saveQuota(\'' + code + '\')"]'); if (btn) btn.disabled = true;
  try {
    const r = await post('/camps/admin/quota', { departmentCode: code, quotas });
    if (!r.ok) return toast(await errMsg(r), true);
    const d = adminData.departments.find((x) => x.code === code); if (d) for (const g of GENDERS) for (const y of YEARS) d.quota[g][y] = quotas[g][y];   // keep edits in the other cards
    toast('บันทึกโควตาแล้ว');
  } finally { if (btn) btn.disabled = false; }
}
function renderSettings() {
  const s = adminData.registration;
  const opts = [['pending', 'เร็วๆ นี้'], ['open', 'เปิดลงทะเบียน'], ['closed', 'ปิดลงทะเบียน']];
  $('adminBody').innerHTML = '<div class="panel"><h3>สถานะการลงทะเบียน</h3><div class="seg">' + opts.map(([k, l]) => '<button class="' + (s === k ? 'on' : '') + '" onclick="setState(\'' + k + '\')">' + l + '</button>').join('') + '</div><p class="muted" style="margin-top:10px">เร็วๆ นี้ = แสดงป้ายยังไม่เปิด · เปิดลงทะเบียน = นักศึกษาลงทะเบียน/เปลี่ยนฝ่ายได้ · ปิดลงทะเบียน = ล็อกทั้งหมด (ผู้ดูแลยังล้างการลงทะเบียนรายคนได้)</p></div>';
}
async function setState(k) {
  if (k === adminData.registration) return;
  if (k === 'open' && !(await confirmDlg('เปิดลงทะเบียน?', 'นักศึกษาในรายชื่อจะเริ่มลงทะเบียนได้ทันที ตรวจสอบรายชื่อและโควตาให้เรียบร้อยก่อน', 'เปิดลงทะเบียน'))) return;
  if (k === 'closed' && !(await confirmDlg('ปิดลงทะเบียน?', 'นักศึกษาจะลงทะเบียนหรือเปลี่ยนฝ่ายไม่ได้อีก', 'ปิดลงทะเบียน'))) return;
  const r = await post('/camps/admin/state', { registration: k });
  if (!r.ok) return toast(await errMsg(r), true);
  toast('อัปเดตสถานะแล้ว'); state = k; renderState(); loadAdminPage();
}

// students: add / edit, CSV import, list
let stQuery = '', stYear = '', stGender = '', stTimer, students = [];
function suggestYear(id) {
  const m = /^(\d{2})/.exec(String(id).replace(/^[a-z]{2}/i, '')); if (!m) return '';
  const d = new Date(), be = d.getFullYear() + 543, ac = be - (d.getMonth() < 5 ? 1 : 0), y = ac - (2500 + Number(m[1])) + 1;
  return y >= 1 && y <= 4 ? String(y) : '';
}
const GENDER_OPTS = '<option value="">เลือก</option><option value="M">ชาย</option><option value="F">หญิง</option>';
async function loadStudents() {
  const body = $('adminBody');
  body.innerHTML = '<div class="panel"><h3>เพิ่ม / แก้ไขนักศึกษา</h3><form id="stForm" class="form cols5"><label>รหัสนักศึกษา<input id="stId" required inputmode="numeric" placeholder="6740102220"></label><label>ชื่อ-นามสกุล<input id="stName" required maxlength="200" placeholder="ชื่อ นามสกุล"></label><label>ชั้นปี<select id="stYr" required><option value="">เลือก</option>' + YEARS.map((y) => '<option value="' + y + '">' + y + '</option>').join('') + '</select></label><label>เพศ<select id="stG" required>' + GENDER_OPTS + '</select></label><button class="btn primary" type="submit">บันทึก</button></form><div class="muted" style="margin-top:6px">พิมพ์รหัสแล้วระบบเดาชั้นปีให้จากเลขสองหลักแรก และเดาเพศจากคำนำหน้าชื่อ (นาย / นางสาว) แก้ได้</div></div>'
    + '<div class="panel"><h3>นำเข้าจากไฟล์ CSV</h3><p class="muted" style="margin-bottom:10px">คอลัมน์: <b>รหัสนักศึกษา, ชื่อ-นามสกุล, ชั้นปี, เพศ</b> (เพศ = ชาย/หญิง หรือ M/F ถ้าไม่มีคอลัมน์เพศ ระบบอ่านจากคำนำหน้า นาย/นางสาว) เพิ่มคอลัมน์ที่ 5 <b>ฝ่าย</b> ได้ถ้าอยากใส่เข้าฝ่ายพร้อมกัน (เช่น ฝ่ายการสอน) มีแถวหัวตารางหรือไม่ก็ได้ ใช้ , หรือ ; หรือแท็บ คั่นได้ ถ้าบันทึกจาก Excel ให้เลือก "CSV UTF-8"</p>'
    + '<div class="filerow"><label class="btn ghost" for="csvFile">เลือกไฟล์ CSV</label><input id="csvFile" type="file" accept=".csv,.txt,text/csv,text/plain" class="hidden"><button class="btn sm" type="button" onclick="downloadTemplate()">ดาวน์โหลดไฟล์ตัวอย่าง</button><span id="csvName" class="muted"></span></div>'
    + '<textarea id="bulk" placeholder="หรือวางข้อมูลที่นี่&#10;รหัสนักศึกษา,ชื่อ-นามสกุล,ชั้นปี,เพศ&#10;6740102220,สมชาย ใจดี,3,ชาย&#10;6840100001,สมหญิง รักเรียน,2,หญิง"></textarea><div style="margin-top:10px"><button class="btn primary sm" id="bulkBtn">นำเข้า</button></div><div id="bulkRes" class="result"></div></div>'
    + '<div class="panel"><h3>รายชื่อนักศึกษา <span class="muted" id="stCount"></span></h3><div class="form fl"><input id="stQ" type="search" placeholder="ค้นหาชื่อหรือรหัส"><select id="stF"><option value="">ทุกชั้นปี</option>' + YEARS.map((y) => '<option value="' + y + '">ปี ' + y + '</option>').join('') + '</select><select id="stFG"><option value="">ทุกเพศ</option><option value="M">ชาย</option><option value="F">หญิง</option></select></div><div id="stList" style="margin-top:8px"><div class="skeleton"></div></div></div>';
  $('stId').addEventListener('input', () => { const y = suggestYear($('stId').value); if (y && !$('stYr').dataset.touched) $('stYr').value = y; });
  $('stName').addEventListener('input', () => { const g = /^(นาย|เด็กชาย)/.test($('stName').value.trim()) ? 'M' : /^(นางสาว|นาง|เด็กหญิง)/.test($('stName').value.trim()) ? 'F' : ''; if (g && !$('stG').dataset.touched) $('stG').value = g; });
  $('stYr').addEventListener('change', () => { $('stYr').dataset.touched = '1'; });
  $('stG').addEventListener('change', () => { $('stG').dataset.touched = '1'; });
  $('stForm').addEventListener('submit', saveStudent);
  $('bulkBtn').addEventListener('click', bulkImport);
  $('csvFile').addEventListener('change', readCsvFile);
  $('stQ').addEventListener('input', (e) => { stQuery = e.target.value; clearTimeout(stTimer); stTimer = setTimeout(loadStudentList, 250); });
  $('stF').addEventListener('change', (e) => { stYear = e.target.value; loadStudentList(); });
  $('stFG').addEventListener('change', (e) => { stGender = e.target.value; loadStudentList(); });
  loadStudentList();
}
async function loadStudentList() {
  const list = $('stList'); if (!list) return;
  const q = new URLSearchParams(); if (stQuery) q.set('q', stQuery); if (stYear) q.set('year', stYear); if (stGender) q.set('gender', stGender);
  let r;
  try { r = await api('/camps/admin/students?' + q); } catch (e) { list.innerHTML = failBox('เชื่อมต่อเซิร์ฟเวอร์ไม่ได้', 'loadStudentList()'); return; }
  if (!r.ok) { list.innerHTML = failBox(await errMsg(r), 'loadStudentList()'); return; }
  students = (await r.json()).students || [];
  $('stCount').textContent = '(' + students.length + ' คน)';
  list.innerHTML = students.map((s, i) => '<div class="srow"><div class="m"><b>' + esc(s.name) + '</b><small>' + esc(s.student_id) + ' · ปี ' + s.year + ' · ' + GL[s.gender] + ' · ' + (s.department_name ? 'ฝ่าย: ' + esc(s.department_name).replace(/^ฝ่าย/, '') : 'ยังไม่ลงทะเบียน') + '</small></div><div class="acts"><button class="btn sm" onclick="editStudent(' + i + ')">แก้ไข</button>' + '<button class="btn sm" onclick="assignDialog(' + i + ')">' + (s.department_code ? 'ย้ายฝ่าย' : 'กำหนดฝ่าย') + '</button>' + (s.department_code ? '<button class="btn sm" onclick="clearSel(' + i + ')">ล้างฝ่าย</button>' : '') + '<button class="btn sm danger" onclick="delStudent(' + i + ')">ลบ</button></div></div>').join('') || '<div class="muted" style="padding:14px 0;text-align:center">ไม่พบนักศึกษา</div>';
}
async function saveStudent(e) {
  e.preventDefault();
  const r = await post('/camps/admin/students', { studentId: $('stId').value, name: $('stName').value, year: Number($('stYr').value), gender: $('stG').value });
  if (!r.ok) return toast(await errMsg(r), true);
  toast('บันทึกนักศึกษาแล้ว'); $('stForm').reset(); delete $('stYr').dataset.touched; delete $('stG').dataset.touched; loadStudentList();
}
function editStudent(i) { const s = students[i]; $('stId').value = s.student_id; $('stName').value = s.name; $('stYr').value = String(s.year); $('stG').value = s.gender; $('stYr').dataset.touched = '1'; $('stG').dataset.touched = '1'; $('stForm').scrollIntoView({ behavior: 'smooth', block: 'center' }); $('stName').focus(); }
async function delStudent(i) {
  const s = students[i]; if (!(await confirmDlg('ลบนักศึกษา?', s.name + ' (' + s.student_id + ') จะถูกลบออกจากรายชื่อและการลงทะเบียน', 'ลบ'))) return;
  const r = await post('/camps/admin/students/delete', { studentId: s.student_id });
  if (!r.ok) return toast(await errMsg(r), true); toast('ลบแล้ว'); loadStudentList();
}
async function clearSel(i) {
  const s = students[i]; if (!(await confirmDlg('ล้างการลงทะเบียน?', s.name + ' จะกลับไปเป็นยังไม่ลงทะเบียน และที่นั่งจะถูกคืน', 'ล้างการลงทะเบียน'))) return;
  const r = await post('/camps/admin/selections/clear', { studentId: s.student_id });
  if (!r.ok) return toast(await errMsg(r), true); toast('ล้างการลงทะเบียนแล้ว'); loadStudentList();
}
// read a CSV file in the browser (UTF-8, falling back to Thai Windows-874 for old Excel exports) and show it before importing
async function readCsvFile(e) {
  const f = e.target.files && e.target.files[0]; if (!f) return;
  if (f.size > 2 * 1024 * 1024) { toast('ไฟล์ใหญ่เกิน 2 MB', true); e.target.value = ''; return; }
  const buf = await f.arrayBuffer(); let text;
  try { text = new TextDecoder('utf-8', { fatal: true }).decode(buf); } catch (err) { try { text = new TextDecoder('windows-874').decode(buf); } catch (e2) { text = new TextDecoder().decode(buf); } }
  $('bulk').value = text; $('csvName').textContent = f.name + ' · ' + text.split(/\r?\n/).filter((l) => l.trim()).length + ' บรรทัด — ตรวจสอบแล้วกด "นำเข้า"'; e.target.value = '';
}
function downloadTemplate() {
  const csv = '\ufeffรหัสนักศึกษา,ชื่อ-นามสกุล,ชั้นปี,เพศ,ฝ่าย\r\n6740102220,สมชาย ใจดี,3,ชาย,ฝ่ายการสอน\r\n6840100001,สมหญิง รักเรียน,2,หญิง,\r\n';
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' })); a.download = 'camp-students-template.csv'; document.body.appendChild(a); a.click(); a.remove();
}
async function bulkImport() {
  const text = $('bulk').value.trim(); if (!text) return toast('เลือกไฟล์ CSV หรือวางรายชื่อก่อน', true);
  const btn = $('bulkBtn'); btn.disabled = true;
  try {
    const r = await post('/camps/admin/students/bulk', { text });
    if (!r.ok) return toast(await errMsg(r), true);
    const d = await r.json();
    $('bulkRes').innerHTML = '✓ เพิ่มใหม่ <b>' + d.added + '</b> · อัปเดต <b>' + d.updated + '</b>' + (d.assigned ? ' · ใส่เข้าฝ่าย <b>' + d.assigned + '</b>' + (d.overQuota ? ' (<span class="err">เกินโควตา ' + d.overQuota + ' ช่อง</span>)' : '') : '') + (d.errors.length ? ' · ข้าม <b>' + d.errors.length + '</b> แถว:<div class="err">' + d.errors.slice(0, 30).map((x) => 'บรรทัด ' + x.line + ': ' + esc(x.error) + ' — ' + esc(x.text)).join('<br>') + '</div>' : '');
    if (!d.errors.length) { $('bulk').value = ''; $('csvName').textContent = ''; }
    toast('นำเข้าเสร็จแล้ว'); loadStudentList();
  } finally { btn.disabled = false; }
}
async function exportCsv() {
  const r = await api('/camps/admin/students'); if (!r.ok) return toast(await errMsg(r), true);
  const list = (await r.json()).students || [];
  const q = (v) => '"' + String(v ?? '').replace(/"/g, '""') + '"';
  const csv = '﻿' + ['รหัสนักศึกษา,ชื่อ,ชั้นปี,เพศ,ฝ่าย'].concat(list.map((s) => [q(s.student_id), q(s.name), s.year, q(GL[s.gender]), q(s.department_name || '')].join(','))).join('\r\n');
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' })); a.download = 'camp-students.csv'; document.body.appendChild(a); a.click(); a.remove();
}

// ---------- start ----------
async function start() {
  renderNav();
  if (PAGE === 'student') { loadDepartments(); setInterval(() => { if (!document.hidden) loadDepartments(); }, 30000); }
  const authed = await initAuth();
  if (authed === 'redirect') return;
  if (authed) await loadMe(); else if (authReady) renderAcct();
}
window.addEventListener('DOMContentLoaded', start);
