// ฝ่ายบุคคล — students pick a department and register (Google sign-in, university email);
// admins manage roster (CSV import), quotas per year and gender, and registration state on separate pages.
const API = window.CAMPS_API || 'https://engedlru-api.stnetworld.workers.dev';
// This app has its OWN Auth0 application (SPA). Paste its Client ID here (see camps/README.md → "One Auth0 application per system").
const AUTH_DOMAIN = window.HR_AUTH0_DOMAIN || 'auth.litalkeducation.com', CLIENT_ID = window.HR_AUTH0_CLIENT_ID || 'PGqozL94LzOwstm4pD39W5kvalYRiK7w';
const HR_URL = location.origin + '/hr/';          // the HR app's single Auth0 callback + logout URL (its own Auth0 application)
const CONNECTION = 'google-oauth2';
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const YEARS = [1, 2, 3, 4];
const GENDERS = ['M', 'F'];
const GL = new Proxy({ M: 'ชาย', F: 'หญิง' }, { get: (t, k) => t[k] || 'ไม่ระบุเพศ' });   // legacy rows may have no gender yet
const PAGE = document.body.dataset.page || 'student';   // 'student' (/hr/) or 'admin' (/hr/overview, /hr/quota, ...)
const TAB = document.body.dataset.tab || 'overview';
const PROFILE = PAGE === 'student' && TAB === 'profile';    // /hr/: my card (photo, names, ids, QR)
const SHIRT = PAGE === 'student' && TAB === 'shirt';        // /hr/shirt: upload a shirt design + vote (hr/shirt.js)
const AKA = PAGE === 'student' && TAB === 'aka';            // /hr/aka: nickname + AKA
const SELECT = PAGE === 'student' && TAB === 'select';      // /hr/select: quick pick from a dropdown
const CHOOSE = PAGE === 'student' && TAB === 'choose';      // /hr/choose: pick a department (heads only)     // which admin page this is
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
  pending: ['เร็วๆ นี้', 'ค่ายมี 5 ฝ่าย ดูหน้าที่และจำนวนที่รับไว้ก่อน แล้วรอวันเปิดลงทะเบียน'],
  open: ['เปิดลงทะเบียน', 'แตะฝ่ายที่สนใจ ดูที่ว่างของแต่ละชั้นปี แล้วกดลงทะเบียน'],
  closed: ['ปิดลงทะเบียนแล้ว', 'ปิดลงทะเบียนแล้ว ยังดูรายละเอียดของแต่ละฝ่ายได้']
};
const ADMIN_PAGES = [['overview', 'ภาพรวม', '/admin/#depts'], ['quota', 'โควตา', '/admin/#depts'], ['live', 'สด', '/admin/#dash'], ['students', 'นักศึกษา', '/admin/#students'], ['survey', 'แบบสำรวจ', '/admin/#survey'], ['shirt', 'เสื้อค่าย', '/admin/#shirt'], ['og', 'ตัวอย่างลิงก์', '/admin/#og'], ['maintenance', 'ปิดปรับปรุง', '/admin/#maint'], ['settings', 'ตั้งค่า', '/admin/#reg']];

let auth0Client = null, me = null, deps = [], state = 'pending', authReady = false, adminData = null;
let schedule = null, geo = { enabled: false }, srvOff = 0;   // automatic open/close schedule, location rule, server-clock offset (ms)
const withTimeout = (p, ms, msg) => Promise.race([p, new Promise((_, no) => setTimeout(() => no(new Error(msg)), ms))]);

// ---------- ui helpers ----------
let toastT;
function toast(msg, err) { const t = $('toast'); t.textContent = msg; t.className = (err ? 'err ' : '') + 'show'; clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 3400); }
// dialogs: named, focus moves in and stays in, Esc closes, focus goes back to where it was
let dlgN = 0;
function dlgA11y(d) {
  const prev = document.activeElement, box = d.querySelector('[role=dialog]'); if (!box) return;
  box.setAttribute('tabindex', '-1');
  const h = box.querySelector('h3,h2'); if (h) { h.id = h.id || ('dlgT' + (++dlgN)); box.setAttribute('aria-labelledby', h.id); }
  const items = () => [...box.querySelectorAll('button,[href],input,select,textarea,[tabindex]:not([tabindex="-1"])')].filter((e) => !e.disabled && e.offsetParent !== null);
  (box.querySelector('[data-r="1"],[data-pick],.btn.primary') || items()[0] || box).focus();
  d.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { const c = box.querySelector('[data-r="0"],[data-x]'); if (c) { e.preventDefault(); c.click(); } return; }
    if (e.key !== 'Tab') return;
    const f = items(); if (!f.length) { e.preventDefault(); return; }
    const first = f[0], last = f[f.length - 1];
    if (e.shiftKey && (document.activeElement === first || document.activeElement === box)) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  });
  const mo = new MutationObserver(() => { if (!document.body.contains(d)) { mo.disconnect(); try { if (prev && prev.focus) prev.focus(); } catch (x) { /* ignore */ } } });
  mo.observe(document.body, { childList: true });
}
function confirmDlg(title, text, okLabel, cancelLabel) {
  return new Promise((resolve) => {
    const d = document.createElement('div'); d.className = 'dlg';
    d.innerHTML = '<div class="box" role="dialog" aria-modal="true"><h3>' + esc(title) + '</h3><p>' + esc(text) + '</p><div class="btns"><button class="btn" data-r="0">' + esc(cancelLabel || 'ยกเลิก') + '</button><button class="btn primary" data-r="1">' + esc(okLabel || 'ยืนยัน') + '</button></div></div>';
    d.addEventListener('click', (e) => { const r = e.target.closest('[data-r]'); if (r || e.target === d) { d.remove(); resolve(!!r && r.dataset.r === '1'); } });
    document.body.appendChild(d); dlgA11y(d);
  });
}
const infoDlg = (title, text, okLabel) => confirmDlg(title, text, okLabel, 'ปิด');
function openDlg(html) {
  const d = document.createElement('div'); d.className = 'dlg';
  d.innerHTML = '<div class="box wide" role="dialog" aria-modal="true">' + html + '</div>';
  d.addEventListener('mousedown', (e) => { if (e.target === d) d.remove(); });
  document.body.appendChild(d); dlgA11y(d); return d;
}
const failBox = (msg, retry) => '<div class="failbox"><b>โหลดข้อมูลไม่สำเร็จ</b><p>' + esc(msg) + '</p><button class="btn primary sm" onclick="' + retry + '">ลองใหม่</button></div>';
async function errMsg(r) { try { const d = await r.json(); return d.error || ('เกิดข้อผิดพลาด (' + r.status + ')'); } catch (e) { return 'เกิดข้อผิดพลาด (' + r.status + ')'; } }
const gBtn = (label, fn) => '<button class="gbtn" onclick="' + fn + '">' + $('gicon').innerHTML + '<span>' + label + '</span></button>';
const zero = () => ({ M: { 1: 0, 2: 0, 3: 0, 4: 0 }, F: { 1: 0, 2: 0, 3: 0, 4: 0 } });

// ---------- api ----------
async function pub(path) { return fetch(API + path); }
// the session is gone (refresh token expired / revoked / signed out in another tab): the page must go back to the sign-in card
const AUTH_GONE = ['login_required', 'missing_refresh_token', 'invalid_grant', 'consent_required', 'interaction_required'];
const sessionGone = (e) => !!(e && (e.authGone || AUTH_GONE.includes(e.error)));
async function api(path, opt = {}) {
  const go = async (fresh) => {
    let t;
    try { t = await auth0Client.getTokenSilently(fresh ? { cacheMode: 'off' } : undefined); }
    catch (e) { if (sessionGone(e)) throw Object.assign(new Error('เข้าสู่ระบบหมดอายุ ลองเข้าใหม่อีกครั้ง'), { authGone: true }); throw e; }
    return fetch(API + path, { ...opt, headers: { ...(opt.headers || {}), Authorization: 'Bearer ' + t } });
  };
  let r = await go(false);
  if (r.status === 401) { try { r = await go(true); } catch (e) { if (e && e.authGone) throw e; /* otherwise fall through with the 401 */ } }
  return r;
}
const post = (path, body) => api(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) });

// ---------- auth ----------
let authError = '';
async function initAuth() {
  try {
    if (!window.auth0) throw new Error('โหลดหน้าเข้าสู่ระบบไม่สำเร็จ');
    auth0Client = await withTimeout(auth0.createAuth0Client({ domain: AUTH_DOMAIN, clientId: CLIENT_ID, cacheLocation: 'localstorage', useRefreshTokens: true, authorizationParams: { redirect_uri: HR_URL } }), 12000, 'เชื่อมต่อช้าเกินไป ลองใหม่อีกครั้ง');
    if (location.search.includes('code=') || location.search.includes('error=')) {
      let callbackResult;
      try { callbackResult = await withTimeout(auth0Client.handleRedirectCallback(), 12000, 'เข้าสู่ระบบช้าเกินไป ลองใหม่อีกครั้ง'); }
      finally { history.replaceState({}, document.title, location.pathname); }   // never leave ?code= / ?error= in the address bar (a reload would replay it)
      // Auth0 always lands on /hr/; go back to the HR page where sign-in started (appState first, then this tab's sessionStorage).
      let back = (callbackResult && callbackResult.appState && callbackResult.appState.returnTo) || '';
      if (!back) { try { back = sessionStorage.getItem('hrReturn'); sessionStorage.removeItem('hrReturn'); } catch (e) { /* ignore */ } }
      try { sessionStorage.removeItem('hrReturn'); } catch (e) { /* ignore */ }
      if (typeof back === 'string' && /^\/(hr|admin)\/[\w\-/]*$/.test(back) && back !== location.pathname) { location.replace(new URL(back, location.origin).href); return 'redirect'; }
    }
    authReady = true;
    return await auth0Client.isAuthenticated();
  } catch (e) { console.error(e); authReady = false; authError = e.error_description || e.message; renderAcct({ error: authError }); return null; }
}
async function login() {
  try { sessionStorage.setItem('hrReturn', location.pathname); } catch (e) { /* ignore */ }   // fallback if the Auth0 appState is lost
  const btns = document.querySelectorAll('.gbtn'); btns.forEach((b) => b.disabled = true);
  try {
    const ap = { connection: CONNECTION };
    try { if (sessionStorage.getItem('chooseGoogle')) { ap.prompt = 'select_account'; sessionStorage.removeItem('chooseGoogle'); } } catch (e) { /* ignore */ }
    await auth0Client.loginWithRedirect({ authorizationParams: ap, appState: { returnTo: location.pathname } });
  } catch (e) { btns.forEach((b) => b.disabled = false); toast(e.message || 'เข้าสู่ระบบไม่สำเร็จ', true); }
}
async function logout() { try { localStorage.removeItem('svMe'); } catch (e) { /* ignore */ } await auth0Client.logout({ logoutParams: { returnTo: HR_URL } }); }
async function switchAccount() { try { sessionStorage.setItem('chooseGoogle', '1'); } catch (e) { /* ignore */ } await logout(); }

// ---------- menu ----------
function renderNav() {
  const el = $('hrNav'); if (!el) return;
  if (PAGE === 'student' && TAB === 'survey') { el.innerHTML = ''; return; }   // /hr/survey has no menu
  // student pages and the admin section each have their own menu, with no links across
  if (PAGE === 'admin') { el.setAttribute('aria-label', 'เมนูแอดมิน'); el.innerHTML = !(me && me.isAdmin) ? '' : ADMIN_PAGES.map(([k, l, h]) => '<a href="' + h + '" class="' + (TAB === k ? 'on' : '') + '"' + (TAB === k ? ' aria-current="page"' : '') + '>' + l + '</a>').join(''); }
  else {
    const tabs = [['profile', '/hr/', 'ข้อมูลส่วนตัว'], ['departments', '/hr/departments', 'ภาพรวมฝ่าย'], ['aka', '/hr/aka', 'ตั้งชื่อ AKA'], ['shirt', '/hr/shirt', 'เสื้อค่าย'], ['choose', '/hr/choose', 'เลือกจากหัวหน้า'], ['select', '/hr/select', 'เลือกจากรายการ']];
    const cur = tabs.find((t) => t[0] === TAB) || tabs[0];
    const link = ([k, h, l]) => '<a href="' + h + '" class="' + (TAB === k ? 'on' : '') + '"' + (TAB === k ? ' aria-current="page"' : '') + '>' + l + '</a>';
    // wide screens: the row of links. Phones: an HTML dropdown (not the OS picker) that shows the current page and opens a panel of links
    el.innerHTML = tabs.map(link).join('')
      + '<div class="hrdd"><button type="button" class="hrdd-btn" aria-haspopup="true" aria-expanded="false" aria-controls="hrddList"><span>' + cur[2] + '</span><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg></button>'
      + '<div class="hrdd-list" id="hrddList" role="menu">' + tabs.map(([k, h, l]) => '<a role="menuitem" href="' + h + '"' + (TAB === k ? ' aria-current="page"' : '') + '>' + l + (TAB === k ? '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>' : '') + '</a>').join('') + '</div></div>';
    const dd = el.querySelector('.hrdd'), btn = dd.querySelector('.hrdd-btn'), setOpen = (o) => { dd.classList.toggle('open', o); btn.setAttribute('aria-expanded', o ? 'true' : 'false'); };
    btn.onclick = (e) => { e.stopPropagation(); setOpen(!dd.classList.contains('open')); };
    if (!window.__hrddBound) { window.__hrddBound = 1; document.addEventListener('click', (e) => { const d = document.querySelector('.hrdd.open'); if (d && !d.contains(e.target)) { d.classList.remove('open'); d.querySelector('.hrdd-btn').setAttribute('aria-expanded', 'false'); } }); document.addEventListener('keydown', (e) => { const d = document.querySelector('.hrdd.open'); if (e.key === 'Escape' && d) { d.classList.remove('open'); const b = d.querySelector('.hrdd-btn'); b.setAttribute('aria-expanded', 'false'); b.focus(); } }); }
  }
  const on = el.querySelector('a.on'); if (on) el.scrollLeft = Math.max(0, on.offsetLeft - (el.clientWidth - on.offsetWidth) / 2);   // keep the current item visible on narrow screens
}
function renderState() {
  const [chip, text] = STATE_TEXT[state] || STATE_TEXT.pending;
  const c = $('stateChip'); if (c) { c.textContent = chip; c.className = 'state-chip ' + state; }
  const t = $('heroText'); if (t && !t.dataset.static) t.textContent = text;
}

// ---------- my details (/hr/): Auth0 photo, names from D1, ids, QR of the student id ----------
function drawQR(canvas, text, size) {
  if (typeof qrcode !== 'function') return false;
  const q = qrcode(0, 'M'); q.addData(text); q.make();
  const n = q.getModuleCount(), quiet = 2, cell = Math.max(1, Math.floor(size / (n + quiet * 2))), px = cell * (n + quiet * 2);
  canvas.width = canvas.height = px; const x = canvas.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, px, px); x.fillStyle = '#171212';
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (q.isDark(r, c)) x.fillRect((c + quiet) * cell, (r + quiet) * cell, cell, cell);
  canvas.style.width = canvas.style.height = Math.min(px, size) + 'px'; return true;
}
const fmtNid = (v) => { const s = String(v || '').replace(/\D/g, ''); return s.length === 13 ? [s[0], s.slice(1, 5), s.slice(5, 10), s.slice(10, 12), s[12]].join(' ') : ''; };
let authPicture = '';
function expandQr() {
  const st = me && me.student; if (!st) return;
  const d = openDlg('<h3>QR Code · ' + esc(st.student_id) + '</h3><div class="qrbig"><canvas id="qrBig" role="img" aria-label="QR Code รหัสนักศึกษา ' + esc(st.student_id) + '"></canvas></div><p class="muted" style="text-align:center">' + esc(st.name) + '</p><div class="btns"><button class="btn primary" data-x>ปิด</button></div>');
  d.addEventListener('click', (e) => { if (e.target.closest('[data-x]')) d.remove(); });
  drawQR($('qrBig'), st.student_id, Math.min(360, Math.max(220, window.innerWidth - 80)));
}
const BLOODS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-', 'unknown'], DIETS = ['ฮาลาล', 'มังสวิรัติ', 'วีแกน', 'ไม่ทานหมู', 'ไม่ทานเนื้อวัว', 'ไม่ทานอาหารทะเล'];
const TH_MONTHS = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
// 2005-03-09 -> "9 มีนาคม 2548"
const fmtBirth = (v) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v || ''); return m ? (+m[3]) + ' ' + TH_MONTHS[+m[2] - 1] + ' ' + (+m[1] + 543) : ''; };
const fmtPhone = (v) => { const s = String(v || '').replace(/\D/g, ''); return s.length === 10 ? s.slice(0, 3) + '-' + s.slice(3, 6) + '-' + s.slice(6) : s.length === 9 ? s.slice(0, 2) + '-' + s.slice(2, 5) + '-' + s.slice(5) : s; };
// an HTML dropdown (instead of the OS picker) that opens in the flow of the form, so a scrolling dialog never clips it
function selHTML(id, label, opts, val) {
  const cur = opts.find((o) => o[0] === val) || opts[0];
  return '<div class="sel" data-sel="' + id + '"><span class="sel-lbl" id="' + id + 'L">' + label + '</span><button type="button" class="sel-btn" aria-haspopup="listbox" aria-expanded="false" aria-labelledby="' + id + 'L ' + id + 'V"><span id="' + id + 'V">' + esc(cur[1]) + '</span><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg></button>'
    + '<div class="sel-list" role="listbox" aria-labelledby="' + id + 'L">' + opts.map((o) => '<button type="button" role="option" class="sel-opt' + (o[0] === cur[0] ? ' on' : '') + '" data-v="' + esc(o[0]) + '" aria-selected="' + (o[0] === cur[0]) + '">' + esc(o[1]) + '</button>').join('') + '</div><input type="hidden" id="' + id + '" value="' + esc(cur[0]) + '"></div>';
}
function selBind(root, onPick) {
  root.querySelectorAll('.sel').forEach((box) => {
    const btn = box.querySelector('.sel-btn'), inp = box.querySelector('input[type=hidden]'), setOpen = (o) => { box.classList.toggle('open', o); btn.setAttribute('aria-expanded', o ? 'true' : 'false'); };
    btn.onclick = () => { const o = !box.classList.contains('open'); root.querySelectorAll('.sel.open').forEach((x) => { x.classList.remove('open'); x.querySelector('.sel-btn').setAttribute('aria-expanded', 'false'); }); setOpen(o); };
    box.querySelectorAll('.sel-opt').forEach((o) => { o.onclick = () => { inp.value = o.dataset.v; box.querySelector('.sel-btn span').textContent = o.textContent; box.querySelectorAll('.sel-opt').forEach((x) => { const on = x === o; x.classList.toggle('on', on); x.setAttribute('aria-selected', on ? 'true' : 'false'); }); setOpen(false); btn.focus(); if (onPick) onPick(inp.id, inp.value); }; });
  });
}
const fmtTyped = { nid: (v) => { const d = v.replace(/\D/g, '').slice(0, 13); return [d.slice(0, 1), d.slice(1, 5), d.slice(5, 10), d.slice(10, 12), d.slice(12)].filter(Boolean).join('-'); }, phone: (v) => (/^\s*\+/.test(v) ? v : (() => { const d = v.replace(/\D/g, '').slice(0, 10); return [d.slice(0, 3), d.slice(3, 6), d.slice(6)].filter(Boolean).join('-'); })()) };
function editProfile() {
  const st = me && me.student; if (!st) return;
  const akaOpen = !me.akaState || me.akaState === 'open';   // once an admin closes naming, nickname and AKA stay as they are
  const f = (id, label, attrs, req, span) => '<label class="' + (span ? 'span2' : '') + '" for="' + id + '"><span>' + label + (req === false ? '' : ' <em class="req" aria-hidden="true">*</em>') + '</span><input id="' + id + '" ' + (req === false ? '' : 'required aria-required="true" ') + attrs + '><span class="pferr" id="' + id + 'E" role="alert"></span></label>';
  const bloodOpts = [['', 'ไม่ระบุ']].concat(BLOODS.map((x) => [x, x === 'unknown' ? 'ไม่ทราบ' : x]));
  const dietOpts = [['', 'ยังไม่ระบุ'], ['ไม่มีข้อจำกัด', 'ไม่มีข้อจำกัด กินได้ทุกอย่าง']].concat(DIETS.map((x) => [x, x])).concat([['__other', 'อื่น ๆ (ระบุเอง)']]);
  const dietVal = st.diet && (DIETS.includes(st.diet) || st.diet === 'ไม่มีข้อจำกัด') ? st.diet : st.diet ? '__other' : '';
  const d = openDlg('<div class="pfdh"><h3>แก้ไขข้อมูลของฉัน</h3><p class="pfreq"><em class="req" aria-hidden="true">*</em> = ต้องกรอก' + (akaOpen ? '' : ' · ปิดรับการแก้ชื่อเล่น/AKA แล้ว') + '</p></div>'
    + '<form id="pfForm" class="pfform" autocomplete="off" novalidate><div class="pfdb">'
    + '<p class="pfsec">ข้อมูลที่แก้ไม่ได้ <span class="pfopt">ติดต่อแอดมินหากต้องแก้</span></p><div class="pfg pflock">' + [['รหัสนักศึกษา', st.student_id], ['ชั้นปี', 'ปี ' + st.year], ['เพศ', GL[st.gender]], ['ฝ่าย', (me.selection && me.selection.department_name) || 'ยังไม่ได้เลือก']].map((x) => '<label><span>' + x[0] + '</span><input value="' + esc(x[1]) + '" disabled aria-disabled="true"></label>').join('') + '</div>'
    + '<p class="pfsec">ชื่อ</p><div class="pfg">' + f('pfName', 'ชื่อ-นามสกุล (ไทย)', 'maxlength="200"', true, true) + f('pfNameEn', 'ชื่อ-สกุล (อังกฤษ)', 'maxlength="200" pattern="[A-Za-z][A-Za-z .\'\\-]*" title="ตัวอักษรภาษาอังกฤษเท่านั้น" placeholder="Somchai Jaidee" autocapitalize="words"', true, true)
    + f('pfNick', 'ชื่อเล่น', 'maxlength="30"' + (akaOpen ? '' : ' disabled'), akaOpen) + f('pfAka', 'ชื่อ AKA', 'maxlength="40"' + (akaOpen ? '' : ' disabled'), akaOpen) + '</div>'
    + '<p class="pfsec">ข้อมูลส่วนตัว</p><div class="pfg">' + f('pfBirth', 'วันเกิด', 'type="date" min="1900-01-01" max="' + new Date().toISOString().slice(0, 10) + '"') + f('pfNid', 'รหัสบัตรประชาชน 13 หลัก', 'inputmode="numeric" maxlength="17" pattern="[0-9 \\-]{13,17}" title="ตัวเลข 13 หลัก" placeholder="x-xxxx-xxxxx-xx-x"')
    + f('pfPhone', 'เบอร์โทรศัพท์', 'type="tel" inputmode="tel" maxlength="16" pattern="[0-9+ \\-()]{9,16}" title="ตัวเลข 9–10 หลัก ขึ้นต้นด้วย 0" placeholder="08x-xxx-xxxx"') + f('pfGPhone', 'เบอร์ผู้ปกครอง', 'type="tel" inputmode="tel" maxlength="16" pattern="[0-9+ \\-()]{9,16}" title="ตัวเลข 9–10 หลัก ขึ้นต้นด้วย 0" placeholder="08x-xxx-xxxx"') + '</div>'
    + '<p class="pfsec">สุขภาพและอาหาร <span class="pfopt">ไม่บังคับกรอก</span></p><p class="pfnote">ใช้ดูแลเรื่องอาหารและความปลอดภัยในค่ายเท่านั้น เห็นได้เฉพาะคุณและแอดมิน การกรอกข้อมูลในหมวดนี้ถือเป็นการยินยอมตาม <a href="/legal/privacy" target="_blank" rel="noopener">นโยบายความเป็นส่วนตัว</a> ล้างช่องเพื่อถอนความยินยอมได้</p><div class="pfg">'
    + selHTML('pfBlood', 'กรุ๊ปเลือด', bloodOpts, st.blood_type || '') + selHTML('pfDiet', 'วิธีการกิน', dietOpts, dietVal)
    + '<div id="pfDietOW" class="span2 ' + (dietVal === '__other' ? '' : 'hidden') + '">' + f('pfDietO', 'ระบุวิธีการกิน', 'maxlength="100"', false) + '</div>'
    + f('pfAllergy', 'แพ้อาหาร', 'maxlength="300" placeholder="เช่น กุ้ง ถั่วลิสง นมวัว"', false, true) + f('pfMedical', 'โรคประจำตัว / ยาที่ใช้ประจำ', 'maxlength="300" placeholder="เช่น หอบหืด ภูมิแพ้"', false, true) + '</div>'
    + '</div><div class="pfdf"><button class="btn" type="button" data-x>ยกเลิก</button><button class="btn primary" type="submit">บันทึก</button></div></form>');
  d.firstElementChild.classList.add('pfbox');
  $('pfName').value = st.name || ''; $('pfNameEn').value = st.name_en || ''; $('pfNick').value = st.nickname || ''; $('pfAka').value = st.aka || ''; $('pfBirth').value = st.birth_date || '';
  $('pfNid').value = fmtNid(st.national_id).replace(/ /g, '-') || ''; $('pfPhone').value = fmtPhone(st.phone) || ''; $('pfGPhone').value = fmtPhone(st.guardian_phone) || '';
  $('pfAllergy').value = st.food_allergy || ''; $('pfMedical').value = st.medical || ''; if (dietVal === '__other') $('pfDietO').value = st.diet;
  selBind(d, (id, v) => { dirty = true; if (id === 'pfDiet') { $('pfDietOW').classList.toggle('hidden', v !== '__other'); if (v === '__other') $('pfDietO').focus(); } });
  // type-ahead formatting for the id card and phone numbers
  const fmtOn = (id, fn) => { $(id).addEventListener('input', () => { const v = $(id).value, o = fn(v); if (o !== v) $(id).value = o; }); };
  fmtOn('pfNid', fmtTyped.nid); fmtOn('pfPhone', fmtTyped.phone); fmtOn('pfGPhone', fmtTyped.phone);
  let dirty = false; d.querySelector('form').addEventListener('input', () => { dirty = true; });
  // a tap on the backdrop must not throw away typed changes
  d.addEventListener('mousedown', (e) => { if (e.target === d && dirty) e.stopImmediatePropagation(); }, true);
  d.addEventListener('click', async (e) => { if (e.target.closest('[data-x]')) { if (dirty && !(await confirmDlg('ทิ้งการแก้ไข?', 'ข้อมูลที่แก้ไว้จะไม่ถูกบันทึก', 'ทิ้ง'))) return; d.remove(); } });
  const FIELD = { name: 'pfName', nameEn: 'pfNameEn', nickname: 'pfNick', aka: 'pfAka', birthDate: 'pfBirth', nationalId: 'pfNid', phone: 'pfPhone', guardianPhone: 'pfGPhone', bloodType: 'pfBlood' };
  const clearErr = () => d.querySelectorAll('.pferr').forEach((x) => { x.textContent = ''; x.parentElement.classList.remove('bad'); }); 
  const showErr = (id, msg) => { const inp = $(id); if (!inp) return false; const e = $(id + 'E'); if (e) { e.textContent = msg; inp.parentElement.classList.add('bad'); } inp.setAttribute('aria-invalid', 'true'); inp.scrollIntoView({ block: 'center', behavior: 'smooth' }); if (inp.focus) inp.focus({ preventScroll: true }); return true; };
  $('pfForm').addEventListener('submit', async (e) => {
    e.preventDefault(); clearErr();
    const bad = [...d.querySelectorAll('#pfForm input[required]')].find((i) => !i.disabled && !i.validity.valid);
    if (bad) { showErr(bad.id, bad.validity.valueMissing ? 'กรุณากรอกช่องนี้' : (bad.title || 'รูปแบบไม่ถูกต้อง')); return; }
    const btn = e.submitter; if (btn) btn.disabled = true;
    try {
      const r = await post('/camps/me/profile', { name: $('pfName').value, nameEn: $('pfNameEn').value, nickname: $('pfNick').value, aka: $('pfAka').value, birthDate: $('pfBirth').value, nationalId: $('pfNid').value, phone: $('pfPhone').value, guardianPhone: $('pfGPhone').value, bloodType: $('pfBlood').value, diet: $('pfDiet').value === '__other' ? $('pfDietO').value.trim() : $('pfDiet').value, foodAllergy: $('pfAllergy').value, medical: $('pfMedical').value });
      if (!r.ok) { let j = {}; try { j = await r.json(); } catch (x) { /* keep empty */ } const msg = j.error || ('เกิดข้อผิดพลาด (' + r.status + ')'); if (!(j.field && FIELD[j.field] && showErr(FIELD[j.field], msg))) toast(msg, true); return; }
      dirty = false; d.remove(); toast('บันทึกแล้ว'); await loadMe();
    } catch (x) { toast(sessionGone(x) ? 'เข้าสู่ระบบหมดอายุ ลองเข้าใหม่' : 'เชื่อมต่อไม่ได้ ลองใหม่อีกครั้ง', true); }
    finally { if (btn) btn.disabled = false; }
  });
}
function renderProfile() {
  const box = $('profile'); if (!box) return;
  if (!me) { box.innerHTML = ''; return; }
  const st = me.student;
  if (!st) {
    box.innerHTML = '<div class="card acct"><div class="row">' + (authPicture ? '<img class="pfimg sm" src="' + esc(authPicture) + '" alt="" referrerpolicy="no-referrer">' : '<div class="avatar">' + esc((me.googleName || me.email || '?').trim()[0].toUpperCase()) + '</div>') + '<div><h2>' + esc(me.googleName || me.email) + '</h2><div class="meta">' + esc(me.email) + '</div></div></div>'
      + (me.reason && REASONS[me.reason] ? '<div class="warn">' + REASONS[me.reason](me) + '</div>' : '') + '<div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn primary sm" onclick="switchAccount()">ใช้บัญชี Google อื่น</button><button class="btn sm" onclick="logout()">ออกจากระบบ</button></div></div>';
    return;
  }
  const init = esc((st.name || '?').replace(/^(นางสาว|นาย|นาง)\s*/, '').trim()[0] || '?');
  const dep = me.selection && me.selection.department_name;
  document.body.classList.add('pf-in');   // the account chip and back link are redundant here (the menu bar and the card say the same)
  // sensitive values start hidden (last digits only); the eye button shows them for a short while
  const hide = (str, keep) => { let n = 0; return String(str).split('').reverse().map((c) => (/\d/.test(c) ? (n++ < keep ? c : '•') : c)).reverse().join(''); };
  const sec = (k, v, keep, cls) => v ? '<div class="pf' + (cls ? ' ' + cls : '') + '"><span>' + k + '</span><b data-full="' + esc(v) + '" data-mask="' + esc(hide(v, keep)) + '">' + esc(hide(v, keep)) + '</b></div>' : '';
  const secText = (k, v, cls) => '<div class="pf' + (cls ? ' ' + cls : '') + '"><span>' + k + '</span><b data-full="' + esc(v) + '" data-mask="••••••">••••••</b></div>';
  const row = (k, v, cls) => '<div class="pf' + (cls ? ' ' + cls : '') + '"><span>' + k + '</span><b>' + esc(v) + '</b></div>';
  const add = (k, label, href, wide) => (href ? '<a class="pf pfadd' + (wide ? ' wide' : '') + '" href="' + href + '">' : '<button type="button" class="pf pfadd' + (wide ? ' wide' : '') + '" onclick="editProfile()">') + '<span>' + k + '</span><b>+ ' + label + '</b>' + (href ? '</a>' : '</button>');
  const phone = fmtPhone(st.phone), gphone = fmtPhone(st.guardian_phone), nid = fmtNid(st.national_id);
  const penIc = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4z"/></svg>';
  const eyeIc = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>';
  box.innerHTML = '<div class="card idcard">'
    + '<div class="pfhead">' + (authPicture ? '<img class="pfimg" src="' + esc(authPicture) + '" alt="รูปโปรไฟล์ของ ' + esc(st.name) + '" referrerpolicy="no-referrer" onerror="this.replaceWith(Object.assign(document.createElement(\'span\'),{className:\'pfimg ph\',textContent:\'' + init + '\'}))">' : '<span class="pfimg ph" aria-hidden="true">' + init + '</span>')
    + '<div class="pfwho"><h2>' + esc(st.name) + (me.isAdmin ? ' <span class="pill admin">แอดมิน</span>' : '') + '</h2>' + (st.name_en ? '<div class="pfen">' + esc(st.name_en) + '</div>' : '')
    + '<div class="chips"><span class="chip">ชั้นปี ' + st.year + '</span><span class="chip">' + GL[st.gender] + '</span>' + (dep ? '<span class="chip dep">' + esc(dep) + '</span>' : '') + '</div></div></div>'
    + '<button class="btn pfeditbtn" type="button" onclick="editProfile()">' + penIc + '<span>แก้ไขข้อมูล</span></button>'
    + '<div class="qrbox"><button type="button" class="qrbtn" onclick="expandQr()" aria-label="ขยาย QR Code รหัสนักศึกษา"><canvas id="qrSmall"></canvas></button><div class="qrnote"><span class="qrlbl">QR รหัสนักศึกษา</span><b class="qrid">' + esc(st.student_id) + '</b><button class="btn sm" type="button" onclick="expandQr()">ขยาย QR</button></div></div>'
    + '<div class="pfhrow"><h3 class="pfh">ข้อมูลส่วนตัว</h3><button type="button" class="pfeye" id="pfEye" aria-pressed="false" aria-label="แสดงข้อมูลที่ซ่อนไว้" title="แสดง / ซ่อนข้อมูลสำคัญ">' + eyeIc + '</button></div><div class="pfgrid">'
    + (st.nickname ? row('ชื่อเล่น', st.nickname) : add('ชื่อเล่น', 'เพิ่มชื่อเล่น')) + (st.aka ? row('ชื่อ AKA', st.aka) : add('ชื่อ AKA', 'ตั้งชื่อ AKA', '/hr/aka'))
    + row('วันเกิด', fmtBirth(st.birth_date) || '—', 'wide') + (phone ? sec('เบอร์โทรศัพท์', phone, 4) : add('เบอร์โทรศัพท์', 'เพิ่มเบอร์')) + (gphone ? sec('เบอร์ผู้ปกครอง', gphone, 4) : add('เบอร์ผู้ปกครอง', 'เพิ่มเบอร์'))
    + (nid ? sec('รหัสบัตรประชาชน 13 หลัก', nid, 3, 'wide nid') : '') + '</div>'
    + '<div class="pfhrow"><h3 class="pfh">ข้อมูลประจำตัว</h3></div><div class="pfgrid">'
    + (dep ? row('ฝ่าย', dep, 'wide') : add('ฝ่าย', 'เลือกฝ่าย', '/hr/choose', true))
    + (st.blood_type ? row('กรุ๊ปเลือด', st.blood_type === 'unknown' ? 'ไม่ทราบ' : st.blood_type) : add('กรุ๊ปเลือด', 'เพิ่ม')) + (st.diet ? row('วิธีการกิน', st.diet) : add('วิธีการกิน', 'เพิ่ม'))
    + (st.food_allergy ? row('แพ้อาหาร', st.food_allergy, 'wide') : add('แพ้อาหาร', 'เพิ่ม', '', true)) + (st.medical ? secText('โรคประจำตัว', st.medical, 'wide') : add('โรคประจำตัว', 'เพิ่ม', '', true)) + '</div>'
    + '</div><div class="pfact"><button class="btn sm" onclick="logout()">ออกจากระบบ</button></div>';
  let eyeT = 0; const eye = $('pfEye');
  const setEye = (on) => { clearTimeout(eyeT); eye.setAttribute('aria-pressed', on ? 'true' : 'false'); eye.classList.toggle('on', on); box.querySelectorAll('[data-full]').forEach((el) => { el.textContent = on ? el.dataset.full : el.dataset.mask; }); if (on) eyeT = setTimeout(() => setEye(false), 20000); };
  eye.onclick = () => setEye(eye.getAttribute('aria-pressed') !== 'true');
  drawQR($('qrSmall'), st.student_id, 168);
}

// ---------- /hr/aka: nickname + camp name (moved here from /aka/) ----------
let akaInfo = null;
const AKA_CHIP = { open: ['เปิดรับการตั้งชื่อ', 'open'], pending: ['ยังไม่เปิด', ''], closed: ['ปิดรับแล้ว', 'closed'] };
async function loadAka() {
  const box = $('akaBox'); if (!box) return;
  try { const r = await api('/camps/aka/me'); if (!r.ok) throw new Error(await errMsg(r)); akaInfo = await r.json(); }
  catch (e) { if (sessionGone(e)) { me = null; renderAcct(); renderGate(); return; } box.innerHTML = failBox(e.message || 'เชื่อมต่อไม่ได้', 'loadAka()'); return; }
  renderAka();
}
function renderAka() {
  const box = $('akaBox'), x = akaInfo; if (!box || !x) return;
  const chip = AKA_CHIP[x.state] || AKA_CHIP.closed, c = $('stateChip'); if (c) { c.textContent = chip[0]; c.className = 'state-chip ' + chip[1]; }
  if (x.reason || !x.student) { box.innerHTML = '<div class="card acct"><div class="warn">' + esc(({ not_university_email: 'ต้องใช้อีเมลมหาวิทยาลัย (@lru.ac.th)', email_not_verified: 'อีเมลนี้ยังไม่ได้ยืนยันกับ Google', not_in_roster: 'ไม่พบรหัสของคุณในรายชื่อ แจ้งแอดมินให้เพิ่ม' })[x.reason] || 'ไม่พบข้อมูลนักศึกษา') + '</div><button class="btn primary sm" onclick="switchAccount()">ใช้บัญชี Google อื่น</button></div>'; return; }
  const s = x.student, open = x.state === 'open';
  const banner = open ? '<div class="warn akaok"><b>ตั้งชื่อได้แล้ว</b> แก้ไขได้จนกว่าจะปิดรับ</div>' : x.state === 'pending' ? '<div class="warn"><b>ยังไม่เปิดรับ</b> รอถึงเวลา แล้วกลับมาตั้งชื่อได้เลย</div>' : '<div class="warn"><b>ปิดรับแล้ว</b> ถ้าอยากแก้ชื่อ ให้แจ้งแอดมิน</div>';
  box.innerHTML = banner + '<form id="akaForm" class="card acct" novalidate><div class="meta">' + esc(s.name) + ' · ' + esc(s.studentId) + (s.departmentName ? ' · ' + esc(s.departmentName) : '') + '</div>'
    + '<div class="form"><label>ชื่อเล่น<input id="akaNick" maxlength="30" autocomplete="off" placeholder="เช่น ชาย"' + (open ? '' : ' disabled') + '></label><label>ชื่อ AKA<input id="akaName" maxlength="40" autocomplete="off" placeholder="เช่น หมีขาว"' + (open ? '' : ' disabled') + '></label></div>'
    + '<div class="nametag" aria-live="polite"><div class="nt-top">Hello · เรียกฉันว่า</div><div class="nt-body" id="akaPrev"></div></div>'
    + (open ? '<button id="akaSave" class="btn primary" type="submit">บันทึกชื่อ</button>' : '') + '<p class="muted" id="akaSaved">' + (s.updatedAt ? 'บันทึกล่าสุด ' + esc(new Date(String(s.updatedAt).replace(' ', 'T') + 'Z').toLocaleString('th-TH')) : 'ยังไม่ได้ตั้งชื่อ') + '</p></form>';
  $('akaNick').value = s.nickname || ''; $('akaName').value = s.aka || '';
  const prev = () => { const a = $('akaName').value.trim(), n = $('akaNick').value.trim(); $('akaPrev').innerHTML = '<div class="nt-aka' + (a ? '' : ' ph') + '">' + esc(a || 'AKA ของคุณ') + '</div><div class="nt-nick">' + (n ? 'ชื่อเล่น ' + esc(n) : 'ชื่อเล่นของคุณ') + '</div>'; };
  prev(); $('akaNick').oninput = $('akaName').oninput = prev;
  $('akaForm').onsubmit = async (e) => {
    e.preventDefault(); const nickname = $('akaNick').value.trim(), aka = $('akaName').value.trim();
    if (!nickname) { $('akaNick').focus(); return toast('กรอกชื่อเล่น', true); }
    if (!aka) { $('akaName').focus(); return toast('กรอกชื่อ AKA', true); }
    $('akaSave').disabled = true;
    try {
      const r = await post('/camps/aka/save', { nickname, aka });
      if (!r.ok) { const m = await errMsg(r); toast(m, true); await loadAka(); return; }
      const d = await r.json(); akaInfo.student = d.student; renderAka(); toast('บันทึกชื่อแล้ว');
    } catch (er) { toast(sessionGone(er) ? 'เข้าสู่ระบบหมดอายุ ลองเข้าใหม่' : 'เชื่อมต่อไม่ได้ ลองใหม่อีกครั้ง', true); const b = $('akaSave'); if (b) b.disabled = false; }
  };
}

// ---------- account card (student page) ----------
const REASONS = {
  not_university_email: (m) => 'บัญชี Google นี้ (' + esc(m.email) + ') ไม่ใช่อีเมลมหาวิทยาลัย ลองเข้าสู่ระบบด้วยอีเมล @lru.ac.th',
  email_not_verified: (m) => 'อีเมล ' + esc(m.email) + ' ยังไม่ได้ยืนยันกับ Google',
  no_gender: () => 'ในรายชื่อยังไม่มีเพศของคุณ แจ้งแอดมินให้เพิ่มให้หน่อย',
  not_in_roster: (m) => 'ไม่พบรหัสนักศึกษา ' + esc(m.studentId || '') + ' ในรายชื่อของค่าย แจ้งแอดมินให้เพิ่มรหัส ชั้นปี และเพศของคุณ'
};
// who is signed in, shown at the top of every HR page
function renderUserChip(x) {
  const el = $('userChip'); if (!el) return;
  if ((x && x.error) || (!authReady && !me)) { el.innerHTML = ''; return; }
  if (!me) { el.innerHTML = '<button class="chipbtn" onclick="login()">เข้าสู่ระบบ</button>'; return; }
  const st = me.student, name = st ? st.name : (me.googleName || me.email);
  const dep = me.selection && deps.find((d) => d.code === me.selection.department_code);
  const sub = (st ? 'ปี ' + st.year + ' · ' + GL[st.gender] + ' · ' + st.student_id : me.email) + (dep ? ' · ' + dep.name : '');
  el.innerHTML = '<div class="uc"><span class="avatar sm">' + esc((name || '?').trim()[0].toUpperCase()) + '</span><div class="ut"><b>' + esc(name) + (me.isAdmin ? ' <span class="pill admin">แอดมิน</span>' : '') + '</b><small>' + esc(sub) + '</small></div><button class="chipbtn" onclick="logout()" aria-label="ออกจากระบบ">ออก</button></div>';
}
function renderAcct(x) {
  renderUserChip(x);
  const box = $('acct');
  if (!box) { if (PROFILE || AKA || SHIRT) { const pb = $(PROFILE ? 'profile' : AKA ? 'akaBox' : 'shirtBox'); if (pb && (!me || (x && x.error))) pb.innerHTML = '<div class="card acct">' + (x && x.error ? '<div class="warn">' + esc(x.error) + '</div><button class="btn primary sm" onclick="location.reload()">ลองใหม่</button>' : '<h2>เข้าสู่ระบบ</h2><p class="meta">ใช้อีเมลมหาวิทยาลัย (@lru.ac.th)</p>' + gBtn('เข้าสู่ระบบด้วย Google', 'login()') + '<p class="gatelegal">เมื่อเข้าสู่ระบบ ถือว่ารับทราบ <a href="/legal/terms" target="_blank" rel="noopener">ข้อกำหนดการใช้งาน</a> และ <a href="/legal/privacy" target="_blank" rel="noopener">นโยบายความเป็นส่วนตัว</a></p>') + '</div>'; return; } if (x && x.error) renderAdmin(x); else if (!me) renderAdmin(); return; }
  if (x && x.error) { box.innerHTML = '<div class="warn">' + esc(x.error) + '</div><button class="btn primary sm" onclick="location.reload()">ลองใหม่</button>'; return; }
  if (!me) {
    box.innerHTML = '<h2>เข้าสู่ระบบเพื่อลงทะเบียน</h2><p class="meta">ใช้อีเมลมหาวิทยาลัย (@lru.ac.th)</p>' + gBtn('เข้าสู่ระบบด้วย Google', 'login()') + '<p class="gatelegal">เมื่อเข้าสู่ระบบ ถือว่ารับทราบ <a href="/legal/terms" target="_blank" rel="noopener">ข้อกำหนดการใช้งาน</a> และ <a href="/legal/privacy" target="_blank" rel="noopener">นโยบายความเป็นส่วนตัว</a></p>';
    return;
  }
  const adminPill = me.isAdmin ? ' <span class="pill admin">แอดมิน</span>' : '';
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

const headOf = (d) => (d.head && d.head.name) || '';
const photoUrl = (d) => (d.head && d.head.photo ? API + '/camps/department-photo/' + encodeURIComponent(d.code) + '?v=' + d.head.photo : '');
const avatar = (d, cls) => photoUrl(d) ? '<img class="hav ' + (cls || '') + '" src="' + photoUrl(d) + '" alt="' + esc(headOf(d) || 'หัวหน้าฝ่าย') + '" loading="lazy" decoding="async">' : '<span class="hav ph ' + (cls || '') + '" aria-hidden="true">' + (headOf(d) ? esc([...headOf(d).replace(/^(นางสาว|นาย|นาง|ครู|อาจารย์|อ\.|ดร\.|ผศ\.|รศ\.|ศ\.)\s*/, '')][0] || '?') : '?') + '</span>';
function yrsHtml(d) {
  const my = myYear(), mg = myGender();
  return YEARS.map((y) => '<div class="yr' + (y === my ? ' mine' : '') + '"><span class="yl">ปี ' + y + (y === my ? ' (คุณ)' : '') + '</span>' + GENDERS.map((g) => {
    const q = d.quota[g][y], f = d.filled[g][y], st = slot(q, f);
    return '<div class="gr ' + st.c + (y === my && g === mg ? ' me' : '') + '"><span class="gn">' + GL[g] + '</span><b>' + (q ? f + '/' + q : '–') + '</b><span class="st ' + st.c + '" title="' + esc(st.note) + '">' + st.t + (st.c === 'off' && st.note !== 'ปิดลงทะเบียน' ? ' · ' + (q ? 'เต็ม' : 'ไม่รับ') : '') + '</span></div>';
  }).join('') + '</div>').join('');
}
const mySlot = (d) => { const y = myYear(), g = myGender(); return y && g ? slot(d.quota[g][y], d.filled[g][y]) : null; };
function deptCard(d) {
  const reg = myDept() === d.code, pk = picked === d.code, st = mySlot(d), h = d.head || {};
  const tag = reg ? '<span class="tag ok">✓ ลงทะเบียนแล้ว</span>' : (pk ? '<span class="tag pick">เลือกอยู่</span>' : '');
  return '<div class="dept pickable ' + (TONE[d.code] || '') + (reg ? ' mine' : '') + (pk ? ' picked' : '') + '" role="button" tabindex="0" aria-label="ดูรายละเอียด ' + esc(d.name) + '" onclick="preview(\'' + d.code + '\')" onkeydown="if(event.key===\'Enter\'||event.key===\' \'){event.preventDefault();preview(\'' + d.code + '\')}">'
    + '<div class="top"><div class="icon">' + svg(ICON[d.code] || ICON.direction) + '</div><div class="grow"><h3>' + esc(d.name) + '</h3><p>' + esc(d.description) + '</p></div>' + tag + '</div>'
    + '<div class="dfoot"><span class="hd">หัวหน้าฝ่าย <b>' + (h.name ? esc(h.name) : 'ยังไม่ประกาศ') + '</b></span>' + (st ? '<span class="st ' + st.c + '">' + esc(st.note) + '</span>' : '<span class="more">ดูรายละเอียด ›</span>') + '</div></div>';
}
// /hr/select: one dropdown + register button (no browsing)
function renderSelect() {
  const box = $('depts'); if (!box) return;
  const reg = myDept(), regDep = reg && deps.find((d) => d.code === reg), y = myYear(), g = myGender();
  const sel = $('selDept'), cur = sel ? sel.value : (picked || '');
  const slotOf = (d) => (y ? slot(d.quota[g][y], d.filled[g][y]) : null);
  const opts = deps.map((d) => { const st = slotOf(d), full = st && st.c === 'off' && state === 'open'; return '<option value="' + d.code + '"' + (full && d.code !== reg ? ' disabled' : '') + (d.code === cur ? ' selected' : '') + '>' + esc(d.name) + (st && state === 'open' ? ' — ' + esc(st.note) : '') + (d.code === reg ? ' (ของคุณ)' : '') + '</option>'; }).join('');
  const d = deps.find((x) => x.code === cur), h = (d && d.head) || {}, st = d ? slotOf(d) : null;
  const blocked = d && st && st.c !== 'on' ? st.note : '';
  const info = d ? '<div class="selinfo ' + (TONE[d.code] || '') + '">' + avatar(d, 'lg') + '<div><b>' + esc(d.name) + '</b><p>' + esc(d.description) + '</p><p class="muted">หัวหน้าฝ่าย: <b>' + (h.name ? esc(h.name) : 'ยังไม่ประกาศ') + '</b>' + (h.contact ? ' · ' + esc(h.contact) : '') + '</p>' + (st ? '<p class="muted">ชั้นปี ' + y + ' ' + GL[g] + ': ' + esc(st.note) + '</p>' : '') + '</div></div>' : '';
  const label = state === 'pending' ? 'ยังไม่เปิดลงทะเบียน' : state === 'closed' ? 'ปิดลงทะเบียนแล้ว' : blocked ? 'ลงทะเบียนไม่ได้ (' + blocked + ')' : (regDep && d && d.code !== reg ? 'เปลี่ยนเป็นฝ่ายนี้' : 'ลงทะเบียน');
  box.innerHTML = '<div class="card selbox">' + (regDep ? '<div class="selreg">✓ ลงทะเบียนแล้ว: <b>' + esc(regDep.name) + '</b>' + (state === 'open' ? ' <button class="btn sm" type="button" onclick="unselect()">ยกเลิก</button>' : '') + '</div>' : '')
    + '<label class="sellbl" for="selDept">เลือกฝ่าย</label><select id="selDept"><option value="">— เลือกฝ่ายที่ต้องการ —</option>' + opts + '</select>' + info
    + '<button id="selBtn" class="btn primary" type="button" ' + (!d || (reg && d.code === reg) || blocked || state !== 'open' ? 'disabled' : '') + '>' + (d && reg === d.code ? 'คุณลงทะเบียนฝ่ายนี้แล้ว' : label) + '</button></div>';
  $('selDept').onchange = (e) => { setPicked(e.target.value || null); renderSelect(); };
  $('selBtn').onclick = () => register();
}
// /hr/choose shows only the head of each department
function headCard(d) {
  const reg = myDept() === d.code, pk = picked === d.code, h = d.head || {};
  const tag = reg ? '<span class="tag ok">✓ ลงทะเบียนแล้ว</span>' : (pk ? '<span class="tag pick">เลือกอยู่</span>' : '');
  return '<div class="dept pickable headcard ' + (TONE[d.code] || '') + (reg ? ' mine' : '') + (pk ? ' picked' : '') + '" role="button" tabindex="0" aria-label="' + esc(d.name) + ' หัวหน้าฝ่าย ' + esc(h.name || 'ยังไม่ประกาศ') + '" onclick="preview(\'' + d.code + '\')" onkeydown="if(event.key===\'Enter\'||event.key===\' \'){event.preventDefault();preview(\'' + d.code + '\')}">' + tag + avatar(d, 'xl') + '<div class="hn"><span class="dn">' + esc(d.name) + '</span><span class="hl">หัวหน้าฝ่าย</span><b>' + (h.name ? esc(h.name) : 'ยังไม่ประกาศ') + '</b>' + '</div><div class="more">' + (reg ? 'ดูรายละเอียด ›' : 'เลือกฝ่ายนี้ ›') + '</div></div>';
}
// preview first: tap a department card -> details, head and slots; switch between departments with the chips; then "เลือกฝ่ายนี้"
let pvDlg = null;
function preview(code) {
  if (pvDlg) pvDlg.remove();
  pvDlg = openDlg('<div id="pvBody"></div>'); pvDlg.classList.add('pv');
  const close = () => { if (pvDlg) { pvDlg.remove(); pvDlg = null; } document.removeEventListener('keydown', esc2); };
  const esc2 = (e) => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', esc2);
  pvDlg.addEventListener('mousedown', (e) => { if (e.target === pvDlg) close(); });
  const draw = (c) => {
    const d = deps.find((x) => x.code === c); if (!d) return;
    const reg = myDept() === d.code, y = myYear(), g = myGender(), st = y ? slot(d.quota[g][y], d.filled[g][y]) : null;
    const head = d.head || {};
    $('pvBody').innerHTML = '<div class="pvchips" role="tablist">' + deps.map((x) => '<button type="button" role="tab" aria-selected="' + (x.code === c) + '" class="' + (x.code === c ? 'on' : '') + '" data-c="' + x.code + '">' + esc(x.name.replace(/^ฝ่าย/, '')) + '</button>').join('') + '</div>'
      + '<div class="pvhead ' + (TONE[d.code] || '') + '"><div class="icon">' + svg(ICON[d.code] || ICON.direction) + '</div><div><h3>' + esc(d.name) + '</h3>' + (reg ? '<span class="tag ok">✓ คุณลงทะเบียนฝ่ายนี้แล้ว</span>' : '') + '</div></div>'
      + '<div class="pvsec"><b>หน้าที่ของฝ่าย</b><p>' + esc(d.description) + '</p></div>'
      + '<div class="pvsec"><b>หัวหน้าฝ่าย</b>' + '<div class="pvperson">' + avatar(d, 'lg') + '<div>' + (head.name ? '<p class="pvhd">' + esc(head.name) + '</p>' + (head.contact ? '<p class="muted">ติดต่อ: ' + esc(head.contact) + '</p>' : '') : '<p class="muted">ยังไม่ประกาศ</p>') + '</div></div></div>'
      + '<div class="pvsec"><b>ที่ว่าง</b>' + (st ? '<p class="pvslot ' + st.c + '">ชั้นปี ' + y + ' ' + GL[g] + ' ของคุณ: <b>' + esc(st.note) + '</b></p>' : '') + '<details class="pvall"><summary>ดูทุกชั้นปี</summary><div class="yrs">' + yrsHtml(d) + '</div></details></div>'
      + '<div class="btns"><button class="btn" data-x>ปิด</button>' + (reg ? '' : '<button class="btn primary" data-pick="' + d.code + '">' + (!CHOOSE ? 'ไปเลือกฝ่ายนี้ ›' : picked === d.code ? '✓ เลือกฝ่ายนี้อยู่' : 'เลือกฝ่ายนี้') + '</button>') + '</div>';
    { const t = $('pvBody').querySelector('.pvhead h3'); if (t) { t.id = 'pvTitle'; const bx = pvDlg.querySelector('[role=dialog]'); bx.setAttribute('aria-labelledby', 'pvTitle'); if (!bx.contains(document.activeElement) || document.activeElement === bx) { const f = $('pvBody').querySelector('[data-pick],[data-x]'); if (f) f.focus(); } } }
    const act = $('pvBody').querySelector('.pvchips .on'); if (act && act.scrollIntoView) act.scrollIntoView({ block: 'nearest', inline: 'center' });
  };
  pvDlg.addEventListener('click', (e) => {
    const t = e.target.closest('button'); if (!t) return;
    if (t.dataset.c) draw(t.dataset.c);
    else if (t.hasAttribute('data-x')) close();
    else if (t.dataset.pick && !CHOOSE) { setPicked(t.dataset.pick); location.href = '/hr/choose'; }
    else if (t.dataset.pick) { setPicked(t.dataset.pick); close(); renderDepts(); const d = deps.find((x) => x.code === t.dataset.pick); toast('เลือก' + (d ? d.name : 'ฝ่าย') + 'แล้ว กด "ลงทะเบียน" ด้านล่างเพื่อยืนยัน'); }
  });
  draw(code);
}
function renderSummary() {
  const box = $('sumBox'); if (!deps.length || !box) return;
  const y = myYear(), g = myGender();
  if (!y || !g) { box.classList.add('hidden'); return; }   // admins without a student record: nothing personal to show
  box.classList.remove('hidden');
  const q = deps.reduce((a, d) => a + d.quota[g][y], 0), f = deps.reduce((a, d) => a + d.filled[g][y], 0), left = Math.max(0, q - f), pct = q ? Math.min(100, Math.round(f / q * 100)) : 0;
  box.innerHTML = '<h2>ที่ว่างของคุณ</h2><p class="sumline">ชั้นปี ' + y + ' · ' + GL[g] + '</p><div class="bigleft"><b>' + left + '</b><span>ที่ว่างทั้งค่าย จากทั้งหมด ' + q + ' ที่</span></div><div class="prog" aria-hidden="true"><i style="width:' + pct + '%"></i></div>';
}
function renderDepts() { if (!$('depts')) return; if (SELECT) { renderSelect(); renderSummary(); return; } $('depts').innerHTML = deps.map(CHOOSE ? headCard : deptCard).join(''); renderSummary(); renderBar(); }
function pick(code) { setPicked(picked === code ? null : code); renderDepts(); }

// bottom bar: choose a department first, then press ลงทะเบียน (sign-in happens at that point)
function renderBar() {
  const bar = $('bar'); if (!bar) return;
  if (!CHOOSE) { bar.classList.add('hidden'); return; }
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
  if (!auth0Client || !me) return;
  try { r = await api('/camps/departments'); } catch (e) { if (sessionGone(e)) { me = null; renderAcct(); renderGate(); return; } if (!deps.length) $('depts').innerHTML = failBox('เชื่อมต่อไม่ได้ ตรวจสอบอินเทอร์เน็ตแล้วลองใหม่', 'loadDepartments()'); return; }
  if (r.status === 401) { me = null; renderAcct(); renderGate(); return; }
  if (!r.ok) { if (!deps.length) $('depts').innerHTML = failBox(await errMsg(r), 'loadDepartments()'); return; }
  const d = await r.json(); deps = d.departments || []; state = d.registration || 'pending'; applyInfo(d);
  renderState(); renderDepts(); if (me) renderAcct();
}
// ---------- schedule countdown + location rule (student pages and the admin hero) ----------
function applyInfo(d) {
  if (d.schedule) schedule = d.schedule;
  if (d.geo) geo = d.geo;
  if (typeof d.now === 'number') srvOff = d.now - Date.now();
  renderState(); renderCountdown(); renderGeoNote();
}
const pad2 = (n) => String(n).padStart(2, '0');
let cdFired = 0;
function renderCountdown() {
  const host = document.querySelector('.hero-body'); if (!host) return;
  let box = $('cdBox');
  if (!box) { box = document.createElement('div'); box.id = 'cdBox'; box.className = 'cdbox hidden'; box.setAttribute('role', 'timer'); host.appendChild(box); }
  const now = Date.now() + srvOff, s = schedule;
  let target = null, label = '';
  if (s && s.enabled) {
    if (s.openAt != null && now < s.openAt) { target = s.openAt; label = 'เปิดลงทะเบียนในอีก'; }
    else if (s.closeAt != null && now < s.closeAt) { target = s.closeAt; label = 'ปิดรับลงทะเบียนในอีก'; }
  }
  if (target == null) { box.classList.add('hidden'); return; }
  const left = Math.max(0, Math.ceil((target - now) / 1000)), d = Math.floor(left / 86400), h = Math.floor(left % 86400 / 3600), m = Math.floor(left % 3600 / 60), sec = left % 60;
  const cells = (d ? [[d, 'วัน']] : []).concat([[pad2(h), 'ชม.'], [pad2(m), 'นาที'], [pad2(sec), 'วินาที']]);
  box.classList.remove('hidden'); box.classList.toggle('closing', label.startsWith('ปิด'));
  const html = '<span class="cdl">' + label + '</span><span class="cdn">' + cells.map(([v, u]) => '<b>' + v + '<small>' + u + '</small></b>').join('') + '</span>';
  if (box.dataset.h !== html) { box.dataset.h = html; box.innerHTML = html; }
  if (left === 0 && cdFired !== target) { cdFired = target; setTimeout(refreshAfterCountdown, 700 + jitter(2500)); }   // the clock hit zero: pick up the new state from the server
}
function refreshAfterCountdown() {
  if (PAGE === 'student') { if (me) { loadDepartments(); loadMe(); } } else if (me && me.isAdmin) loadAdminPage();
}
setInterval(() => { if (schedule && schedule.enabled) renderCountdown(); }, 1000);
function renderGeoNote() {
  const host = document.querySelector('.hero-body'); if (!host || PAGE !== 'student') return;
  let el = $('geoBox');
  if (!geo.enabled) { if (el) el.remove(); return; }
  if (!el) { el = document.createElement('div'); el.id = 'geoBox'; el.className = 'geobox'; host.appendChild(el); }
  el.innerHTML = '<span aria-hidden="true">📍</span><span>ลงทะเบียนได้เมื่ออยู่ในรัศมี <b>' + esc(geo.radius) + ' เมตร</b>' + (geo.name ? ' จาก <b>' + esc(geo.name) + '</b>' : ' จากสถานที่ลงทะเบียน') + ' (ตอนกดลงทะเบียน เครื่องจะขอใช้ตำแหน่ง)</span>';
}
function getPosition() {
  return new Promise((res, rej) => {
    if (!navigator.geolocation) return rej({ code: 0 });
    navigator.geolocation.getCurrentPosition(res, rej, { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 });
  });
}
async function loadMe() {
  let r;
  try { r = await api(PAGE === 'student' ? '/camps/me' : '/camps/me?admin=1'); } catch (e) { if (sessionGone(e)) { me = null; renderAcct(); renderGate(); return; } if (PAGE === 'student' && TAB === 'survey' && svOfflineBoot()) return; renderAcct({ error: 'เชื่อมต่อไม่ได้ ตรวจสอบอินเทอร์เน็ตแล้วลองใหม่' }); renderGate({ error: 'เชื่อมต่อไม่ได้ ตรวจสอบอินเทอร์เน็ตแล้วลองใหม่' }); return; }
  if (r.status === 401) { me = null; renderAcct(); renderGate(); return; }
  if ((r.status === 429 || r.status >= 500) && (loadMe.tries = (loadMe.tries || 0) + 1) <= 4) { setTimeout(loadMe, 1500 * loadMe.tries + jitter(2000)); return; }   // busy right now: try again by itself
  if (!r.ok) { const m = await errMsg(r); renderAcct({ error: m }); renderGate({ error: m }); return; }
  try { const u = await auth0Client.getUser(); authPicture = (u && /^https:\/\//.test(u.picture || '')) ? u.picture : ''; } catch (e) { authPicture = ''; }
  loadMe.tries = 0; const wasAdmin = !!(me && me.isAdmin); me = await r.json(); if (me.adminDeferred && wasAdmin) me.isAdmin = true; state = me.registration || state; renderState(); renderAcct(); renderNav();
  if (PROFILE) { ungate(); renderProfile(); checkAdminLater(); return; }
  if (AKA) { ungate(); loadAka(); checkAdminLater(); return; }
  if (SHIRT) { ungate(); loadShirt(); checkAdminLater(); return; }
  if (PAGE === 'student' && TAB === 'survey') { ungate(); loadSurveyMe(); return; }   // hr/survey.js
  if (PAGE === 'student') { ungate(); await loadDepartments(); startPolling(); checkAdminLater(); } else { renderDepts(); renderAdmin(); }
  if (PAGE === 'student') resumeAfterLogin();
}
// student pages show nothing until the visitor has signed in with Google
function renderGate(x) {
  if (PAGE !== 'student') return;
  document.body.classList.add('gated');
  let g = $('gate'); if (!g) { g = document.createElement('div'); g.id = 'gate'; g.className = 'card acct gate'; const m = document.querySelector('main'); m.insertBefore(g, m.firstChild); }
  if (x && x.loading) { g.innerHTML = '<div class="skeleton" style="height:90px"></div>'; return; }
  if (x && x.error) { g.innerHTML = '<h2>เข้าใช้งานไม่ได้ชั่วคราว</h2><div class="warn">' + esc(x.error) + '</div><button class="btn primary sm" onclick="location.reload()">ลองใหม่</button>'; return; }
  g.innerHTML = '<h2>เข้าสู่ระบบก่อน</h2><p class="meta">เข้าสู่ระบบด้วยอีเมลมหาวิทยาลัย (@lru.ac.th) เพื่อ' + (TAB === 'survey' ? 'กรอกแบบสำรวจโรงเรียนที่ได้รับมอบหมาย' : PROFILE ? 'ดูบัตรและ QR Code ของคุณ' : AKA ? 'ตั้งชื่อเล่นและ AKA' : SHIRT ? 'ส่งผลงานและโหวตเสื้อค่าย' : 'ดูฝ่ายและลงทะเบียน') + '</p>' + gBtn('เข้าสู่ระบบด้วย Google', 'login()') + '<p class="gatelegal">เมื่อเข้าสู่ระบบ ถือว่ารับทราบ <a href="/legal/terms" target="_blank" rel="noopener">ข้อกำหนดการใช้งาน</a> และ <a href="/legal/privacy" target="_blank" rel="noopener">นโยบายความเป็นส่วนตัว</a></p>';
}
function ungate() { document.body.classList.remove('gated'); const g = $('gate'); if (g) g.remove(); }
let polling = false;
const jitter = (ms) => Math.round(Math.random() * ms);
// poll only while registration is open, every 45-60 s per person (not all at once)
function startPolling() { if (polling) return; polling = true; const tick = () => { if (!document.hidden && me && state === 'open') loadDepartments(); setTimeout(tick, 45000 + jitter(15000)); }; setTimeout(tick, 45000 + jitter(15000)); }
// students: check the admin role a few seconds later, spread out, so the first screen never waits for it
function checkAdminLater() { if (!me || !me.adminDeferred) return; setTimeout(async () => { try { const r = await api('/camps/me?admin=1'); if (r.ok) { const j = await r.json(); if (j.isAdmin) { me.isAdmin = true; renderNav(); renderAcct(); renderProfile(); } } } catch (e) {} }, 3000 + jitter(9000)); }
async function register() {
  const d = deps.find((x) => x.code === picked); if (!d) return;
  if (!authReady) return toast('เข้าสู่ระบบไม่ได้ในตอนนี้ ลองรีเฟรชหน้า', true);
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
  const body = { departmentCode: d.code };
  if (geo.enabled) {
    toast('กำลังตรวจสอบตำแหน่งของคุณ…');
    try { const p = await getPosition(); body.lat = p.coords.latitude; body.lng = p.coords.longitude; body.accuracy = p.coords.accuracy; }
    catch (e) {
      const msg = e && e.code === 1 ? 'ยังใช้ตำแหน่งของคุณไม่ได้ ลองอนุญาตให้เว็บนี้ใช้ตำแหน่งในการตั้งค่า แล้วกดลงทะเบียนอีกครั้ง'
        : e && e.code === 0 ? 'เครื่องนี้ระบุตำแหน่งไม่ได้'
        : 'หาตำแหน่งไม่เจอ ลองไปที่โล่งหรือเปิด GPS แล้วกดอีกครั้ง';
      await infoDlg('ตรวจสอบตำแหน่งไม่ได้', msg, 'ตกลง'); return;
    }
  }
  const r = await post('/camps/select', body);
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
const NO_PERM = (m) => '<div class="card acct"><h2>ไม่มีสิทธิ์แอดมิน</h2><div class="warn">บัญชี ' + esc(m.email) + ' ยังไม่มีสิทธิ์แอดมินฝ่ายบุคคล ลองขอสิทธิ์จากแอดมิน</div><div class="act" style="display:flex;gap:8px;flex-wrap:wrap"><a class="btn primary sm" href="/hr/">กลับไปหน้าลงทะเบียน</a><button class="btn sm" onclick="switchAccount()">ใช้บัญชี Google อื่น</button></div></div>';
function renderAdmin(x) {
  const box = $('adminBox'); if (!box) return;
  if (x && x.error) { box.innerHTML = '<div class="card acct"><div class="warn">' + esc(x.error) + '</div><button class="btn primary sm" onclick="location.reload()">ลองใหม่</button></div>'; return; }
  if (!me) { box.innerHTML = '<div class="card acct"><h2>เข้าสู่ระบบ</h2><p class="meta">เข้าสู่ระบบด้วยอีเมลที่มีสิทธิ์แอดมิน</p>' + gBtn('เข้าสู่ระบบด้วย Google', 'login()') + '<p class="gatelegal">เมื่อเข้าสู่ระบบ ถือว่ารับทราบ <a href="/legal/terms" target="_blank" rel="noopener">ข้อกำหนดการใช้งาน</a> และ <a href="/legal/privacy" target="_blank" rel="noopener">นโยบายความเป็นส่วนตัว</a></p></div>'; return; }
  if (!me.isAdmin) { box.innerHTML = NO_PERM(me); return; }
  box.innerHTML = '<h2 class="sr">เมนูแอดมิน</h2><div id="adminBody"><div class="skeleton"></div></div>';
  loadAdminPage();
}
async function loadAdminPage() {
  const body = $('adminBody');
  if (TAB === 'students') return loadStudents();
  if (TAB === 'survey') return loadSurvey();   // hr/survey.js
  if (TAB === 'og') return loadOg();   // hr/og.js
  if (TAB === 'shirt') return loadShirtAdmin();   // hr/shirt.js
  if (TAB === 'maintenance') return loadMaintenanceAdmin();   // hr/maintenance.js
  if (TAB === 'live') return startLive();
  let r;
  try { r = await api('/camps/admin/overview'); } catch (e) { if (sessionGone(e)) { me = null; renderAdmin(); renderUserChip(); return; } body.innerHTML = failBox('เชื่อมต่อไม่ได้ ตรวจสอบอินเทอร์เน็ตแล้วลองใหม่', 'loadAdminPage()'); return; }
  if (!r.ok) { body.innerHTML = failBox(await errMsg(r), 'loadAdminPage()'); return; }
  adminData = await r.json(); state = adminData.registration; applyInfo(adminData);
  if (TAB === 'overview') renderOverview(); else if (TAB === 'quota') renderQuota(); else renderSettings();
}
const cell = (d, g, y) => { const q = d.quota[g][y], f = d.filled[g][y]; return '<div class="gc' + (q > 0 && f >= q ? ' full' : '') + '"><span>' + GL[g].replace('ชาย', 'ช').replace('หญิง', 'ญ') + '</span> ' + f + '/' + q + '</div>'; };
function renderOverview() {
  const a = adminData, sumG = (g) => YEARS.reduce((s, y) => s + (a.students[g][y] || 0), 0), total = sumG('M') + sumG('F');
  const rows = a.departments.map((d) => '<tr><td><b>' + esc(d.name) + '</b></td>' + YEARS.map((y) => '<td>' + GENDERS.map((g) => cell(d, g, y)).join('') + '</td>').join('') + '<td>' + GENDERS.map((g) => { const q = YEARS.reduce((s, y) => s + d.quota[g][y], 0), f = YEARS.reduce((s, y) => s + d.filled[g][y], 0); return '<div class="gc"><span>' + (g === 'M' ? 'ช' : 'ญ') + '</span> ' + f + '/' + q + '</div>'; }).join('') + '</td></tr>').join('');
  $('adminBody').innerHTML = '<div class="panel"><h3>ลงทะเบียนแล้ว / โควตา (ช = ชาย · ญ = หญิง)</h3><div class="tbl-wrap" tabindex="0" role="region" aria-label="ตารางลงทะเบียนแล้วต่อโควตา"><table><thead><tr><th>ฝ่าย</th>' + YEARS.map((y) => '<th>ปี ' + y + '</th>').join('') + '<th>รวม</th></tr></thead><tbody>' + rows + '</tbody></table></div></div>'
    + '<div class="panel"><h3>นักศึกษาในรายชื่อ</h3><div class="tbl-wrap" tabindex="0" role="region" aria-label="ตารางจำนวนนักศึกษาในรายชื่อ"><table><thead><tr><th><span class="sr">เพศ</span></th>' + YEARS.map((y) => '<th>ปี ' + y + '</th>').join('') + '<th>รวม</th></tr></thead><tbody>' + GENDERS.map((g) => '<tr><td><b>' + GL[g] + '</b></td>' + YEARS.map((y) => '<td>' + (a.students[g][y] || 0) + '</td>').join('') + '<td><b>' + sumG(g) + '</b></td></tr>').join('') + '</tbody></table></div><p class="muted" style="margin-top:10px">รวม <b>' + total + '</b> คน · ลงทะเบียนแล้ว <b>' + a.selectedTotal + '</b> คน (ยังไม่ลงทะเบียน ' + Math.max(0, total - a.selectedTotal) + ')</p><div style="margin-top:10px"><button class="btn sm" onclick="exportDialog(\'all\')">ส่งออกรายชื่อ (Excel / PDF)…</button></div></div>'
    + '<div class="panel" id="regList"><h3>ผู้ลงทะเบียนแต่ละฝ่าย</h3><div class="skeleton"></div></div>';
  loadRegList();
}
// names of everyone registered, grouped by department, year and gender (admins only); admins can add / remove names by hand
const openReg = new Set(); let allStudents = [];
async function loadRegList() {
  const box = $('regList'); if (!box) return;
  let r; try { r = await api('/camps/admin/students'); } catch (e) { box.innerHTML = '<h3>ผู้ลงทะเบียนแต่ละฝ่าย</h3>' + failBox('เชื่อมต่อไม่ได้ ตรวจสอบอินเทอร์เน็ตแล้วลองใหม่', 'loadRegList()'); return; }
  if (!r.ok) { box.innerHTML = '<h3>ผู้ลงทะเบียนแต่ละฝ่าย</h3>' + failBox(await errMsg(r), 'loadRegList()'); return; }
  allStudents = (await r.json()).students || [];
  box.innerHTML = '<h3>ผู้ลงทะเบียนแต่ละฝ่าย</h3><div class="filerow" style="margin:0 0 8px"><button class="btn sm primary" type="button" onclick="exportRegXlsx()">ส่งออก Excel (แยกฝ่าย)</button><button class="btn sm primary" type="button" onclick="exportRegPdf()">ส่งออก PDF (แยกฝ่าย)</button></div><p class="muted" style="margin:-4px 0 8px">แอดมินเพิ่มหรือนำชื่อออกจากฝ่ายเองได้</p>' + adminData.departments.map((d) => {
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
  let r; try { r = await api('/camps/admin/overview'); } catch (e) { return toast('เชื่อมต่อไม่ได้ ตรวจสอบอินเทอร์เน็ตแล้วลองใหม่', true); }
  if (!r.ok) return toast(await errMsg(r), true);
  adminData = await r.json();
  const opts = adminData.departments.map((x) => { const q = x.quota[s.gender][s.year], f = x.filled[s.gender][s.year], cur = s.department_code === x.code; return '<option value="' + x.code + '"' + (cur ? ' selected' : '') + '>' + esc(x.name) + ' — ปี ' + s.year + ' ' + GL[s.gender] + ' ' + f + '/' + q + (q && f >= q ? ' (เต็ม)' : !q ? ' (ไม่รับ)' : '') + (cur ? ' · ปัจจุบัน' : '') + '</option>'; }).join('');
  const d = openDlg('<h3>กำหนดฝ่าย</h3><p><b>' + esc(s.name) + '</b><br><span class="muted">' + esc(s.student_id) + ' · ปี ' + s.year + ' · ' + GL[s.gender] + '</span></p><label class="fld">ฝ่าย<select id="asDept">' + opts + '</select></label><label class="chk"><input type="checkbox" id="asForce"> เพิ่มแม้ฝ่ายเต็มโควตา</label><div class="btns"><button class="btn" data-x>ยกเลิก</button><button class="btn primary" id="asOk">กำหนดฝ่าย</button></div>');
  d.querySelector('[data-x]').onclick = () => d.remove();
  $('asOk').onclick = async () => { $('asOk').disabled = true; const ok = await doAssign($('asDept').value, [s.student_id], $('asForce').checked); if (ok) { d.remove(); loadStudentList(); } else $('asOk').disabled = false; };
}
function renderQuota() {
  $('adminBody').innerHTML = '<p class="muted" style="margin:0 4px 10px">กำหนดจำนวนที่รับของแต่ละฝ่าย แยก <b>ชาย / หญิง</b> และชั้นปี (0 = ไม่เปิดรับ) ตั้งต่ำกว่าจำนวนที่มีคนลงทะเบียนแล้วไม่ได้</p><div class="qgrid">' + adminData.departments.map((d) =>
    '<div class="panel"><h3>' + esc(d.name) + '</h3><div class="qm"><div class="qh"></div>' + YEARS.map((y) => '<div class="qh">ปี ' + y + '</div>').join('') + GENDERS.map((g) => '<div class="qg">' + GL[g] + '</div>' + YEARS.map((y) => '<label class="qc"><input type="number" inputmode="numeric" min="0" max="9999" id="q-' + d.code + '-' + g + '-' + y + '" value="' + d.quota[g][y] + '"><span>ลงแล้ว ' + d.filled[g][y] + '</span></label>').join('')).join('') + '</div><div class="qact"><button class="btn primary sm" onclick="saveQuota(\'' + d.code + '\')">บันทึกโควตา</button><button class="btn sm" onclick="copyQuota(\'' + d.code + '\')">คัดลอกค่า ชาย → หญิง</button></div></div>').join('') + '</div>';
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
  const s = adminData.manual || adminData.registration, auto = adminData.schedule && adminData.schedule.enabled;
  const opts = [['pending', 'เร็วๆ นี้'], ['open', 'เปิดลงทะเบียน'], ['closed', 'ปิดลงทะเบียน']];
  $('adminBody').innerHTML = '<div class="panel"><h3>สถานะการลงทะเบียน</h3><div class="seg">' + opts.map(([k, l]) => '<button class="' + (s === k ? 'on' : '') + '" onclick="setState(\'' + k + '\')">' + l + '</button>').join('') + '</div><p class="muted" style="margin-top:10px">เร็วๆ นี้ = แสดงป้ายยังไม่เปิด · เปิดลงทะเบียน = นักศึกษาลงทะเบียน/เปลี่ยนฝ่ายได้ · ปิดลงทะเบียน = ล็อกทั้งหมด (แอดมินยังล้างการลงทะเบียนรายคนได้)</p>' + (auto ? '<div class="warn" style="margin-top:10px">กำลังตั้งเวลาเปิด–ปิดอยู่ ปุ่มด้านบนจึงยังไม่ทำงาน หยุดตั้งเวลาก่อนถึงจะใช้ได้</div>' : '') + '</div>' + schedulePanel() + geoPanel() + depInfoPanel();
  bindSettings();
}
// local <input type="datetime-local"> value <-> epoch ms
const toLocalInput = (ms) => (ms == null ? '' : new Date(ms - new Date(ms).getTimezoneOffset() * 60000).toISOString().slice(0, 16));
const fromLocalInput = (v) => (v ? new Date(v).getTime() : null);
const fmtWhen = (ms) => new Date(ms).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'medium' });
function schedulePanel() {
  const sc = adminData.schedule || {}, cd = sc.mode === 'countdown';
  return '<div class="panel" id="schedPanel"><h3>ตั้งเวลาเปิด–ปิดลงทะเบียน</h3><p class="muted" style="margin-bottom:8px">ตั้งวันเวลาเปิด–ปิดลงทะเบียนไว้ล่วงหน้า นักศึกษาจะเห็นเวลาที่เหลือด้านบนของหน้า ระหว่างตั้งเวลา ปุ่มเปิด/ปิดด้านบนจะไม่ทำงาน</p>'
    + '<div class="schedstate" id="schedState"></div>'
    + '<div class="seg" style="margin:10px 0"><button type="button" id="scModeDT" class="' + (cd ? '' : 'on') + '">กำหนดวันที่และเวลา</button><button type="button" id="scModeCD" class="' + (cd ? 'on' : '') + '">นับถอยหลัง</button></div>'
    + '<div id="scDT" class="' + (cd ? 'hidden' : '') + '"><div class="form cols"><label>เปิดลงทะเบียนเมื่อ<input type="datetime-local" id="scOpen" value="' + toLocalInput(cd ? null : sc.openAt) + '"></label><label>ปิดลงทะเบียนเมื่อ<input type="datetime-local" id="scClose" value="' + toLocalInput(cd ? null : sc.closeAt) + '"></label></div><p class="muted">ไม่ใส่เวลาเปิด = เปิดเลย · ไม่ใส่เวลาปิด = ไม่ปิดเอง (ใช้เวลาตามเครื่องของคุณ)</p></div>'
    + '<div id="scCD" class="' + (cd ? '' : 'hidden') + '"><div class="form cols"><label>เริ่มเปิดในอีก (ชั่วโมง)<input type="number" id="cdInH" min="0" max="2160" placeholder="0"></label><label>และ (นาที)<input type="number" id="cdInM" min="0" max="59" placeholder="0"></label><label>เปิดรับนาน (ชั่วโมง)<input type="number" id="cdForH" min="0" max="2160" placeholder="ว่าง = ไม่ปิด"></label><label>และ (นาที)<input type="number" id="cdForM" min="0" max="59" placeholder="0"></label></div><p class="muted">กด "เริ่มนับถอยหลัง" แล้วนับเวลาจากตอนนี้ (ใส่ 0 = เปิดเลย) ปิดหน้านี้ไปแล้วก็ยังเปิด–ปิดตามเวลา</p></div>'
    + '<div class="qact"><button class="btn primary sm" type="button" id="scSave">' + (cd ? 'เริ่มนับถอยหลัง' : 'บันทึกและเปิดใช้') + '</button>' + (sc.enabled ? '<button class="btn sm" type="button" id="scStop">หยุดตั้งเวลา</button>' : '') + '</div></div>';
}
function geoPanel() {
  const g = adminData.geo || {};
  return '<div class="panel" id="geoPanel"><h3>ตรวจสอบตำแหน่งก่อนลงทะเบียน</h3><p class="muted" style="margin-bottom:8px">นักศึกษาต้องอยู่ในรัศมีที่ตั้งจากจุดนี้ถึงจะลงทะเบียนได้ (คลาดเคลื่อนได้เล็กน้อย) ตำแหน่งมาจากโทรศัพท์ของนักศึกษา จึงเป็นเพียงการกันเบื้องต้น</p>'
    + '<label class="chk" style="margin:6px 0"><input type="checkbox" id="geoOn"' + (g.enabled ? ' checked' : '') + '> เปิดการตรวจสอบตำแหน่ง</label>'
    + '<div class="form cols"><label>ชื่อสถานที่ (แสดงให้นักศึกษาเห็น)<input id="geoName" maxlength="120" value="' + esc(g.name || '') + '" placeholder="เช่น โรงเรียนบ้านตัวอย่าง"></label><label>ละติจูด<input type="number" id="geoLat" step="any" min="-90" max="90" value="' + (g.lat ?? '') + '" placeholder="16.700000"></label><label>ลองจิจูด<input type="number" id="geoLng" step="any" min="-180" max="180" value="' + (g.lng ?? '') + '" placeholder="101.250000"></label><label>รัศมี (เมตร)<input type="number" id="geoRad" min="10" max="100000" step="1" value="' + (g.radius ?? 200) + '"></label></div>'
    + '<div class="qact"><button class="btn sm" type="button" id="geoHere">ใช้ตำแหน่งปัจจุบันของฉัน</button><a class="btn sm" id="geoMap" target="_blank" rel="noopener" href="#">เปิดดูใน Google Maps</a><button class="btn primary sm" type="button" id="geoSave">บันทึก</button></div></div>';
}
function bindSettings() {
  const upd = () => {
    const sc = adminData.schedule || {}, el = $('schedState'); if (!el) return;
    const now = Date.now() + srvOff;
    let t = 'ยังไม่ได้ตั้งเวลา';
    if (sc.enabled) {
      t = 'กำลังตั้งเวลา · ตอนนี้ ' + ({ pending: 'ยังไม่เปิด', open: 'เปิดลงทะเบียน', closed: 'ปิดลงทะเบียนแล้ว' }[adminData.registration] || '') + (sc.openAt != null ? ' · เปิด ' + fmtWhen(sc.openAt) : '') + (sc.closeAt != null ? ' · ปิด ' + fmtWhen(sc.closeAt) : '');
    } else if (sc.openAt != null || sc.closeAt != null) t += ' (มีเวลาที่ตั้งไว้ครั้งก่อน)';
    el.textContent = t; el.className = 'schedstate' + (sc.enabled ? ' on' : '');
    const lat = $('geoLat') && Number($('geoLat').value), lng = $('geoLng') && Number($('geoLng').value), a = $('geoMap');
    if (a) { const okc = $('geoLat').value !== '' && $('geoLng').value !== '' && Number.isFinite(lat) && Number.isFinite(lng); a.href = okc ? 'https://www.google.com/maps?q=' + lat + ',' + lng : '#'; a.classList.toggle('off', !okc); a.setAttribute('aria-disabled', okc ? 'false' : 'true'); }
  };
  upd(); ['geoLat', 'geoLng'].forEach((id) => $(id).addEventListener('input', upd));
  const mode = (cd) => { $('scModeDT').classList.toggle('on', !cd); $('scModeCD').classList.toggle('on', cd); $('scDT').classList.toggle('hidden', cd); $('scCD').classList.toggle('hidden', !cd); $('scSave').textContent = cd ? 'เริ่มนับถอยหลัง' : 'บันทึกและเปิดใช้'; };
  $('scModeDT').onclick = () => mode(false); $('scModeCD').onclick = () => mode(true);
  const saveSched = async (payload, msg) => {
    const r = await post('/camps/admin/schedule', payload);
    if (!r.ok) return toast(await errMsg(r), true);
    toast(msg); await loadAdminPage();
  };
  $('scSave').onclick = async () => {
    const cd = $('scModeCD').classList.contains('on');
    if (cd) {
      const inSec = (Number($('cdInH').value) || 0) * 3600 + (Number($('cdInM').value) || 0) * 60;
      const forRaw = $('cdForH').value !== '' || $('cdForM').value !== '', forSec = (Number($('cdForH').value) || 0) * 3600 + (Number($('cdForM').value) || 0) * 60;
      if (forRaw && forSec < 10) return toast('ระยะเวลาที่เปิดรับต้องมากกว่า 10 วินาที', true);
      return saveSched({ enabled: true, mode: 'countdown', startInSec: inSec, durationSec: forRaw ? forSec : null }, 'เริ่มนับถอยหลังแล้ว');
    }
    const openAt = fromLocalInput($('scOpen').value), closeAt = fromLocalInput($('scClose').value);
    if (openAt == null && closeAt == null) return toast('กำหนดเวลาเปิดหรือเวลาปิดอย่างน้อยหนึ่งอย่าง', true);
    return saveSched({ enabled: true, mode: 'datetime', openAt, closeAt }, 'บันทึกเวลาเปิด-ปิดแล้ว');
  };
  if ($('scStop')) $('scStop').onclick = async () => { if (await confirmDlg('หยุดตั้งเวลา?', 'สถานะจะกลับไปใช้ค่าที่กดเอง', 'หยุด')) saveSched({ enabled: false, mode: (adminData.schedule || {}).mode }, 'หยุดตั้งเวลาแล้ว'); };
  $('geoHere').onclick = async () => {
    try { const p = await getPosition(); $('geoLat').value = p.coords.latitude.toFixed(6); $('geoLng').value = p.coords.longitude.toFixed(6); upd(); toast('ใช้ตำแหน่งปัจจุบัน (ความแม่นยำ ±' + Math.round(p.coords.accuracy) + ' ม.)'); }
    catch (e) { toast(e && e.code === 1 ? 'ไม่ได้อนุญาตให้ใช้ตำแหน่ง' : 'หาตำแหน่งไม่ได้', true); }
  };
  $('geoSave').onclick = async () => {
    const on = $('geoOn').checked, lat = $('geoLat').value, lng = $('geoLng').value;
    if (on && (lat === '' || lng === '')) return toast('ต้องใส่ละติจูดและลองจิจูด', true);
    const r = await post('/camps/admin/geo', { enabled: on, name: $('geoName').value, lat: lat === '' ? null : Number(lat), lng: lng === '' ? null : Number(lng), radius: Number($('geoRad').value) });
    if (!r.ok) return toast(await errMsg(r), true);
    toast(on ? 'เปิดการตรวจสอบตำแหน่งแล้ว' : 'บันทึกแล้ว (ปิดการตรวจสอบตำแหน่ง)'); await loadAdminPage();
  };
}
function depInfoPanel() {
  return '<div class="panel"><h3>หัวหน้าฝ่ายและหน้าที่ของแต่ละฝ่าย</h3><p class="muted" style="margin-bottom:6px">แสดงให้นักศึกษาเห็นในหน้าเลือกฝ่าย (ตัวอย่างก่อนลงทะเบียน)</p>' + adminData.departments.map((d) => {
    const h = d.head || {};
    return '<div class="depinfo"><h4>' + esc(d.name) + '</h4><label>หัวหน้าฝ่าย<input id="dh-' + d.code + '" maxlength="120" value="' + esc(h.name || '') + '" placeholder="ชื่อ-นามสกุล หัวหน้าฝ่าย"></label><label>ช่องทางติดต่อ (ไม่บังคับ)<input id="dc-' + d.code + '" maxlength="200" value="' + esc(h.contact || '') + '" placeholder="เบอร์โทร / LINE ID"></label><div class="full phrow"><span id="dp-' + d.code + '">' + avatar(d, 'lg') + '</span><div class="phbtns"><label class="btn sm ghost" for="df-' + d.code + '">' + (h.photo ? 'เปลี่ยนรูปหัวหน้าฝ่าย' : 'อัปโหลดรูปหัวหน้าฝ่าย') + '</label><input id="df-' + d.code + '" type="file" accept="image/*" class="hidden" onchange="uploadHeadPhoto(\'' + d.code + '\', this)">' + (h.photo ? '<button class="btn sm" type="button" onclick="deleteHeadPhoto(\'' + d.code + '\')">ลบรูป</button>' : '') + '<span class="muted">ระบบย่อรูปเป็นสี่เหลี่ยมจัตุรัสให้</span></div></div><label class="full">หน้าที่ของฝ่าย<textarea id="dd-' + d.code + '" maxlength="400">' + esc(d.description || '') + '</textarea></label><div class="qact"><button class="btn primary sm" onclick="saveDepInfo(\'' + d.code + '\')">บันทึก</button></div></div>';
  }).join('') + '</div>';
}
// resize / centre-crop to a 480px square JPEG in the browser, then upload the bytes
async function squareJpeg(file, size = 480) {
  const bmp = await createImageBitmap(file).catch(() => null);
  if (!bmp) throw new Error('อ่านรูปไม่ได้ ลองใช้ไฟล์ JPG หรือ PNG');
  const c = document.createElement('canvas'); c.width = c.height = size; const x = c.getContext('2d');
  const m = Math.min(bmp.width, bmp.height), sx = (bmp.width - m) / 2, sy = (bmp.height - m) / 2;
  x.fillStyle = '#fff'; x.fillRect(0, 0, size, size); x.drawImage(bmp, sx, sy, m, m, 0, 0, size, size);
  const blob = await new Promise((res) => c.toBlob(res, 'image/jpeg', 0.85));
  if (!blob) throw new Error('แปลงรูปไม่ได้'); return blob;
}
async function uploadHeadPhoto(code, input) {
  const f = input.files && input.files[0]; if (!f) return; input.value = '';
  if (f.size > 15 * 1024 * 1024) return toast('ไฟล์รูปใหญ่เกินไป', true);
  try {
    const blob = await squareJpeg(f);
    const r = await api('/camps/admin/department/photo?code=' + encodeURIComponent(code), { method: 'POST', headers: { 'Content-Type': 'image/jpeg' }, body: blob });
    if (!r.ok) return toast(await errMsg(r), true);
    const d = adminData.departments.find((x) => x.code === code); if (d) { d.head = d.head || {}; d.head.photo = (await r.json()).photo; }
    toast('อัปโหลดรูปแล้ว'); renderKeepEdits(code);
  } catch (e) { toast(e.message || 'อัปโหลดรูปไม่สำเร็จ', true); }
}
async function deleteHeadPhoto(code) {
  if (!(await confirmDlg('ลบรูปหัวหน้าฝ่าย?', 'นักศึกษาจะเห็นเป็นตัวอักษรย่อแทน', 'ลบรูป'))) return;
  const r = await post('/camps/admin/department/photo/delete', { departmentCode: code });
  if (!r.ok) return toast(await errMsg(r), true);
  const d = adminData.departments.find((x) => x.code === code); if (d && d.head) d.head.photo = null;
  toast('ลบรูปแล้ว'); renderKeepEdits(code);
}
// redraw the settings page but keep what was typed in the other departments' boxes
function renderKeepEdits() {
  const keep = {}; for (const d of adminData.departments) for (const k of ['dh', 'dc', 'dd']) { const el = $(k + '-' + d.code); if (el) keep[k + '-' + d.code] = el.value; }
  renderSettings();
  for (const k in keep) { const el = $(k); if (el) el.value = keep[k]; }
}
async function saveDepInfo(code) {
  const body = { departmentCode: code, headName: $('dh-' + code).value, headContact: $('dc-' + code).value, description: $('dd-' + code).value };
  const r = await post('/camps/admin/department', body);
  if (!r.ok) return toast(await errMsg(r), true);
  const d = adminData.departments.find((x) => x.code === code); if (d) { d.head = { name: body.headName.trim(), contact: body.headContact.trim() }; d.description = body.description.trim(); }
  toast('บันทึกข้อมูลฝ่ายแล้ว');
}
async function setState(k) {
  if (k === (adminData.manual || adminData.registration)) return;
  if (k === 'open' && !(await confirmDlg('เปิดลงทะเบียน?', 'นักศึกษาในรายชื่อจะเริ่มลงทะเบียนได้ทันที ตรวจสอบรายชื่อและโควตาให้เรียบร้อยก่อน', 'เปิดลงทะเบียน'))) return;
  if (k === 'closed' && !(await confirmDlg('ปิดลงทะเบียน?', 'นักศึกษาจะลงทะเบียนหรือเปลี่ยนฝ่ายไม่ได้อีก', 'ปิดลงทะเบียน'))) return;
  const r = await post('/camps/admin/state', { registration: k });
  if (!r.ok) return toast(await errMsg(r), true);
  toast('อัปเดตสถานะแล้ว'); loadAdminPage();
}

// students: add / edit, CSV import, list
let stQuery = '', stYear = '', stGender = '', stTimer, students = [];
const stOpen = new Set();   // student ids whose details are expanded (kept across searches / refreshes)
function suggestYear(id) {
  const m = /^(\d{2})/.exec(String(id).replace(/^[a-z]{2}/i, '')); if (!m) return '';
  const d = new Date(), be = d.getFullYear() + 543, ac = be - (d.getMonth() < 5 ? 1 : 0), y = ac - (2500 + Number(m[1])) + 1;
  return y >= 1 && y <= 4 ? String(y) : '';
}
const GENDER_OPTS = '<option value="">เลือก</option><option value="M">ชาย</option><option value="F">หญิง</option>';
function showStPane(k) {
  document.querySelectorAll('#adminBody > .panel[data-pane]').forEach((p) => p.classList.toggle('hidden', p.dataset.pane !== k));
  document.querySelectorAll('#adminBody .subtabs button').forEach((b) => { const on = b.dataset.pane === k; b.classList.toggle('on', on); b.setAttribute('aria-selected', String(on)); b.tabIndex = on ? 0 : -1; });
  try { sessionStorage.setItem('stPane', k); } catch (e) { /* ignore */ }
}
async function loadStudents() {
  const body = $('adminBody');
  body.innerHTML = '<div class="panel"><h3>เพิ่ม / แก้ไขนักศึกษา</h3><form id="stForm" class="form cols5"><label>รหัสนักศึกษา<input id="stId" required inputmode="numeric" placeholder="6740102220"></label><label>ชื่อ-นามสกุล<input id="stName" required maxlength="200" placeholder="ชื่อ นามสกุล"></label><label>ชั้นปี<select id="stYr" required><option value="">เลือก</option>' + YEARS.map((y) => '<option value="' + y + '">' + y + '</option>').join('') + '</select></label><label>เพศ<select id="stG" required>' + GENDER_OPTS + '</select></label><label>เลขบัตรประชาชน<input id="stNid" inputmode="numeric" maxlength="17" autocomplete="off" placeholder="13 หลัก (ไม่บังคับ)"></label><button class="btn primary" type="submit">บันทึก</button></form><div class="muted" style="margin-top:6px">พิมพ์รหัสแล้วระบบเดาชั้นปีให้จากเลขสองหลักแรก และเดาเพศจากคำนำหน้าชื่อ (นาย / นางสาว) แก้ได้</div></div>'
    + '<div class="panel"><h3>นำเข้าจากไฟล์ Excel / CSV</h3><p class="muted" style="margin-bottom:10px">คอลัมน์: <b>รหัสนักศึกษา, ชื่อ-นามสกุล, ชั้นปี, เพศ</b> (เพศ = ชาย/หญิง หรือ M/F ถ้าไม่มีคอลัมน์เพศ ระบบอ่านจากคำนำหน้า นาย/นางสาว) เพิ่มคอลัมน์ที่ 5 <b>ฝ่าย</b> ได้ถ้าอยากใส่เข้าฝ่ายพร้อมกัน (เช่น ฝ่ายการสอน) มีแถวหัวตารางหรือไม่ก็ได้ ใช้ , หรือ ; หรือแท็บ คั่นได้ รองรับไฟล์ Excel (.xlsx) โดยอ่านจากชีตแรก</p>'
    + '<div class="filerow"><label class="btn ghost" for="csvFile">เลือกไฟล์ Excel / CSV</label><input id="csvFile" type="file" accept=".xlsx,.xls,.csv,.txt,text/csv,text/plain,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel" class="hidden"><button class="btn sm" type="button" onclick="downloadTemplate()">ดาวน์โหลดไฟล์ตัวอย่าง (Excel)</button><span id="csvName" class="muted"></span></div>'
    + '<textarea id="bulk" placeholder="หรือวางข้อมูลที่นี่&#10;รหัสนักศึกษา,ชื่อ-นามสกุล,ชั้นปี,เพศ&#10;6740102220,สมชาย ใจดี,3,ชาย&#10;6840100001,สมหญิง รักเรียน,2,หญิง"></textarea><div style="margin-top:10px"><button class="btn primary sm" id="bulkBtn">นำเข้า</button></div><div id="bulkRes" class="result"></div></div>'
    + '<div class="panel"><div class="stHead"><h3>รายชื่อนักศึกษา <span class="muted" id="stCount"></span></h3><div class="stBtns"><button class="btn sm" type="button" onclick="stToggleAll(true)">ขยายทั้งหมด</button><button class="btn sm" type="button" onclick="stToggleAll(false)">ย่อทั้งหมด</button><button class="btn primary sm" type="button" onclick="exportDialog()">ส่งออก (Excel / PDF)…</button></div></div><div class="form fl"><input id="stQ" type="search" aria-label="ค้นหาชื่อหรือรหัส" placeholder="ค้นหาชื่อหรือรหัส"><select id="stF" aria-label="กรองตามชั้นปี"><option value="">ทุกชั้นปี</option>' + YEARS.map((y) => '<option value="' + y + '">ปี ' + y + '</option>').join('') + '</select><select id="stFG" aria-label="กรองตามเพศ"><option value="">ทุกเพศ</option><option value="M">ชาย</option><option value="F">หญิง</option></select></div><div id="stList" style="margin-top:8px"><div class="skeleton"></div></div></div>';
  // the page is split into three inner tabs: list (+ export), add / edit, import
  const panes = [...body.children].filter((e) => e.classList.contains('panel'));
  ['add', 'import', 'list'].forEach((k, i) => { if (panes[i]) { panes[i].dataset.pane = k; panes[i].setAttribute('role', 'tabpanel'); panes[i].id = 'stPane-' + k; } });
  const bar = document.createElement('div'); bar.className = 'seg subtabs'; bar.setAttribute('role', 'tablist'); bar.setAttribute('aria-label', 'เมนูนักศึกษา');
  bar.innerHTML = [['list', 'รายชื่อ <span id="stTabN" class="subn"></span>'], ['add', 'เพิ่ม / แก้ไข'], ['import', 'นำเข้า Excel / CSV']].map(([k, l]) => '<button type="button" role="tab" data-pane="' + k + '" aria-controls="stPane-' + k + '">' + l + '</button>').join('');
  body.insertBefore(bar, body.firstChild);
  bar.addEventListener('click', (e) => { const b = e.target.closest('button[data-pane]'); if (b) showStPane(b.dataset.pane); });
  bar.addEventListener('keydown', (e) => { if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return; const bs = [...bar.querySelectorAll('button')], i = bs.indexOf(document.activeElement); if (i < 0) return; const n = bs[(i + (e.key === 'ArrowRight' ? 1 : bs.length - 1)) % bs.length]; n.focus(); showStPane(n.dataset.pane); });
  let pane0 = 'list'; try { pane0 = sessionStorage.getItem('stPane') || 'list'; } catch (e) { /* ignore */ }
  showStPane(['list', 'add', 'import'].includes(pane0) ? pane0 : 'list');
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
function stToggleAll(open) {
  const list = $('stList'); if (!list) return;
  list.querySelectorAll('details[data-id]').forEach((d) => { d.open = open; });
  if (!open) stOpen.clear(); else list.querySelectorAll('details[data-id]').forEach((d) => stOpen.add(d.dataset.id));
}
async function loadStudentList() {
  const list = $('stList'); if (!list) return;
  const q = new URLSearchParams(); if (stQuery) q.set('q', stQuery); if (stYear) q.set('year', stYear); if (stGender) q.set('gender', stGender);
  let r;
  try { r = await api('/camps/admin/students?' + q); } catch (e) { list.innerHTML = failBox('เชื่อมต่อไม่ได้ ตรวจสอบอินเทอร์เน็ตแล้วลองใหม่', 'loadStudentList()'); return; }
  if (!r.ok) { list.innerHTML = failBox(await errMsg(r), 'loadStudentList()'); return; }
  students = (await r.json()).students || [];
  $('stCount').textContent = '(' + students.length + ' คน)'; const tn = $('stTabN'); if (tn) tn.textContent = students.length;
  const dv = (k, v) => '<div><dt>' + k + '</dt><dd>' + (v ? esc(v) : '<i>—</i>') + '</dd></div>';
  list.innerHTML = students.map((s, i) => '<div class="srow"><details class="m"' + (stOpen.has(s.student_id) ? ' open' : '') + ' data-id="' + esc(s.student_id) + '"><summary><b>' + esc(s.name) + '</b>' + (s.name_en ? '<span class="sen">' + esc(s.name_en) + '</span>' : '') + '<small>' + esc(s.student_id) + ' · ปี ' + s.year + ' · ' + GL[s.gender] + ' · ' + (s.department_name ? 'ฝ่าย: ' + esc(s.department_name).replace(/^ฝ่าย/, '') : 'ยังไม่ลงทะเบียน') + '</small></summary>'
    + '<dl class="sdet">' + dv('ชื่อเล่น', s.nickname) + dv('AKA', s.aka) + dv('วันเกิด', fmtBirth(s.birth_date)) + dv('เบอร์โทรศัพท์', fmtPhone(s.phone)) + dv('เบอร์ผู้ปกครอง', fmtPhone(s.guardian_phone)) + dv('รหัสบัตรประชาชน', fmtNid(s.national_id)) + '</dl></details><div class="acts"><button class="btn sm" onclick="editStudent(' + i + ')">แก้ไข</button>' + '<button class="btn sm" onclick="assignDialog(' + i + ')">' + (s.department_code ? 'ย้ายฝ่าย' : 'กำหนดฝ่าย') + '</button>' + (s.department_code ? '<button class="btn sm" onclick="clearSel(' + i + ')">ล้างฝ่าย</button>' : '') + '<button class="btn sm danger" onclick="delStudent(' + i + ')">ลบ</button></div></div>').join('') || '<div class="muted" style="padding:14px 0;text-align:center">ไม่พบนักศึกษา</div>';
  list.querySelectorAll('details[data-id]').forEach((d) => { d.ontoggle = () => { d.open ? stOpen.add(d.dataset.id) : stOpen.delete(d.dataset.id); }; });   // 'toggle' does not bubble
}
async function saveStudent(e) {
  e.preventDefault();
  const r = await post('/camps/admin/students', { studentId: $('stId').value, name: $('stName').value, year: Number($('stYr').value), gender: $('stG').value, nationalId: $('stNid').value });
  if (!r.ok) return toast(await errMsg(r), true);
  toast('บันทึกนักศึกษาแล้ว'); $('stForm').reset(); delete $('stYr').dataset.touched; delete $('stG').dataset.touched; loadStudentList();
}
function editStudent(i) { showStPane('add'); const s = students[i]; $('stId').value = s.student_id; $('stName').value = s.name; $('stYr').value = String(s.year); $('stG').value = s.gender; $('stNid').value = s.national_id || ''; $('stYr').dataset.touched = '1'; $('stG').dataset.touched = '1'; $('stForm').scrollIntoView({ behavior: 'smooth', block: 'center' }); $('stName').focus(); }
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
let xlsxP = null;
function loadXlsx() {
  if (window.XLSX) return Promise.resolve(window.XLSX);
  return xlsxP || (xlsxP = new Promise((res, rej) => { const el = document.createElement('script'); el.src = '/hr/vendor/xlsx.mini.min.js'; el.onload = () => res(window.XLSX); el.onerror = () => { xlsxP = null; rej(new Error('load')); }; document.head.appendChild(el); }));
}
async function readCsvFile(e) {
  const f = e.target.files && e.target.files[0]; if (!f) return;
  if (f.size > 5 * 1024 * 1024) { toast('ไฟล์ใหญ่เกิน 5 MB', true); e.target.value = ''; return; }
  const buf = await f.arrayBuffer(); let text;
  const isExcel = /\.(xlsx|xls)$/i.test(f.name) || (new Uint8Array(buf, 0, 2)[0] === 0x50 && new Uint8Array(buf, 0, 2)[1] === 0x4b) || (new Uint8Array(buf, 0, 4)[0] === 0xd0 && new Uint8Array(buf, 0, 4)[1] === 0xcf);
  if (isExcel) {
    try {
      const X = await loadXlsx(), wb = X.read(buf, { type: 'array' }), ws = wb.Sheets[wb.SheetNames[0]];
      if (!ws) throw new Error('empty');
      text = X.utils.sheet_to_csv(ws, { FS: ',', RS: '\n', blankrows: false });
    } catch (err) { toast('อ่านไฟล์ Excel ไม่ได้ ลองบันทึกเป็น .xlsx หรือ CSV อีกครั้ง', true); e.target.value = ''; return; }
  } else {
    const u8 = new Uint8Array(buf, 0, Math.min(2, buf.byteLength));
    if (u8[0] === 0xff && u8[1] === 0xfe) text = new TextDecoder('utf-16le').decode(buf);
    else if (u8[0] === 0xfe && u8[1] === 0xff) text = new TextDecoder('utf-16be').decode(buf);
    else try { text = new TextDecoder('utf-8', { fatal: true }).decode(buf); } catch (err) { try { text = new TextDecoder('windows-874').decode(buf); } catch (e2) { text = new TextDecoder().decode(buf); } }
  }
  $('bulk').value = text; $('csvName').textContent = f.name + ' · ' + text.split(/\r?\n/).filter((l) => l.trim()).length + ' บรรทัด — ตรวจสอบแล้วกด "นำเข้า"'; e.target.value = '';
}
function saveXlsx(rows, name, widths) {
  return loadXlsx().then((X) => {
    const ws = X.utils.aoa_to_sheet(rows); ws['!cols'] = widths.map((w) => ({ wch: w }));
    const wb = X.utils.book_new(); X.utils.book_append_sheet(wb, ws, 'นักศึกษา'); X.writeFile(wb, name);
  }).catch(() => toast('สร้างไฟล์ Excel ไม่ได้', true));
}
function downloadTemplate() {
  saveXlsx([['รหัสนักศึกษา', 'ชื่อ-นามสกุล', 'ชั้นปี', 'เพศ', 'ฝ่าย'], ['6740102220', 'สมชาย ใจดี', 3, 'ชาย', 'ฝ่ายการสอน'], ['6840100001', 'สมหญิง รักเรียน', 2, 'หญิง', '']], 'camp-students-template.xlsx', [16, 26, 8, 8, 18]);
}
async function bulkImport() {
  const text = $('bulk').value.trim(); if (!text) return toast('เลือกไฟล์ Excel/CSV หรือวางรายชื่อก่อน', true);
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
// ---------- export students: pick the columns, then Excel / PDF / CSV ----------
const EXPORT_COLS = [
  ['student_id', 'รหัสนักศึกษา', (s) => String(s.student_id), 14], ['name', 'ชื่อ-นามสกุล (ไทย)', (s) => s.name, 28], ['name_en', 'ชื่อ-สกุล (อังกฤษ)', (s) => s.name_en || '', 26],
  ['nickname', 'ชื่อเล่น', (s) => s.nickname || '', 12], ['aka', 'AKA', (s) => s.aka || '', 16], ['year', 'ชั้นปี', (s) => s.year, 8], ['gender', 'เพศ', (s) => GL[s.gender], 8],
  ['department', 'ฝ่าย', (s) => s.department_name || '', 20], ['birth_date', 'วันเกิด', (s) => fmtBirth(s.birth_date), 18], ['phone', 'เบอร์โทรศัพท์', (s) => fmtPhone(s.phone), 14],
  ['guardian_phone', 'เบอร์ผู้ปกครอง', (s) => fmtPhone(s.guardian_phone), 14], ['national_id', 'รหัสบัตรประชาชน', (s) => fmtNid(s.national_id), 20]
];
const loadExportPrefs = () => { try { const v = JSON.parse(localStorage.getItem('stExport') || 'null'); if (v && Array.isArray(v.cols)) return v; } catch (e) { /* ignore */ } return { cols: EXPORT_COLS.map((c) => c[0]), fmt: 'xlsx' }; };
// list: the students to export (the filtered list on the students page, everyone from the overview page)
async function exportDialog(scope) {
  let list = scope === 'all' ? null : students.slice();
  if (!list) { const r = await api('/camps/admin/students'); if (!r.ok) return toast(await errMsg(r), true); list = (await r.json()).students || []; }
  if (!list.length) return toast('ไม่มีรายชื่อให้ส่งออก', true);
  const pref = loadExportPrefs();
  const d = openDlg('<h3>ส่งออกรายชื่อนักศึกษา</h3><p class="muted">' + (scope === 'all' ? 'นักศึกษาทั้งหมด' : 'รายชื่อที่แสดงอยู่ตอนนี้') + ' ' + list.length + ' คน · เลือกข้อมูลที่ต้องการ</p>'
    + '<div class="expcols" id="expCols">' + EXPORT_COLS.map((c) => '<label class="chk"><input type="checkbox" value="' + c[0] + '"' + (pref.cols.includes(c[0]) ? ' checked' : '') + '> ' + c[1] + '</label>').join('') + '</div>'
    + '<div class="filerow"><button type="button" class="btn sm" id="expAll">เลือกทั้งหมด</button><button type="button" class="btn sm" id="expNone">ไม่เลือกเลย</button></div>'
    + '<div class="expfmt" role="radiogroup" aria-label="รูปแบบไฟล์">' + [['xlsx', 'Excel (.xlsx)'], ['pdf', 'PDF'], ['csv', 'CSV']].map((f) => '<label class="chk"><input type="radio" name="expFmt" value="' + f[0] + '"' + (pref.fmt === f[0] ? ' checked' : '') + '> ' + f[1] + '</label>').join('') + '</div>'
    + '<div class="btns"><button class="btn" type="button" data-x>ยกเลิก</button><button class="btn primary" type="button" id="expGo">ส่งออก</button></div>');
  const boxes = () => [...d.querySelectorAll('#expCols input')];
  d.addEventListener('click', (e) => { if (e.target.closest('[data-x]')) d.remove(); });
  $('expAll').onclick = () => boxes().forEach((b) => { b.checked = true; });
  $('expNone').onclick = () => boxes().forEach((b) => { b.checked = false; });
  $('expGo').onclick = async () => {
    const cols = EXPORT_COLS.filter((c) => boxes().some((b) => b.checked && b.value === c[0])), fmt = (d.querySelector('input[name=expFmt]:checked') || {}).value || 'xlsx';
    if (!cols.length) return toast('เลือกข้อมูลที่ต้องการส่งออกอย่างน้อย 1 อย่าง', true);
    try { localStorage.setItem('stExport', JSON.stringify({ cols: cols.map((c) => c[0]), fmt })); } catch (e) { /* ignore */ }
    $('expGo').disabled = true;
    try { const ok = await (fmt === 'pdf' ? exportStudentsPdf : fmt === 'csv' ? exportStudentsCsv : exportStudentsXlsx)(list, cols); if (ok !== false) d.remove(); } finally { const b = $('expGo'); if (b) b.disabled = false; }
  };
}
const rowsOf = (list, cols) => list.map((s) => cols.map((c) => c[2](s)));
function exportStudentsXlsx(list, cols) {
  return loadXlsx().then((X) => {
    const ws = X.utils.aoa_to_sheet([cols.map((c) => c[1])].concat(rowsOf(list, cols))); ws['!cols'] = cols.map((c) => ({ wch: c[3] }));
    const wb = X.utils.book_new(); X.utils.book_append_sheet(wb, ws, 'นักศึกษา'); X.writeFile(wb, 'camp-students-' + stamp() + '.xlsx'); return true;
  }).catch(() => { toast('สร้างไฟล์ Excel ไม่ได้', true); return false; });
}
function exportStudentsCsv(list, cols) {
  const q = (v) => '"' + String(v ?? '').replace(/"/g, '""') + '"';
  const csv = '﻿' + [cols.map((c) => q(c[1])).join(',')].concat(rowsOf(list, cols).map((r) => r.map(q).join(','))).join('\r\n');
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' })); a.download = 'camp-students-' + stamp() + '.csv'; document.body.appendChild(a); a.click(); a.remove(); return true;
}
async function exportStudentsPdf(list, cols) {
  try {
    if (!window.jspdf) { await loadJs('/hr/vendor/jspdf.umd.min.js'); await loadJs('/hr/vendor/jspdf.plugin.autotable.min.js'); }
    const b64 = async (u) => { const r = await fetch(u); if (!r.ok) throw new Error('font'); const buf = new Uint8Array(await r.arrayBuffer()); let bin = ''; for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000)); return btoa(bin); };
    if (!thFonts) thFonts = { n: await b64('/assets/fonts/SarabunTH-Regular.ttf'), b: await b64('/assets/fonts/SarabunTH-Bold.ttf') };
    if (!window.thaiShape) await loadJs('/assets/thai-shape.js');
    const wide = cols.length > 6, doc = new window.jspdf.jsPDF({ orientation: wide ? 'landscape' : 'portrait', unit: 'mm', format: 'a4' });
    const T = window.thaiShape, rawText = doc.text.bind(doc), rawTable = doc.autoTable.bind(doc);
    doc.text = (s, ...a) => rawText(Array.isArray(s) ? s.map(T) : T(s), ...a);
    doc.autoTable = (o) => rawTable({ ...o, didParseCell: (d) => { d.cell.text = d.cell.text.map(T); if (o.didParseCell) o.didParseCell(d); } });
    doc.addFileToVFS('Sarabun-Regular.ttf', thFonts.n); doc.addFont('Sarabun-Regular.ttf', 'Sarabun', 'normal');
    doc.addFileToVFS('Sarabun-Bold.ttf', thFonts.b); doc.addFont('Sarabun-Bold.ttf', 'Sarabun', 'bold');
    const fs = cols.length > 10 ? 7 : cols.length > 7 ? 8 : 10, W = wide ? 297 : 210;
    doc.setFont('Sarabun', 'bold'); doc.setFontSize(18); doc.text('รายชื่อนักศึกษา', 14, 16);
    doc.setFont('Sarabun', 'normal'); doc.setFontSize(10); doc.text(list.length + ' คน · พิมพ์เมื่อ ' + new Date().toLocaleString('th-TH'), 14, 22);
    doc.autoTable({ startY: 27, head: [['#'].concat(cols.map((c) => c[1]))], body: list.map((s, i) => [i + 1].concat(cols.map((c) => String(c[2](s))))), styles: { font: 'Sarabun', fontSize: fs, cellPadding: 1.6, overflow: 'linebreak' }, headStyles: { font: 'Sarabun', fontStyle: 'bold', fillColor: [31, 31, 33] }, margin: { left: 10, right: 10, bottom: 14 }, columnStyles: { 0: { cellWidth: 9 } } });
    const n = doc.getNumberOfPages(); for (let i = 1; i <= n; i++) { doc.setPage(i); doc.setFont('Sarabun', 'normal'); doc.setFontSize(9); doc.text(i + ' / ' + n, W - 10, (wide ? 210 : 297) - 6, { align: 'right' }); }
    doc.save('camp-students-' + stamp() + '.pdf'); return true;
  } catch (e) { toast('สร้างไฟล์ PDF ไม่ได้', true); return false; }
}

// ---------- export registrations by department (Excel / PDF) ----------
const loadJs = (src) => new Promise((res, rej) => { const el = document.createElement('script'); el.src = src; el.onload = res; el.onerror = () => rej(new Error('load ' + src)); document.head.appendChild(el); });
async function regGroups() {
  const r = await api('/camps/admin/students'); if (!r.ok) { toast(await errMsg(r), true); return null; }
  if (!adminData) { const o = await api('/camps/admin/overview'); if (o.ok) adminData = await o.json(); }
  const list = ((await r.json()).students || []).filter((s) => s.department_code);
  const order = (adminData ? adminData.departments : []).map((d) => ({ code: d.code, name: d.name }));
  for (const s of list) if (!order.some((d) => d.code === s.department_code)) order.push({ code: s.department_code, name: s.department_name || s.department_code });
  const gi = (g) => (g === 'M' ? 0 : g === 'F' ? 1 : 2);
  const groups = order.map((d) => ({ ...d, people: list.filter((s) => s.department_code === d.code).sort((a, b) => a.year - b.year || gi(a.gender) - gi(b.gender) || String(a.student_id).localeCompare(String(b.student_id))) }));
  return { groups, total: list.length };
}
const regSummary = (groups) => groups.map((g) => { const n = (y, x) => g.people.filter((p) => p.year === y && (!x || p.gender === x)).length; return [g.name, g.people.length, g.people.filter((p) => p.gender === 'M').length, g.people.filter((p) => p.gender === 'F').length].concat(YEARS.map((y) => n(y))); });
const SUM_HEAD = ['ฝ่าย', 'รวม', 'ชาย', 'หญิง'].concat(YEARS.map((y) => 'ปี ' + y));
const stamp = () => new Date().toISOString().slice(0, 10);
async function exportRegXlsx() {
  const d = await regGroups(); if (!d) return;
  if (!d.total) return toast('ยังไม่มีผู้ลงทะเบียน', true);
  try {
    const X = await loadXlsx(), wb = X.utils.book_new(), used = new Set(['สรุป', 'ทั้งหมด']);
    const add = (name, rows, w) => { const ws = X.utils.aoa_to_sheet(rows); ws['!cols'] = w.map((x) => ({ wch: x })); X.utils.book_append_sheet(wb, ws, name); };
    add('สรุป', [SUM_HEAD].concat(regSummary(d.groups), [['รวมทั้งหมด', d.total, d.groups.reduce((s, g) => s + g.people.filter((p) => p.gender === 'M').length, 0), d.groups.reduce((s, g) => s + g.people.filter((p) => p.gender === 'F').length, 0)].concat(YEARS.map((y) => d.groups.reduce((s, g) => s + g.people.filter((p) => p.year === y).length, 0)))]), [26, 8, 8, 8, 8, 8, 8, 8]);
    const row = (p, i) => [i + 1, String(p.student_id), p.name, p.year, GL[p.gender]];
    add('ทั้งหมด', [['ฝ่าย', 'ลำดับ', 'รหัสนักศึกษา', 'ชื่อ-นามสกุล', 'ชั้นปี', 'เพศ']].concat(d.groups.flatMap((g) => g.people.map((p, i) => [g.name].concat(row(p, i))))), [26, 7, 16, 28, 8, 8]);
    d.groups.forEach((g) => { let n = g.name.replace(/[\\\/?*\[\]:]/g, ' ').slice(0, 28) || 'ฝ่าย', k = 2, base = n; while (used.has(n)) n = base.slice(0, 26) + ' ' + k++; used.add(n); add(n, [['ลำดับ', 'รหัสนักศึกษา', 'ชื่อ-นามสกุล', 'ชั้นปี', 'เพศ']].concat(g.people.map(row)), [7, 16, 28, 8, 8]); });
    X.writeFile(wb, 'camp-registrations-' + stamp() + '.xlsx');
  } catch (e) { toast('สร้างไฟล์ Excel ไม่ได้', true); }
}
let thFonts = null;
async function exportRegPdf() {
  const d = await regGroups(); if (!d) return;
  if (!d.total) return toast('ยังไม่มีผู้ลงทะเบียน', true);
  try {
    if (!window.jspdf) { await loadJs('/hr/vendor/jspdf.umd.min.js'); await loadJs('/hr/vendor/jspdf.plugin.autotable.min.js'); }
    const b64 = async (u) => { const r = await fetch(u); if (!r.ok) throw new Error('font'); const buf = new Uint8Array(await r.arrayBuffer()); let bin = ''; for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000)); return btoa(bin); };
    if (!thFonts) thFonts = { n: await b64('/assets/fonts/SarabunTH-Regular.ttf'), b: await b64('/assets/fonts/SarabunTH-Bold.ttf') };
    const doc = new window.jspdf.jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    if (!window.thaiShape) await loadJs('/assets/thai-shape.js');   // jsPDF has no Thai shaping: pick vowel/tone-mark glyph variants ourselves
    const T = window.thaiShape, rawText = doc.text.bind(doc), rawTable = doc.autoTable.bind(doc);
    doc.text = (s, ...a) => rawText(Array.isArray(s) ? s.map(T) : T(s), ...a);
    doc.autoTable = (o) => rawTable({ ...o, didParseCell: (d) => { d.cell.text = d.cell.text.map(T); if (o.didParseCell) o.didParseCell(d); } });
    doc.addFileToVFS('Sarabun-Regular.ttf', thFonts.n); doc.addFont('Sarabun-Regular.ttf', 'Sarabun', 'normal');
    doc.addFileToVFS('Sarabun-Bold.ttf', thFonts.b); doc.addFont('Sarabun-Bold.ttf', 'Sarabun', 'bold'); doc.setFont('Sarabun', 'normal');
    const styles = { font: 'Sarabun', fontSize: 11, cellPadding: 2 }, headStyles = { font: 'Sarabun', fontStyle: 'bold', fillColor: [211, 47, 47] };
    doc.setFont('Sarabun', 'bold'); doc.setFontSize(20); doc.text('รายชื่อผู้ลงทะเบียนแต่ละฝ่าย', 14, 18);
    doc.setFont('Sarabun', 'normal'); doc.setFontSize(11); doc.text('ผู้ลงทะเบียนทั้งหมด ' + d.total + ' คน · พิมพ์เมื่อ ' + new Date().toLocaleString('th-TH'), 14, 25);
    doc.autoTable({ startY: 30, head: [SUM_HEAD], body: regSummary(d.groups), styles, headStyles, columnStyles: { 0: { cellWidth: 52 } } });
    const byId = (a, b) => String(a.student_id).localeCompare(String(b.student_id), 'en', { numeric: true });   // PDF: student id, smallest first
    d.groups.forEach((g0) => {
      const g = { ...g0, people: g0.people.slice().sort(byId) };
      doc.addPage(); doc.setFont('Sarabun', 'bold'); doc.setFontSize(16); doc.text(g.name, 14, 18);
      doc.setFont('Sarabun', 'normal'); doc.setFontSize(11); doc.text('ผู้ลงทะเบียน ' + g.people.length + ' คน (ชาย ' + g.people.filter((p) => p.gender === 'M').length + ' · หญิง ' + g.people.filter((p) => p.gender === 'F').length + ')', 14, 25);
      doc.autoTable({ startY: 30, head: [['ลำดับ', 'รหัสนักศึกษา', 'ชื่อ-นามสกุล', 'ชั้นปี', 'เพศ']], body: g.people.length ? g.people.map((p, i) => [i + 1, String(p.student_id), p.name, p.year, GL[p.gender]]) : [[{ content: 'ยังไม่มีผู้ลงทะเบียน', colSpan: 5, styles: { halign: 'center' } }]], styles, headStyles, columnStyles: { 0: { cellWidth: 16 }, 3: { cellWidth: 16 }, 4: { cellWidth: 20 } } });
    });
    let logo = null; try { const lr = await fetch('/hr/logo-english-education.png'); if (lr.ok) { const bl = await lr.blob(); logo = await new Promise((res) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.readAsDataURL(bl); }); } } catch (e) { /* the PDF is still made without the logo */ }
    const n = doc.getNumberOfPages(); for (let i = 1; i <= n; i++) { doc.setPage(i); if (logo) doc.addImage(logo, 'PNG', 136, 8, 60, 14.5); doc.setFont('Sarabun', 'normal'); doc.setFontSize(9); doc.text(i + ' / ' + n, 196, 290, { align: 'right' }); }
    doc.save('camp-registrations-' + stamp() + '.pdf');
  } catch (e) { toast('สร้างไฟล์ PDF ไม่ได้', true); }
}

// any other call that finds the session gone (e.g. saving a quota after a long idle) -> back to sign-in instead of a silent failure
window.addEventListener('unhandledrejection', (ev) => {
  if (!sessionGone(ev.reason)) return;
  ev.preventDefault(); me = null; toast('เข้าสู่ระบบหมดอายุ ลองเข้าใหม่อีกครั้ง', true);
  renderAcct(); renderGate();
});

// ---------- start ----------
async function start() {
  renderNav();
  if (PAGE === 'student' && TAB === 'survey' && navigator.onLine === false && svOfflineBoot()) return;   // no signal: open the remembered form (hr/survey.js)
  if (PAGE === 'student') renderGate({ loading: true });
  const authed = await initAuth();
  if (authed === 'redirect') return;
  if (authed) await loadMe();
  else { if (PAGE === 'student' && TAB === 'survey' && !authReady && svOfflineBoot()) return; if (authReady) renderAcct(); renderGate(authReady ? null : { error: authError || 'เข้าสู่ระบบไม่ได้ในตอนนี้ ลองรีเฟรชหน้า' }); }
}
window.addEventListener('DOMContentLoaded', start);

// ---------- live counts: refreshed every 4 s while the page is visible ----------
let liveT = null, liveFail = 0;
function startLive() { clearTimeout(liveT); liveFail = 0; $('adminBody').innerHTML = '<div id="liveBox"><div class="skeleton" style="height:160px"></div></div>'; tickLive(); }
async function tickLive() {
  if (document.hidden) { liveT = setTimeout(tickLive, 2000); return; }
  try {
    const r = await api('/camps/admin/live');
    if (r.status === 401) { me = null; renderAdmin(); renderUserChip(); return; }
    if (!r.ok) throw new Error('http');
    const d = await r.json(); liveFail = 0; state = d.registration; applyInfo(d); renderLive(d);
  } catch (e) { if (sessionGone(e)) { me = null; renderAdmin(); renderUserChip(); return; } liveFail++; const n = $('liveNote'); if (n) { n.textContent = 'เชื่อมต่อไม่ได้ กำลังลองใหม่…'; n.className = 'livenote bad'; } }
  liveT = setTimeout(tickLive, liveFail ? Math.min(15000, 4000 * (liveFail + 1)) : 4000);
}
function renderLive(d) {
  const box = $('liveBox'); if (!box) return;
  const pct = (f, q) => q > 0 ? Math.min(100, Math.round(f * 100 / q)) : 0;
  const t = (x) => new Date(String(x).replace(' ', 'T') + 'Z').toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const rows = d.departments.map((x) => '<li class="lrow' + (x.quota > 0 && x.filled >= x.quota ? ' full' : '') + '"><div class="lh"><b>' + esc(x.name) + '</b><span>' + x.filled + ' / ' + x.quota + (x.quota > 0 && x.filled >= x.quota ? ' · เต็ม' : ' · เหลือ ' + x.remaining) + '</span></div><div class="prog" role="img" aria-label="' + esc(x.name) + ' ' + pct(x.filled, x.quota) + ' เปอร์เซ็นต์"><i style="width:' + pct(x.filled, x.quota) + '%"></i></div></li>').join('');
  const recent = d.recent.length ? d.recent.map((x) => '<li><span class="rt">' + esc(t(x.selected_at)) + '</span><span class="rn">' + esc(x.name) + ' <small>ปี ' + x.year + '</small></span><span class="rd">' + esc(x.department_name) + '</span></li>').join('') : '<li class="none">ยังไม่มีใครลงทะเบียน</li>';
  box.innerHTML = '<div class="livetop"><div><div class="bignum" aria-live="polite"><b>' + d.filled + '</b><span>/ ' + d.quota + ' ที่</span></div><p class="meta">ลงทะเบียนแล้ว · เหลือ ' + Math.max(0, d.quota - d.filled) + ' ที่</p></div><p id="liveNote" class="livenote">อัปเดตล่าสุด ' + new Date(d.now).toLocaleTimeString('th-TH') + ' · รีเฟรชเองทุก 4 วินาที</p></div>'
    + '<div class="prog big" role="img" aria-label="ลงทะเบียนแล้ว ' + pct(d.filled, d.quota) + ' เปอร์เซ็นต์"><i style="width:' + pct(d.filled, d.quota) + '%"></i></div>'
    + '<h2 class="sec-title">แต่ละฝ่าย</h2><ul class="llist">' + rows + '</ul>'
    + '<h2 class="sec-title">ล่าสุด</h2><ul class="lrecent">' + recent + '</ul>';
}
