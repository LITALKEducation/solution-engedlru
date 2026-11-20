(() => {
'use strict';
// ระบบจับสลาก · เช็กชื่อ — the entrance page for officers. Registration = scan the QR, the person is checked in and the draw number is shown at once.
// Built to move a crowd: the camera stays on, the number appears the instant a QR is read (from the roster kept on the phone) and is confirmed a moment later,
// a pop-up closes itself, a wrong scan can be undone, and with no signal the roster on the phone keeps working (scans are sent later).
// Roster, numbers and officers are managed in the admin page (/admin/#lotto).
const API = 'https://engedlru-api.stnetworld.workers.dev', DOMAIN = window.LOTTO_AUTH0_DOMAIN || 'auth.litalkeducation.com', CLIENT = window.LOTTO_AUTH0_CLIENT_ID || 'PGqozL94LzOwstm4pD39W5kvalYRiK7w', REDIRECT = location.origin + '/lotto/';   // Allowed Callback + Logout URLs must list it
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const AUTH_GONE = ['login_required', 'missing_refresh_token', 'invalid_grant', 'consent_required', 'interaction_required'];
const AUTO_CLOSE_MS = 3000;
let auth = null, myEmail = '', isAdmin = false, camera = null, camWant = true, camFacing = 'environment', camBusy = false, scanning = false;
let roster = new Map(), stats = null;

// ---------- helpers ----------
let toastT;
function toast(msg, bad) { const t = $('toast'); t.textContent = msg; t.className = (bad ? 'bad ' : '') + 'show'; clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 3200); }
const ls = { get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* optional */ } } };
async function api(path, opt = {}) {
  const go = async (fresh) => { const t = await auth.getTokenSilently(fresh ? { cacheMode: 'off' } : undefined); return fetch(API + path, { ...opt, headers: { ...(opt.headers || {}), Authorization: 'Bearer ' + t } }); };
  let r = await go(false); if (r.status === 401) r = await go(true); return r;
}
async function data(path, opt) {
  const r = await api(path, opt), d = await r.json().catch(() => ({ error: 'เกิดข้อผิดพลาด กรุณาลองใหม่' }));
  if (!r.ok) throw Object.assign(new Error(d.error || 'เกิดข้อผิดพลาด'), { status: r.status, data: d });
  return d;
}
const send = (method, path, body) => data(path, { method, headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
const isNet = (e) => !e.status && !AUTH_GONE.includes(e.error);   // no signal / server unreachable
const fmtTime = (s) => (s ? new Date(String(s).replace(' ', 'T') + (/[zZ]|[+-]\d\d:?\d\d$/.test(String(s)) ? '' : 'Z')).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }) : '');
const fmtFull = (s) => (s ? new Date(String(s).replace(' ', 'T') + (/[zZ]|[+-]\d\d:?\d\d$/.test(String(s)) ? '' : 'Z')).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' }) : '—');
const parseId = (v) => { const s = String(v || '').trim().replace(/[๐-๙]/g, (c) => String(c.charCodeAt(0) - 0x0e50)); const m = /^([a-z]{2})?(\d{6,12})(?:@lru\.ac\.th)?$/i.exec(s); return m ? m[2] : null; };
const nowSql = () => new Date().toISOString().slice(0, 19).replace('T', ' ');

// ---------- sound ----------
let actx = null, soundOn = ls.get('lotto.snd') !== false;
function unlockAudio() { try { if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)(); if (actx.state === 'suspended') actx.resume(); } catch (e) { /* no audio */ } }
['pointerdown', 'keydown', 'touchstart'].forEach((ev) => window.addEventListener(ev, unlockAudio, { passive: true }));
function tone(freq, start, dur) { const o = actx.createOscillator(), g = actx.createGain(); o.type = 'sine'; o.frequency.value = freq; o.connect(g); g.connect(actx.destination); const t = actx.currentTime + start; g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.35, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur); o.start(t); o.stop(t + dur + 0.02); }
function beep(kind) {
  if (!soundOn || !actx || actx.state !== 'running') return;
  try { if (kind === 'ok') { tone(880, 0, 0.12); tone(1175, 0.13, 0.14); } else if (kind === 'warn') tone(520, 0, 0.22); else { tone(240, 0, 0.18); tone(240, 0.24, 0.18); } } catch (e) { /* ignore */ }
}
function showSound() { const b = $('sndBtn'); b.textContent = 'เสียง: ' + (soundOn ? 'เปิด' : 'ปิด'); b.setAttribute('aria-pressed', soundOn ? 'true' : 'false'); }
$('sndBtn').onclick = () => { soundOn = !soundOn; ls.set('lotto.snd', soundOn); showSound(); unlockAudio(); if (soundOn) beep('ok'); };
showSound();

// ---------- sign-in ----------
async function init() {
  try {
    auth = await auth0.createAuth0Client({ domain: DOMAIN, clientId: CLIENT, cacheLocation: 'localstorage', useRefreshTokens: true, authorizationParams: { redirect_uri: REDIRECT } });
    if (location.search.includes('code=') || location.search.includes('error=')) { try { await auth.handleRedirectCallback(); } finally { history.replaceState({}, document.title, location.pathname); } }
    if (!(await auth.isAuthenticated())) { $('login').classList.remove('hidden'); $('account').textContent = 'ยังไม่ได้เข้าสู่ระบบ'; return; }
    const u = await auth.getUser(); myEmail = String(u.email || '').toLowerCase();
    const me = await data('/camps/lotto/scanner/me'); isAdmin = !!me.isAdmin;
    $('account').innerHTML = '<span class="acct-mail">' + esc(u.email || 'เข้าสู่ระบบแล้ว') + '</span>' + (isAdmin ? ' <span class="badge">แอดมิน</span>' : '') + ' <button id="logoutBtn" class="linkbtn" type="button">ออก</button>';
    $('logoutBtn').onclick = signOut;
    $('login').classList.add('hidden'); $('app').classList.remove('hidden');
    if (isAdmin) $('adminLink').classList.remove('hidden');
    showQueue(); loadRoster().then(() => { renderStats(); flushQueue(); }); loadStats();
    if (camWant) startCamera();   // the camera is on from the start
  } catch (e) {
    $('login').classList.remove('hidden');
    if (AUTH_GONE.includes(e.error)) { $('account').textContent = 'เซสชันหมดอายุ ลองเข้าใหม่'; return; }
    if (e.status === 403) { $('login').querySelector('p').textContent = 'บัญชีนี้ยังไม่ได้รับสิทธิ์ใช้งาน ลองเปลี่ยนบัญชี หรือแจ้งแอดมิน'; $('account').innerHTML = 'ไม่มีสิทธิ์ · <button id="logoutBtn" class="linkbtn" type="button">เปลี่ยนบัญชี</button>'; $('logoutBtn').onclick = signOut; return; }
    $('login').querySelector('p').textContent = e.message || 'เชื่อมต่อไม่ได้ ลองใหม่อีกครั้ง'; $('account').textContent = 'เกิดข้อผิดพลาด';
  }
}
// sign out (Auth0 clears the session shared with /student/ and /budget/) and come back through the Google account chooser
function signOut() { try { sessionStorage.setItem('chooseGoogle', '1'); } catch (e) { /* ignore */ } auth.logout({ logoutParams: { returnTo: REDIRECT } }); }
$('loginBtn').onclick = () => { const ap = { connection: 'google-oauth2' }; try { if (sessionStorage.getItem('chooseGoogle')) { ap.prompt = 'select_account'; sessionStorage.removeItem('chooseGoogle'); } } catch (e) { /* ignore */ } auth.loginWithRedirect({ authorizationParams: ap }); };

// ---------- the roster on this phone: instant numbers, and the page keeps working with no signal ----------
async function loadRoster() {
  try {
    const d = await data('/camps/lotto/scanner/roster');
    roster = new Map(d.students.map((x) => [x.id, x])); ls.set('lotto.roster', { at: Date.now(), list: d.students });
    for (const it of getQ()) { const r = roster.get(it.id); if (r && !r.checkedAt) { r.checkedAt = it.at.slice(0, 19).replace('T', ' '); r.checkedBy = myEmail; } }   // waiting scans count as done
  } catch (e) {
    const c = ls.get('lotto.roster'); if (c && c.list && !roster.size) roster = new Map(c.list.map((x) => [x.id, x]));
  }
}
setInterval(() => { if (!document.hidden && navigator.onLine !== false && auth) loadRoster(); }, 120000);

// ---------- progress ----------
async function loadStats() {
  try { stats = await data('/camps/lotto/scanner/stats'); } catch (e) { /* keep the last numbers */ }
  renderStats();
}
function renderStats() {
  const s = stats;
  $('progN').textContent = s ? 'เช็กชื่อแล้ว ' + s.checked + ' / ' + s.total + ' คน' : 'เช็กชื่อแล้ว –';
  $('progSub').textContent = s ? 'คุณเช็ก ' + s.mine + ' คน · เหลือ ' + Math.max(0, s.total - s.checked) : '';
  $('progFill').style.width = s && s.total ? Math.min(100, Math.round(s.checked * 100 / s.total)) + '%' : '0%';
  const rec = s ? s.recent : [];
  $('recent').innerHTML = rec.map((r) => '<li><button type="button" class="rc" data-id="' + esc(r.id) + '"><span class="rc-no">' + esc(r.number) + '</span><span class="rc-n">' + esc(r.name) + '</span><span class="rc-t">' + esc(fmtTime(r.checkedAt)) + '</span>' + (r.mine ? '<span class="rc-m">ของคุณ</span>' : '') + '</button></li>').join('');
  $('recentEmpty').classList.toggle('hidden', rec.length > 0);
}
$('recent').onclick = (e) => { const b = e.target.closest('.rc'); if (b) viewStudent(b.dataset.id); };
setInterval(() => { if (!document.hidden && navigator.onLine !== false && auth && $('app') && !$('app').classList.contains('hidden')) loadStats(); }, 12000);
const bump = (mine) => { if (stats) { stats.checked += mine; stats.mine += mine; renderStats(); } };

// ---------- camera: on from the start; a scan only pauses the picture behind the pop-up ----------
function scanCfg() {
  return { fps: 25, qrbox: (w, h) => { const m = Math.min(240, Math.floor(Math.min(w, h) * 0.9)); return { width: m, height: m }; }, disableFlip: true,
    experimentalFeatures: { useBarCodeDetectorIfSupported: true },
    videoConstraints: { facingMode: camFacing, aspectRatio: { ideal: 1 }, width: { ideal: 1280 }, advanced: [{ focusMode: 'continuous' }] } };
}
function camError(msg) {
  const b = $('camErr'); if (!msg) { b.classList.add('hidden'); b.innerHTML = ''; return; }
  b.innerHTML = '<b>' + esc(msg) + '</b><span>ถ้าเบราว์เซอร์ถามสิทธิ์กล้อง ให้กด “อนุญาต” · ถ้าเคยกดไม่อนุญาต ให้แตะไอคอนล็อกข้างช่องที่อยู่เว็บ แล้วเปิดสิทธิ์กล้อง หรือกรอกรหัสนักศึกษาด้านล่างแทน</span><button type="button" class="btn sm" id="camRetry">ลองเปิดกล้องอีกครั้ง</button>';
  b.classList.remove('hidden'); $('camRetry').onclick = () => { camWant = true; startCamera(); };
}
function camButtons() {
  const on = !!camera; $('camStart').classList.toggle('hidden', on); $('camStop').classList.toggle('hidden', !on);
  if (!on) { $('camTorch').classList.add('hidden'); $('camFlip').classList.add('hidden'); }
}
async function startCamera() {
  if (camera || camBusy) return;
  if (!window.Html5Qrcode) { camError('โหลดตัวสแกนไม่สำเร็จ ลองรีเฟรชหน้า'); return; }
  camBusy = true; camWant = true; camError('');
  try {
    const c = new Html5Qrcode('reader'); camera = c;   // set first: a scan can arrive the moment the stream starts
    await c.start({ facingMode: camFacing }, scanCfg(), onDecoded, () => {});
    camButtons(); probeCamera(c);
  } catch (e) { camera = null; camWant = false; camButtons(); camError('เปิดกล้องไม่ได้'); }
  finally { camBusy = false; }
}
async function probeCamera(c) {
  try { const t = c.getRunningTrackCameraCapabilities().torchFeature(); if (t && t.isSupported()) { $('camTorch').classList.remove('hidden'); $('camTorch').setAttribute('aria-pressed', 'false'); } } catch (e) { /* no torch */ }
  try { const cams = await Html5Qrcode.getCameras(); if (cams && cams.length > 1) $('camFlip').classList.remove('hidden'); } catch (e) { /* one camera */ }
}
$('camTorch').onclick = async () => {
  if (!camera) return; try { const t = camera.getRunningTrackCameraCapabilities().torchFeature(), on = !t.value(); await t.apply(on); $('camTorch').setAttribute('aria-pressed', on ? 'true' : 'false'); $('camTorch').textContent = on ? 'ไฟฉาย: เปิด' : 'ไฟฉาย'; } catch (e) { toast('เปิดไฟฉายไม่ได้', true); }
};
$('camFlip').onclick = async () => { camFacing = camFacing === 'environment' ? 'user' : 'environment'; await haltCamera(); $('camTorch').textContent = 'ไฟฉาย'; startCamera(); };
const pauseCamera = () => { if (camera) { try { camera.pause(true); } catch (e) { /* not scanning */ } } };
const resumeCamera = () => { if (camera) { try { camera.resume(); } catch (e) { /* not paused */ } } else if (camWant) startCamera(); };
async function haltCamera() { if (camera) { const c = camera; camera = null; try { await c.stop(); } catch (e) { /* ignore */ } } camButtons(); }
async function stopCamera() { camWant = false; await haltCamera(); }
$('camStart').onclick = () => { camWant = true; startCamera(); }; $('camStop').onclick = stopCamera;
document.addEventListener('visibilitychange', async () => { if (!auth) return; if (document.hidden) await haltCamera(); else { if (camWant && !$('resDlg').open) startCamera(); loadStats(); flushQueue(); } });
let lastText = '', lastAt = 0;
function onDecoded(text) {
  if ($('resDlg').open || scanning) return;   // one scan at a time
  const now = Date.now(); if (text === lastText && now - lastAt < 3000) return; lastText = text; lastAt = now;   // the same QR held in front of the camera
  pauseCamera(); check(text);
}
$('sidForm').onsubmit = (e) => { e.preventDefault(); check($('sid').value); };

// ---------- offline queue: check-ins made without signal wait on this phone and are sent when the signal is back ----------
const getQ = () => ls.get('lotto.queue') || [];
const setQ = (q) => { ls.set('lotto.queue', q); showQueue(); };
let flushing = false;
function showQueue() {
  const n = getQ().length, off = navigator.onLine === false, b = $('offBar');
  if (!off && !n) { b.classList.add('hidden'); return; }
  b.className = 'offbar' + (off ? ' off' : '');
  b.textContent = (off ? 'ออฟไลน์ · ยังเช็กชื่อต่อได้จากรายชื่อในเครื่อง' : '') + (n ? (off ? ' · ' : '') + 'รอส่ง ' + n + ' รายการ' + (off ? '' : ' · กำลังส่ง…') : '');
}
async function flushQueue() {
  if (flushing || !auth || navigator.onLine === false) return; let q = getQ(); if (!q.length) return;
  flushing = true; let sent = 0; const problems = [];
  try {
    while (q.length) {
      const it = q[0];
      try { await send('POST', '/camps/lotto/admin/scan', { studentId: it.id, queuedAt: it.at }); sent++; }
      catch (e) {
        if (isNet(e) || e.status === 429 || e.status >= 500 || AUTH_GONE.includes(e.error)) break;
        if (e.status === 409 && e.data && e.data.student && String(e.data.student.checked_by).toLowerCase() === myEmail) sent++;   // already recorded by this phone
        else problems.push({ id: it.id, msg: e.status === 409 ? 'ถูกเช็กชื่อไปแล้วโดย ' + ((e.data.student || {}).checked_by || 'คนอื่น') : e.message });
      }
      q = q.slice(1); setQ(q);
    }
  } finally { flushing = false; }
  if (sent || problems.length) { toast(sent ? 'ส่งรายการที่ค้างแล้ว ' + sent + ' รายการ' : 'ส่งรายการที่ค้างไม่สำเร็จ', !sent); loadRoster().then(renderStats); loadStats(); }
  if (problems.length) showProblems(problems);
  if (getQ().length) setTimeout(flushQueue, 15000);
}
function showProblems(list) {
  $('result').innerHTML = '<div class="nd-banner bad"><b>มีบางรายการบันทึกไม่ได้</b><span>เช็กชื่อไว้ตอนออฟไลน์ แต่ระบบไม่รับเมื่อส่งขึ้น</span></div><ul class="plist">' + list.map((p) => '<li><b>' + esc(p.id) + '</b><span>' + esc(p.msg) + '</span></li>').join('') + '</ul><div class="nd-actions"><button id="nextBtn" class="btn primary" type="button">ปิด</button></div>';
  $('nextBtn').onclick = closeDlg; openDlg(true);
}
window.addEventListener('online', () => { showQueue(); flushQueue(); loadStats(); loadRoster(); });
window.addEventListener('offline', showQueue);

// ---------- scan = check in + show the number ----------
// Order: the pop-up opens at once from the roster on the phone (number + name), the server answer then confirms it (green) or corrects it (amber / red).
let shown = null;   // { id, mode } what the pop-up is about
async function check(raw) {
  raw = String(raw || '').trim(); if (!raw) { toast('กรอกรหัสนักศึกษาหรือสแกน QR ก่อน', true); return; }
  const id = parseId(raw);
  if (!id) { render({ mode: 'error', title: 'ไม่ใช่รหัสนักศึกษา', note: 'QR Code นี้ไม่ใช่รหัสนักศึกษา ลองสแกนใหม่', id: raw }); beep('bad'); openDlg(true); return; }
  scanning = true; $('sid').value = id;
  const local = roster.get(id);
  if (local) { render({ mode: local.checkedAt ? 'dup' : 'pending', s: local }); openDlg(false, true); }
  else { render({ mode: 'wait', id }); openDlg(false, true); }
  loadPicture(id);
  try {
    const d = await send('POST', '/camps/lotto/admin/scan', { studentId: id });
    setLocal(d.student); if (shown && shown.id === id) render({ mode: 'ok', s: d.student }); beep('ok'); vibrate(false); bump(1); loadStats(); autoClose();
  } catch (e) {
    if (e.status === 409 && e.data && e.data.student) { setLocal(e.data.student); if (shown && shown.id === id) render({ mode: 'dup', s: e.data.student }); beep('warn'); vibrate(true); loadStats(); }
    else if (e.status === 404) { render({ mode: 'error', title: 'ไม่พบรายชื่อนี้', note: 'รหัส ' + id + ' ไม่มีในรายชื่อจับสลาก ลองสแกนใหม่หรือแจ้งแอดมิน', id }); beep('bad'); vibrate(true); }
    else if (e.error && AUTH_GONE.includes(e.error)) { closeDlg(); $('login').classList.remove('hidden'); $('app').classList.add('hidden'); $('account').textContent = 'เซสชันหมดอายุ ลองเข้าใหม่'; }
    else if (isNet(e)) offlineCheck(id, local);
    else { render({ mode: 'error', title: 'บันทึกไม่ได้', note: e.message, id }); beep('bad'); vibrate(true); }
  } finally { scanning = false; }
}
function setLocal(st) { const r = roster.get(st.student_id) || { id: st.student_id, name: st.student_name, number: st.draw_number }; r.checkedAt = st.checked_at; r.checkedBy = st.checked_by; roster.set(r.id, r); }
function offlineCheck(id, local) {
  if (!local) { render({ mode: 'error', title: 'ออฟไลน์', note: 'ไม่มีรหัส ' + id + ' ในรายชื่อที่เก็บไว้ในเครื่อง ลองใหม่เมื่อมีสัญญาณ', id }); beep('bad'); vibrate(true); return; }
  if (local.checkedAt) { render({ mode: 'dup', s: local }); beep('warn'); return; }
  const q = getQ(); q.push({ id, at: new Date().toISOString() }); setQ(q);
  local.checkedAt = nowSql(); local.checkedBy = myEmail; bump(1);
  render({ mode: 'queued', s: local }); beep('ok'); vibrate(false); autoClose();
}
async function loadPicture(id) {   // the photo is a bonus: asked for separately so it never slows the number down
  if (navigator.onLine === false) return;
  try { const d = await data('/camps/lotto/scanner/picture?studentId=' + id); if (d.picture && shown && shown.id === id) { const a = $('ndAvatar'); if (a) a.innerHTML = '<img alt="" referrerpolicy="no-referrer" src="' + esc(d.picture) + '">'; } } catch (e) { /* no photo */ }
}
function viewStudent(id) {   // a name from the recent list
  const s = roster.get(id); if (!s) return;
  render({ mode: s.checkedAt ? 'view' : 'pending-view', s }); openDlg(false, true); loadPicture(id);
}
async function undoCheck(id, queued) {
  const b = $('undoBtn'); if (b) b.disabled = true; stopAuto();
  try {
    if (queued) { setQ(getQ().filter((x) => x.id !== id)); }
    else await send('POST', '/camps/lotto/scanner/undo', { studentId: id });
    const r = roster.get(id); if (r) { r.checkedAt = null; r.checkedBy = null; } bump(-1);
    toast('ยกเลิกการเช็กชื่อแล้ว'); closeDlg(); loadStats();
  } catch (e) { toast(isNet(e) ? 'ออฟไลน์ ยกเลิกไม่ได้ในตอนนี้' : e.message, true); if (b) b.disabled = false; }
}

// ---------- the pop-up: the draw number, huge ----------
const BANNER = {
  wait: ['', 'กำลังตรวจ…'], pending: ['', 'กำลังบันทึก…'], 'pending-view': ['warn', 'ยังไม่ได้เช็กชื่อ'],
  ok: ['ok', '✓ เช็กชื่อสำเร็จ'], queued: ['warn', '✓ เช็กชื่อแล้ว · รอส่งขึ้นระบบ'], dup: ['warn', '! เช็กชื่อไปแล้ว'], view: ['ok', '✓ เช็กชื่อแล้ว']
};
function render(o) {
  const m = o.mode;
  if (m === 'error') {
    shown = { id: o.id, mode: m };
    $('result').innerHTML = '<div class="nd-banner bad"><b>' + esc(o.title) + '</b><span>' + esc(o.note) + '</span></div><div class="nd-actions"><button id="nextBtn" class="btn primary" type="button">ปิด</button></div>';
    $('nextBtn').onclick = closeDlg; return;
  }
  const s = o.s || {}, id = s.id || s.student_id || o.id, name = s.name || s.student_name || '', number = s.number || s.draw_number || '', by = s.checkedBy || s.checked_by, at = s.checkedAt || s.checked_at;
  shown = { id, mode: m }; const [cls, label] = BANNER[m];
  const mine = by && String(by).toLowerCase() === myEmail;
  const initial = [...String(name).replace(/^(นางสาว|นาย|นาง|เด็กชาย|เด็กหญิง)\s*/, '')][0] || '?';
  const len = String(number).length;
  let meta = 'รหัส ' + esc(id);
  if (m === 'dup' || m === 'view') meta += '<br>เช็กชื่อเมื่อ ' + esc(fmtFull(at)) + (by ? ' โดย ' + esc(by) : '');
  const canUndo = (m === 'ok' || m === 'queued' || ((m === 'dup' || m === 'view') && (mine || isAdmin)));
  $('result').innerHTML = '<div class="autobar-slot"></div><div class="nd-banner ' + cls + '"><b>' + label + '</b></div>'
    + (number ? '<div class="nd-label">เลขจับสลาก</div><div class="nd-number' + (len > 8 ? ' xlong' : len > 5 ? ' long' : '') + '" id="ndNumber">' + esc(number) + '</div>' : '<div class="nd-wait" aria-hidden="true"></div>')
    + (name ? '<div class="nd-person"><span class="nd-avatar" id="ndAvatar">' + esc(initial) + '</span><div><div class="nd-name">' + esc(name) + '</div><div class="nd-meta">' + meta + '</div></div></div>' : '')
    + '<div class="nd-actions">' + (canUndo ? '<button id="undoBtn" class="btn danger" type="button">ยกเลิกการเช็กชื่อ</button>' : '') + '<button id="nextBtn" class="btn primary" type="button">' + (m === 'view' || m === 'pending-view' ? 'ปิด' : 'คนต่อไป') + '</button></div>';
  $('nextBtn').onclick = closeDlg;
  const ub = $('undoBtn'); if (ub) ub.onclick = () => { if ((m === 'dup' || m === 'view') && !confirm('ยกเลิกการเช็กชื่อของ ' + name + ' ?')) return; undoCheck(id, m === 'queued'); };
  if (m === 'pending-view') { const nb = document.createElement('button'); nb.className = 'btn ok'; nb.type = 'button'; nb.textContent = 'เช็กชื่อตอนนี้'; nb.onclick = () => { closeDlgSilently(); check(id); }; $('result').querySelector('.nd-actions').prepend(nb); }
}
let dlgT = null;
const AUTO_EVENTS = ['pointerdown', 'keydown', 'focusin'];
function stopAuto() { clearTimeout(dlgT); dlgT = null; AUTO_EVENTS.forEach((ev) => $('resDlg').removeEventListener(ev, stopAuto)); const b = document.querySelector('#result .autobar'); if (b) b.remove(); }
function autoClose() {   // a successful check-in closes itself so the next person can step up; touching the pop-up keeps it open
  stopAuto();
  const slot = document.querySelector('#result .autobar-slot'); if (slot) slot.innerHTML = '<div class="autobar"><i style="animation-duration:' + AUTO_CLOSE_MS + 'ms"></i></div>';
  dlgT = setTimeout(closeDlg, AUTO_CLOSE_MS);
  AUTO_EVENTS.forEach((ev) => $('resDlg').addEventListener(ev, stopAuto));
}
const vibrate = (bad) => { try { if (navigator.vibrate) navigator.vibrate(bad ? [90, 60, 90] : 40); } catch (e) { /* optional */ } };
function openDlg(bad, quiet) { const d = $('resDlg'); pauseCamera(); if (!d.open) { if (d.showModal) d.showModal(); else d.setAttribute('open', ''); if (!quiet) vibrate(!!bad); } d.scrollTop = 0; }
let silent = false;
function closeDlgSilently() { silent = true; closeDlg(); }
function closeDlg() { stopAuto(); const d = $('resDlg'); if (d.open) d.close(); }
$('resDlg').addEventListener('close', () => { stopAuto(); lastAt = Date.now(); shown = null; $('result').innerHTML = ''; $('sid').value = ''; if (silent) { silent = false; return; } if (camera || camWant) resumeCamera(); else $('sid').focus(); });
$('resDlg').addEventListener('click', (e) => { if (e.target === $('resDlg')) closeDlg(); });
$('resX').onclick = closeDlg;

init();
})();
