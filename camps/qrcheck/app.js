(() => {
'use strict';
// ระบบเช็ก QR — the scan page for officers: pick today's round, scan (the camera stays on), a pop-up shows the student, the result is recorded at once.
// Built for speed at the gate: a successful scan closes its own pop-up, a wrong scan can be undone, scans made without signal wait on the phone and are sent later.
// Results, rounds and officers are managed in the admin page (/admin/#qr).
const API = 'https://engedlru-api.stnetworld.workers.dev', DOMAIN = window.QRCHECK_AUTH0_DOMAIN || 'auth.litalkeducation.com', CLIENT = window.QRCHECK_AUTH0_CLIENT_ID || 'PGqozL94LzOwstm4pD39W5kvalYRiK7w', REDIRECT = location.origin + '/qrcheck/';   // Allowed Callback + Logout URLs must list it
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const GENDER = { M: 'ชาย', F: 'หญิง' };
const AUTH_GONE = ['login_required', 'missing_refresh_token', 'invalid_grant', 'consent_required', 'interaction_required'];
const KIND = { manual: 'ตรวจทั่วไป', aka: 'เทียบป้ายกับ AKA' };
const AUTO_CLOSE_MS = 2500;
let auth = null, isAdmin = false, myEmail = '', checks = [], checkId = null, cur = null, camera = null, camWant = true, camFacing = 'environment', camBusy = false, scanning = false;

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
// no signal / server unreachable (not an answer from the server, not an expired sign-in)
const isNet = (e) => !e.status && !AUTH_GONE.includes(e.error);
const fmt = (s) => (s ? new Date(String(s).replace(' ', 'T') + 'Z').toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' }) : '—');
const fmtShort = (s) => (s ? new Date(String(s).replace(' ', 'T') + 'Z').toLocaleString('th-TH', { day: 'numeric', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—');
const fmtTime = (s) => (s ? new Date(String(s).replace(' ', 'T') + 'Z').toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }) : '');
const badge = (r) => '<span class="badge ' + (r === 'pass' ? 'ok' : 'bad') + '">' + (r === 'pass' ? 'ผ่าน' : 'ไม่ผ่าน') + '</span>';
const curCheck = () => checks.find((c) => c.id === checkId);
const today = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
const parseId = (v) => { const s = String(v || '').trim().replace(/[๐-๙]/g, (c) => String(c.charCodeAt(0) - 0x0e50)); const m = /^([a-z]{2})?(\d{6,12})(?:@lru\.ac\.th)?$/i.exec(s); return m ? m[2] : null; };

// ---------- sound: a short tone tells pass / problem without looking at the screen ----------
let actx = null, soundOn = ls.get('qrcheck.snd') !== false;
function unlockAudio() { try { if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)(); if (actx.state === 'suspended') actx.resume(); } catch (e) { /* no audio */ } }
['pointerdown', 'keydown', 'touchstart'].forEach((ev) => window.addEventListener(ev, unlockAudio, { passive: true }));
function tone(freq, start, dur) { const o = actx.createOscillator(), g = actx.createGain(); o.type = 'sine'; o.frequency.value = freq; o.connect(g); g.connect(actx.destination); const t = actx.currentTime + start; g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.35, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur); o.start(t); o.stop(t + dur + 0.02); }
function beep(kind) {
  if (!soundOn || !actx || actx.state !== 'running') return;
  try { if (kind === 'ok') { tone(880, 0, 0.12); tone(1175, 0.13, 0.14); } else if (kind === 'warn') tone(520, 0, 0.22); else { tone(240, 0, 0.18); tone(240, 0.24, 0.18); } } catch (e) { /* ignore */ }
}
function showSound() { const b = $('sndBtn'); b.textContent = 'เสียง: ' + (soundOn ? 'เปิด' : 'ปิด'); b.setAttribute('aria-pressed', soundOn ? 'true' : 'false'); }
$('sndBtn').onclick = () => { soundOn = !soundOn; ls.set('qrcheck.snd', soundOn); showSound(); unlockAudio(); if (soundOn) beep('ok'); };
showSound();

// ---------- sign-in ----------
async function init() {
  try {
    auth = await auth0.createAuth0Client({ domain: DOMAIN, clientId: CLIENT, cacheLocation: 'localstorage', useRefreshTokens: true, authorizationParams: { redirect_uri: REDIRECT } });
    if (location.search.includes('code=') || location.search.includes('error=')) { try { await auth.handleRedirectCallback(); } finally { history.replaceState({}, document.title, location.pathname); } }
    if (!(await auth.isAuthenticated())) { $('login').classList.remove('hidden'); $('account').textContent = 'ยังไม่ได้เข้าสู่ระบบ'; return; }
    const u = await auth.getUser();
    const me = await data('/camps/qrcheck/me'); isAdmin = !!me.isAdmin; myEmail = me.email || u.email || '';
    $('account').innerHTML = '<span class="acct-mail">' + esc(u.email || me.email) + '</span>' + (isAdmin ? ' <span class="badge info">แอดมิน</span>' : '') + ' <button id="logoutBtn" class="link" type="button">ออก</button>';
    $('logoutBtn').onclick = signOut;
    $('login').classList.add('hidden'); $('app').classList.remove('hidden');
    if (isAdmin) $('adminLink').classList.remove('hidden');
    await loadChecks(); showQueue(); flushQueue();
    if (camWant) startCamera();   // the camera is on from the start
  } catch (e) {
    $('login').classList.remove('hidden');
    if (AUTH_GONE.includes(e.error)) { $('account').textContent = 'เข้าสู่ระบบหมดอายุ ลองเข้าใหม่'; return; }
    if (e.status === 403) { $('login').querySelector('p').textContent = 'บัญชีนี้ยังไม่มีสิทธิ์ใช้งาน ลองเปลี่ยนบัญชี หรือแจ้งแอดมิน'; $('account').innerHTML = 'ไม่มีสิทธิ์ · <button id="logoutBtn" class="link" type="button">เปลี่ยนบัญชี</button>'; $('logoutBtn').onclick = signOut; return; }
    $('login').querySelector('p').textContent = e.message || 'เชื่อมต่อไม่ได้ ลองใหม่อีกครั้ง'; $('account').textContent = 'เกิดข้อผิดพลาด';
  }
}
function signOut() { try { sessionStorage.setItem('chooseGoogle', '1'); } catch (e) { /* ignore */ } auth.logout({ logoutParams: { returnTo: REDIRECT } }); }
$('loginBtn').onclick = () => { const ap = { connection: 'google-oauth2' }; try { if (sessionStorage.getItem('chooseGoogle')) { ap.prompt = 'select_account'; sessionStorage.removeItem('chooseGoogle'); } } catch (e) { /* ignore */ } auth.loginWithRedirect({ authorizationParams: ap }); };

// ---------- the round being checked: a big chip above the camera, and it must be chosen again each day ----------
async function loadChecks() {
  const d = await data('/camps/qrcheck/checks'); checks = d.checks || [];
  const saved = ls.get('qrcheck.round');
  const fromToday = saved && saved.day === today() && checks.find((c) => c.id === saved.id);
  checkId = fromToday ? saved.id : (checks.length === 1 ? checks[0].id : null);   // yesterday's round is never reused silently
  if (checkId) ls.set('qrcheck.round', { id: checkId, day: today() });
  renderRound(); loadStats();
}
function renderRound() {
  const sel = $('checkSel');
  sel.innerHTML = (checkId ? '' : '<option value="">— เลือกรอบที่จะตรวจวันนี้ —</option>') + (checks.length ? checks.map((c) => '<option value="' + c.id + '"' + (c.id === checkId ? ' selected' : '') + '>' + esc(c.name) + '</option>').join('') : '<option value="">ยังไม่มีรายการตรวจ</option>');
  $('round').classList.toggle('need', !checkId && checks.length > 0);
  const c = curCheck(), kind = c ? KIND[c.kind] : '';
  $('checkInfo').innerHTML = c ? esc(c.description || '') + (kind ? ' <span class="badge ' + (c.kind === 'aka' ? 'info' : 'muted') + '">' + kind + '</span>' : '') + (c.requireRegistered ? ' <span class="badge muted">ต้องเลือกฝ่ายแล้ว</span>' : '')
    : (checks.length ? 'เลือกรอบก่อนจึงจะสแกนได้ (เลือกใหม่ทุกวัน กันสแกนผิดรอบ)' : (isAdmin ? 'เพิ่มรายการตรวจที่หน้าแอดมิน (ผลการตรวจและตั้งค่า)' : 'ยังไม่มีรายการตรวจ แจ้งแอดมินให้เพิ่ม'));
}
$('checkSel').onchange = () => {
  checkId = Number($('checkSel').value) || null;
  if (checkId) ls.set('qrcheck.round', { id: checkId, day: today() });
  renderRound(); loadStats();
};
function needRound() { const r = $('round'); r.classList.remove('shake'); void r.offsetWidth; r.classList.add('shake'); toast('เลือกรอบที่จะตรวจก่อน', true); beep('bad'); }

// ---------- progress: how many are done, and the latest scans ----------
let statsT = null, lastStats = null;
async function loadStats() {
  if (!checkId) { lastStats = null; renderStats(); return; }
  try { lastStats = await data('/camps/qrcheck/stats?checkId=' + checkId); lastStats.check = checkId; } catch (e) { /* keep the last numbers */ }
  renderStats();
}
function renderStats() {
  const s = lastStats && lastStats.check === checkId ? lastStats : null;
  $('progN').textContent = s ? 'ตรวจแล้ว ' + s.done + (s.total ? ' / ' + s.total : '') + ' คน' : 'ตรวจแล้ว –';
  $('progSub').textContent = s ? 'คุณตรวจ ' + s.mine + ' คน' + (s.failed ? ' · ไม่ผ่าน ' + s.failed : '') : '';
  $('progFill').style.width = s && s.total ? Math.min(100, Math.round(s.done * 100 / s.total)) + '%' : '0%';
  $('recent').innerHTML = s && s.recent.length ? s.recent.map((r) => '<li><button type="button" class="rc" data-id="' + esc(r.studentId) + '"><span class="rc-n">' + esc(r.name || r.studentId) + '</span><span class="rc-t">' + esc(fmtTime(r.checkedAt)) + '</span>' + badge(r.result) + (r.mine ? '<span class="rc-m">ของคุณ</span>' : '') + '</button></li>').join('') : '';
}
$('recent').onclick = (e) => { const b = e.target.closest('.rc'); if (b) lookup(b.dataset.id, false, true, true); };
statsT = setInterval(() => { if (!document.hidden && checkId && navigator.onLine !== false) loadStats(); }, 30000);

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
// torch + "switch camera" buttons only when this phone has them
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
async function stopCamera() { camWant = false; await haltCamera(); }   // the officer turned it off
$('camStart').onclick = () => { camWant = true; startCamera(); }; $('camStop').onclick = stopCamera;
// a phone may stop the camera while the page is hidden: switch it on again when the page is back
document.addEventListener('visibilitychange', async () => { if (!auth) return; if (document.hidden) await haltCamera(); else { if (camWant && !$('resDlg').open) startCamera(); loadStats(); flushQueue(); } });
let lastText = '', lastAt = 0;
function onDecoded(text) {
  if ($('resDlg').open || scanning) return;   // one scan at a time
  const now = Date.now(); if (text === lastText && now - lastAt < 3000) return; lastText = text; lastAt = now;   // the same QR held in front of the camera
  if (!checkId) { needRound(); return; }
  pauseCamera(); lookup(text, true);
}
$('sidForm').onsubmit = (e) => { e.preventDefault(); lookup($('sid').value, false); };

// ---------- offline queue: scans made without signal wait on this phone and are sent when the signal is back ----------
const getQ = () => ls.get('qrcheck.queue') || [];
const setQ = (q) => { ls.set('qrcheck.queue', q); showQueue(); };
let flushing = false;
function showQueue() {
  const n = getQ().length, off = navigator.onLine === false, b = $('offBar');
  if (!off && !n) { b.classList.add('hidden'); return; }
  b.className = 'offbar' + (off ? ' off' : '');
  b.textContent = (off ? 'ออฟไลน์ · ' : '') + (n ? 'รอส่ง ' + n + ' รายการ' + (off ? ' (เก็บไว้ในเครื่องแล้ว จะส่งเมื่อมีสัญญาณ)' : ' · กำลังส่ง…') : 'สแกนไม่ได้จนกว่าจะมีสัญญาณ แต่รหัสที่สแกนจะถูกเก็บไว้ส่งทีหลัง');
}
async function flushQueue() {
  if (flushing || !auth || navigator.onLine === false) return; let q = getQ(); if (!q.length) return;
  flushing = true; let sent = 0; const problems = [];
  try {
    while (q.length) {
      const it = q[0];
      try { await send('POST', '/camps/qrcheck/scan', { studentId: it.id, checkId: it.checkId, queuedAt: it.at }); sent++; }
      catch (e) { if (isNet(e) || e.status === 429 || e.status >= 500) break; if (AUTH_GONE.includes(e.error)) break; problems.push({ id: it.id, msg: e.message }); }
      q = q.slice(1); setQ(q);
    }
  } finally { flushing = false; }
  if (sent || problems.length) { toast(sent ? 'ส่งรายการที่ค้างแล้ว ' + sent + ' รายการ' : 'ส่งรายการที่ค้างไม่สำเร็จ', !sent); loadStats(); }
  if (problems.length) showProblems(problems);
  if (getQ().length) setTimeout(flushQueue, 15000);
}
function showProblems(list) {
  $('result').innerHTML = '<div class="banner bad big"><b>มีบางรายการบันทึกไม่ได้</b><span>รายการที่สแกนไว้ตอนออฟไลน์ ตรวจสอบไม่ผ่านเมื่อส่งขึ้นระบบ</span></div><ul class="hist">' + list.map((p) => '<li><span>' + esc(p.id) + '</span><small>' + esc(p.msg) + '</small></li>').join('') + '</ul>' + nextButton('ปิด');
  bindNext(); openDlg(true);
}
window.addEventListener('online', () => { showQueue(); flushQueue(); loadStats(); });
window.addEventListener('offline', showQueue);

// ---------- look up / scan ----------
// scan = look the student up AND record "ตรวจแล้ว" for the chosen round in one step (readOnly: only look: used for the recent list)
async function lookup(value, fromCamera, quiet, readOnly) {
  const raw = String(value || '').trim(); if (!raw) { toast('กรอกรหัสนักศึกษาหรือสแกน QR ก่อน', true); return; }
  if (!checkId) { needRound(); return; }
  if (!readOnly && !parseId(raw)) { cur = null; renderProblem({ message: 'QR Code นี้ไม่ใช่รหัสนักศึกษา', data: { code: 'BAD_QR' } }, raw); beep('bad'); openDlg(true); return; }
  $('sid').value = raw; scanning = true;
  try {
    const d = await send('POST', readOnly ? '/camps/qrcheck/lookup' : '/camps/qrcheck/scan', { studentId: raw, checkId });
    cur = d; renderResult(d, { fromRecent: !!readOnly });
    const bad = d.blocked || (d.result && d.result.result === 'fail'); beep(bad ? 'bad' : d.justRecorded ? 'ok' : 'warn');
    openDlg(bad);
    if (!readOnly) loadStats();
    if (d.justRecorded && d.result && d.result.result === 'pass' && d.check.kind !== 'aka') autoClose();
  } catch (e) {
    cur = null;
    if (isNet(e) && !readOnly) { queueScan(raw); return; }
    if (e.error && AUTH_GONE.includes(e.error)) { $('login').classList.remove('hidden'); $('app').classList.add('hidden'); $('account').textContent = 'เข้าสู่ระบบหมดอายุ ลองเข้าใหม่'; return; }
    renderProblem(e, raw); beep('bad'); openDlg(true);
  } finally { scanning = false; }
}
function queueScan(raw) {
  const id = parseId(raw), q = getQ(); q.push({ id, checkId, at: new Date().toISOString() }); setQ(q);
  $('result').innerHTML = '<div class="banner warn big"><b>รับรหัสแล้ว · ยังไม่ได้ส่ง</b><span>ออฟไลน์อยู่ จึงยังตรวจชื่อไม่ได้ เก็บรหัส ' + esc(id) + ' ไว้ในเครื่อง จะบันทึกให้เมื่อมีสัญญาณ (รอส่ง ' + q.length + ' รายการ)</span></div>' + nextButton();
  bindNext(); beep('warn'); openDlg(false); autoClose();
}
function renderProblem(e, id) {
  const nf = e.data && e.data.code === 'NOT_FOUND';
  $('result').innerHTML = '<div class="banner bad big"><b>' + (nf ? 'ไม่พบรายชื่อนี้' : 'ตรวจสอบไม่ได้') + '</b><span>' + esc(e.message) + '</span></div>' + (nf ? '<p class="hint">รหัสที่สแกน: <b>' + esc(e.data.studentId || id) + '</b> ไม่มีรหัสนี้ในรายชื่อ จึงยังไม่ได้บันทึก ลองสแกนใหม่อีกครั้ง</p>' : '') + nextButton();
  bindNext();
}
const nextButton = (label) => '<div class="row end"><button id="nextBtn" class="btn primary" type="button">' + (label || 'ตรวจคนต่อไป') + '</button></div>';

// ---------- the result pop-up ----------
let dlgT = null;
const AUTO_EVENTS = ['pointerdown', 'keydown', 'focusin'];
function stopAuto() { clearTimeout(dlgT); dlgT = null; AUTO_EVENTS.forEach((ev) => $('resDlg').removeEventListener(ev, stopAuto)); const b = document.querySelector('#result .autobar'); if (b) b.remove(); }
function autoClose() {
  stopAuto();
  const bar = document.createElement('div'); bar.className = 'autobar'; bar.innerHTML = '<i style="animation-duration:' + AUTO_CLOSE_MS + 'ms"></i>'; $('result').prepend(bar);
  dlgT = setTimeout(closeDlg, AUTO_CLOSE_MS);
  AUTO_EVENTS.forEach((ev) => $('resDlg').addEventListener(ev, stopAuto));   // touching the pop-up keeps it open
}
function openDlg(bad) { const d = $('resDlg'); pauseCamera(); if (!d.open) { if (d.showModal) d.showModal(); else d.setAttribute('open', ''); try { if (navigator.vibrate) navigator.vibrate(bad ? [90, 60, 90] : 50); } catch (e) { /* optional */ } } d.scrollTop = 0; }
function closeDlg() { const d = $('resDlg'); stopAuto(); if (d.open) d.close(); }
$('resDlg').addEventListener('close', () => { stopAuto(); lastAt = Date.now(); cur = null; $('result').innerHTML = ''; $('sid').value = ''; if (camera || camWant) resumeCamera(); else $('sid').focus(); });
$('resDlg').addEventListener('click', (e) => { if (e.target === $('resDlg')) closeDlg(); });
$('resX').onclick = closeDlg;
function bindNext() { const b = $('nextBtn'); if (b) b.onclick = closeDlg; }

function renderResult(d, opt) {
  const s = d.student, c = d.check, r = d.result;
  const mine = r && myEmail && String(r.checked_by).toLowerCase() === myEmail.toLowerCase();
  const canRefine = !d.blocked && r && (isAdmin || mine);
  const initial = [...String(s.name).replace(/^(นางสาว|นาย|นาง|เด็กชาย|เด็กหญิง)\s*/, '')][0] || '?';
  const photo = d.picture ? '<img class="avatar" alt="" referrerpolicy="no-referrer" src="' + esc(d.picture) + '">' : '<span class="avatar ph">' + esc(initial) + '</span>';
  // 1. the outcome, first and large
  let h;
  if (d.blocked) h = '<div class="banner bad big"><b>บันทึกไม่ได้</b><span>' + esc(d.blocked) + ' (รายการตรวจ “' + esc(c.name) + '” ต้องเลือกฝ่ายก่อน)</span></div>';
  else if (!r) h = '<div class="banner big"><b>ยังไม่ได้ตรวจ</b><span>รายการตรวจ “' + esc(c.name) + '” ยังไม่มีการบันทึกของนักศึกษาคนนี้</span></div>';
  else if (r.result === 'fail') h = '<div class="banner bad big"><b>ตรวจแล้ว · ไม่ผ่าน</b><span>' + esc(c.name) + ' · ' + esc(fmt(r.checked_at)) + ' · ' + esc(r.checked_by) + '</span></div>';
  else if (d.justRecorded) h = '<div class="banner ok big"><b>ตรวจแล้ว</b><span>บันทึกการตรวจ “' + esc(c.name) + '” แล้ว · ' + esc(fmt(r.checked_at)) + ' · ' + esc(r.checked_by) + '</span></div>';
  else h = '<div class="banner warn big"><b>ตรวจแล้ว (บันทึกไว้ก่อนหน้านี้)</b><span>' + esc(c.name) + ' · เมื่อ ' + esc(fmt(r.checked_at)) + ' โดย ' + esc(r.checked_by) + ' · ไม่ได้บันทึกซ้ำ</span></div>';
  // 2. who it is (from the registration database)
  h += '<div class="person">' + photo + '<div><div class="pname">' + esc(s.name) + '</div><div class="pid">รหัสนักศึกษา ' + esc(s.studentId) + ' · พบรายชื่อ</div></div></div>'
    + '<dl class="kv"><dt>ชั้นปี</dt><dd>ปี ' + esc(s.year) + '</dd><dt>เพศ</dt><dd>' + esc(GENDER[s.gender] || '—') + '</dd><dt>ฝ่าย</dt><dd>' + (s.departmentName ? esc(s.departmentName) : '<span class="muted-t">ยังไม่ได้ลงทะเบียนเลือกฝ่าย</span>') + '</dd>'
    + (d.aka ? '<dt>ชื่อเล่น</dt><dd>' + esc(d.aka.nickname || '—') + '</dd><dt>AKA</dt><dd>' + esc(d.aka.aka || '—') + '</dd>' : '') + (r ? '<dt>ผลการตรวจ</dt><dd>' + badge(r.result) + (r.reference ? ' · ข้อความบนป้าย <b>' + esc(r.reference) + '</b>' : '') + (r.note ? '<div class="small">หมายเหตุ: ' + esc(r.note) + '</div>' : '') + (r.updated_at ? '<div class="small">แก้ไขล่าสุด ' + esc(fmt(r.updated_at)) + ' โดย ' + esc(r.updated_by || '—') + '</div>' : '') + '</dd>' : '') + '</dl>';
  if (c.kind === 'aka') h += d.aka && d.aka.aka
    ? '<div class="akabox"><small>AKA ที่ต้องตรงกับป้าย</small><b>' + esc(d.aka.aka) + '</b>' + (d.aka.nickname ? '<span>ชื่อเล่น ' + esc(d.aka.nickname) + '</span>' : '') + '</div>'
    : '<div class="akabox none"><small>AKA ที่ต้องตรงกับป้าย</small><b>ยังไม่ได้ตั้งชื่อ AKA</b><span>นักศึกษายังไม่ได้ตั้งชื่อในระบบ AKA</span></div>';
  // 3. actions
  if (!r && !d.blocked) h += '<div class="row end"><button id="recNow" class="btn ok" type="button">บันทึกว่าตรวจแล้ว</button></div>';
  if (canRefine) h += refineForm(c, r, !mine && isAdmin);
  else if (r && !isAdmin) h += '<p class="hint">แก้ผลได้เฉพาะคนที่บันทึกไว้ หรือแอดมิน</p>';
  if (d.history && d.history.length) h += '<details class="histbox"><summary>ประวัติการตรวจของนักศึกษา (' + d.history.length + ')</summary><ul class="hist">' + d.history.map((x) => '<li><span>' + esc(x.name) + '</span>' + badge(x.result) + '<small>' + esc(fmtShort(x.checked_at)) + '</small></li>').join('') + '</ul></details>';
  // undo a wrong scan: right after recording it, or later from the recent list (own results; admins any)
  h += '<div class="row end">' + (r && !d.blocked && (isAdmin || mine) ? '<button id="undoBtn" class="btn danger" type="button">ยกเลิกการตรวจ</button>' : '') + '<button id="nextBtn" class="btn primary" type="button">' + (opt && opt.fromRecent ? 'ปิด' : 'ตรวจคนต่อไป') + '</button></div>';
  $('result').innerHTML = h; bindNext(); bindActions(!!d.justRecorded);
  const im = document.querySelector('#result img.avatar'); if (im) im.onerror = () => { const sp = document.createElement('span'); sp.className = 'avatar ph'; sp.textContent = initial; im.replaceWith(sp); };
}
// optional follow-up on a recorded check: badge code (AKA), note, or change the result
function refineForm(c, r, byAdmin) {
  const open = c.kind === 'aka' && !r.reference ? ' open' : '';
  return '<details class="refine"' + open + '><summary>' + (c.kind === 'aka' ? 'บันทึกข้อความบนป้าย / หมายเหตุ / เปลี่ยนผล' : 'หมายเหตุ / เปลี่ยนผลการตรวจ') + (byAdmin ? ' (แอดมิน)' : '') + '</summary><form id="recForm" novalidate>'
    + (c.kind === 'aka' ? '<label>ข้อความบนป้าย (ชื่อ AKA ที่เห็นบนป้าย)<input id="recRef" maxlength="60" autocomplete="off" placeholder="พิมพ์สิ่งที่เห็นบนป้าย" value="' + esc(r.reference) + '"></label>' : '')
    + '<label>หมายเหตุ <small>(จำเป็นเมื่อเปลี่ยนเป็นไม่ผ่าน)</small><input id="recNote" maxlength="300" autocomplete="off" placeholder="เช่น ชื่อบนป้ายไม่ตรง" value="' + esc(r.note) + '"></label>'
    + '<div class="row"><button type="button" id="recSave" class="btn primary">บันทึกข้อมูล</button>' + (r.result === 'pass' ? '<button type="button" id="recFail" class="btn danger">เปลี่ยนเป็นไม่ผ่าน</button>' : '<button type="button" id="recPass" class="btn ok">เปลี่ยนเป็นผ่าน</button>') + '</div></form></details>';
}
function bindActions(justRecorded) {
  const now = $('recNow'); if (now) now.onclick = async () => { now.disabled = true; stopAuto(); await lookup(cur.student.studentId, false, true); };
  const un = $('undoBtn'); if (un) un.onclick = async () => {
    if (!justRecorded && !confirm('ยกเลิกผลการตรวจของ ' + cur.student.name + ' ?')) return;
    un.disabled = true; stopAuto();
    try { await send('POST', '/camps/qrcheck/undo', { studentId: cur.student.studentId, checkId }); toast('ยกเลิกการตรวจแล้ว'); closeDlg(); loadStats(); }
    catch (e) { toast(e.message, true); un.disabled = false; }
  };
  if (!$('recForm')) return;
  const go = async (result) => {
    const note = $('recNote').value.trim(), reference = $('recRef') ? $('recRef').value.trim() : '';
    if (result === 'fail' && !note) { $('recNote').focus(); return toast('ระบุเหตุผลในช่องหมายเหตุเมื่อไม่ผ่าน', true); }
    ['recSave', 'recFail', 'recPass'].forEach((id) => { if ($(id)) $(id).disabled = true; });
    try {
      await send('POST', '/camps/qrcheck/record', { studentId: cur.student.studentId, checkId, result, note, reference, overwrite: true });
      toast('บันทึกแล้ว'); await lookup(cur.student.studentId, false, true, true); loadStats();
    } catch (e) { toast(e.message, true); ['recSave', 'recFail', 'recPass'].forEach((id) => { if ($(id)) $(id).disabled = false; }); }
  };
  $('recSave').onclick = () => go(cur.result.result);
  if ($('recFail')) $('recFail').onclick = () => go('fail'); if ($('recPass')) $('recPass').onclick = () => go('pass');
}

init();
})();
