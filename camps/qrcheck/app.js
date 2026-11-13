(() => {
'use strict';
// This system has its OWN Auth0 application (SPA) and callback /qrcheck/. Paste its Client ID below (see camps/README.md → "One Auth0 application per system").
const API = 'https://engedlru-api.stnetworld.workers.dev', DOMAIN = window.QRCHECK_AUTH0_DOMAIN || 'auth.litalkeducation.com', CLIENT = window.QRCHECK_AUTH0_CLIENT_ID || 'PGqozL94LzOwstm4pD39W5kvalYRiK7w', REDIRECT = location.origin + '/qrcheck/';   // Allowed Callback + Logout URLs must list it
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const GENDER = { M: 'ชาย', F: 'หญิง' };
const AUTH_GONE = ['login_required', 'missing_refresh_token', 'invalid_grant', 'consent_required', 'interaction_required'];
let auth = null, isAdmin = false, myEmail = '', checks = [], checkId = null, cur = null, camera = null, cameraMode = false;

// ---------- helpers ----------
let toastT;
function toast(msg, bad) { const t = $('toast'); t.textContent = msg; t.className = (bad ? 'bad ' : '') + 'show'; clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 3200); }
async function api(path, opt = {}) {
  const go = async (fresh) => { const t = await auth.getTokenSilently(fresh ? { cacheMode: 'off' } : undefined); return fetch(API + path, { ...opt, headers: { ...(opt.headers || {}), Authorization: 'Bearer ' + t } }); };
  let r = await go(false); if (r.status === 401) r = await go(true); return r;
}
async function data(path, opt) {
  const r = await api(path, opt), d = await r.json().catch(() => ({ error: 'ตอบกลับจากเซิร์ฟเวอร์ไม่ถูกต้อง' }));
  if (!r.ok) throw Object.assign(new Error(d.error || 'เกิดข้อผิดพลาด'), { status: r.status, data: d });
  return d;
}
const send = (method, path, body) => data(path, { method, headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
const fmt = (s) => (s ? new Date(String(s).replace(' ', 'T') + 'Z').toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' }) : '—');
const fmtShort = (s) => (s ? new Date(String(s).replace(' ', 'T') + 'Z').toLocaleString('th-TH', { day: 'numeric', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—');
const PLACEHOLDER = '<div class="placeholder"><svg viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2"/><path d="M8 12h8"/></svg><p>ยังไม่มีข้อมูล<br>สแกน QR หรือกรอกรหัสนักศึกษาเพื่อเริ่มตรวจ</p></div>';
const badge = (r) => '<span class="badge ' + (r === 'pass' ? 'ok' : 'bad') + '">' + (r === 'pass' ? 'ผ่าน' : 'ไม่ผ่าน') + '</span>';
const KIND = { manual: 'ตรวจทั่วไป', aka: 'เทียบป้ายกับ AKA' };
const curCheck = () => checks.find((c) => c.id === checkId);

// ---------- sign-in ----------
async function init() {
  try {
    auth = await auth0.createAuth0Client({ domain: DOMAIN, clientId: CLIENT, cacheLocation: 'localstorage', useRefreshTokens: true, authorizationParams: { redirect_uri: REDIRECT } });
    if (location.search.includes('code=') || location.search.includes('error=')) { try { await auth.handleRedirectCallback(); } finally { history.replaceState({}, document.title, REDIRECT); } }
    if (!(await auth.isAuthenticated())) { $('login').classList.remove('hidden'); $('account').textContent = 'ยังไม่ได้เข้าสู่ระบบ'; return; }
    const u = await auth.getUser();
    const me = await data('/camps/qrcheck/me'); isAdmin = !!me.isAdmin; myEmail = me.email || u.email || '';
    $('account').innerHTML = esc(u.email || me.email) + (isAdmin ? ' <span class="badge info">ผู้ดูแล</span>' : '') + ' · <button id="logoutBtn" class="link" type="button">ออกจากระบบ</button>';
    $('logoutBtn').onclick = signOut;
    document.querySelectorAll('.adm').forEach((b) => b.classList.toggle('hidden', !isAdmin));
    $('login').classList.add('hidden'); $('app').classList.remove('hidden');
    await loadChecks();
  } catch (e) {
    $('login').classList.remove('hidden');
    if (AUTH_GONE.includes(e.error)) { $('account').textContent = 'เซสชันหมดอายุ'; return; }
    if (e.status === 403) { $('login').querySelector('p').textContent = 'บัญชีนี้ยังไม่ได้รับมอบหมายให้ใช้ระบบเช็ค QR กรุณาติดต่อผู้ดูแล หรือเปลี่ยนบัญชี'; $('account').innerHTML = 'ไม่มีสิทธิ์ · <button id="logoutBtn" class="link" type="button">เปลี่ยนบัญชี</button>'; $('logoutBtn').onclick = signOut; return; }
    $('login').querySelector('p').textContent = e.message || 'ไม่สามารถเชื่อมต่อระบบได้'; $('account').textContent = 'เกิดข้อผิดพลาด';
  }
}
function signOut() { try { sessionStorage.setItem('chooseGoogle', '1'); } catch (e) { /* ignore */ } auth.logout({ logoutParams: { returnTo: REDIRECT } }); }
$('loginBtn').onclick = () => { const ap = { connection: 'google-oauth2' }; try { if (sessionStorage.getItem('chooseGoogle')) { ap.prompt = 'select_account'; sessionStorage.removeItem('chooseGoogle'); } } catch (e) { /* ignore */ } auth.loginWithRedirect({ authorizationParams: ap }); };

// ---------- tabs ----------
document.querySelectorAll('#tabs button').forEach((b) => b.onclick = async () => {
  await stopCamera();
  document.querySelectorAll('#tabs button').forEach((x) => x.classList.toggle('on', x === b));
  document.querySelectorAll('.view').forEach((v) => v.classList.add('hidden'));
  $('view-' + b.dataset.tab).classList.remove('hidden');
  if (b.dataset.tab === 'results') loadResults(); else if (b.dataset.tab === 'settings') loadSettings();
});

// ---------- 1. choose the check, scan, look up ----------
async function loadChecks() {
  const d = await data('/camps/qrcheck/checks'); checks = d.checks || [];
  let saved = null; try { saved = Number(localStorage.getItem('qrcheck.check')); } catch (e) { /* ignore */ }
  checkId = (checks.find((c) => c.id === saved) || checks[0] || {}).id || null;
  $('checkSel').innerHTML = checks.length ? checks.map((c) => '<option value="' + c.id + '"' + (c.id === checkId ? ' selected' : '') + '>' + esc(c.name) + '</option>').join('') : '<option value="">ยังไม่มีรายการตรวจ</option>';
  showCheckInfo();
}
function showCheckInfo() {
  const c = curCheck();
  $('checkInfo').innerHTML = c ? esc(c.description || '') + ' <span class="badge ' + (c.kind === 'aka' ? 'info' : 'muted') + '">' + KIND[c.kind] + '</span>' + (c.requireRegistered ? ' <span class="badge muted">ต้องลงทะเบียนเลือกฝ่ายแล้ว</span>' : '') : (isAdmin ? 'เพิ่มรายการตรวจที่แท็บ “ตั้งค่า”' : 'ติดต่อผู้ดูแลให้เพิ่มรายการตรวจ');
}
$('checkSel').onchange = () => { checkId = Number($('checkSel').value) || null; try { localStorage.setItem('qrcheck.check', String(checkId)); } catch (e) { /* ignore */ } showCheckInfo(); if (cur) lookup(cur.student.studentId, false, true, true); };

async function startCamera() {
  if (!window.Html5Qrcode) return toast('โหลดเครื่องมือสแกนไม่สำเร็จ กรุณารีเฟรชหน้า', true);
  try {
    camera = new Html5Qrcode('reader');
    await camera.start({ facingMode: 'environment' }, { fps: 10, qrbox: { width: 240, height: 240 } }, async (text) => { await stopCamera(); lookup(text, true); }, () => {});
    $('camStart').classList.add('hidden'); $('camStop').classList.remove('hidden');
  } catch (e) { toast('เปิดกล้องไม่ได้ กรุณาอนุญาตการใช้กล้อง หรือกรอกรหัสนักศึกษาแทน', true); }
}
async function stopCamera() { if (camera) { try { await camera.stop(); } catch (e) { /* ignore */ } camera = null; } $('camStart').classList.remove('hidden'); $('camStop').classList.add('hidden'); }
$('camStart').onclick = startCamera; $('camStop').onclick = stopCamera;
$('sidGo').onclick = () => lookup($('sid').value, false); $('sid').addEventListener('keydown', (e) => { if (e.key === 'Enter') lookup($('sid').value, false); });

// scan = look the student up AND record "ตรวจแล้ว" for the chosen check in one step (readOnly: only look, used when the check is switched)
async function lookup(value, fromCamera, quiet, readOnly) {
  const id = String(value || '').trim(); if (!id) return toast('กรอกรหัสนักศึกษาหรือสแกน QR ก่อน', true);
  if (!checkId) return toast('เลือกรายการตรวจก่อน', true);
  cameraMode = !!fromCamera; $('sid').value = id;
  try { const d = await send('POST', readOnly ? '/camps/qrcheck/lookup' : '/camps/qrcheck/scan', { studentId: id, checkId }); cur = d; renderResult(d, quiet); }
  catch (e) { cur = null; renderProblem(e, id); }
}
function renderProblem(e, id) {
  const nf = e.data && e.data.code === 'NOT_FOUND';
  $('result').innerHTML = '<div class="banner bad big"><b>' + (nf ? 'ไม่พบในฐานข้อมูลลงทะเบียน' : 'ตรวจสอบไม่ได้') + '</b><span>' + esc(e.message) + '</span></div>' + (nf ? '<p class="hint">รหัสที่สแกน: <b>' + esc(e.data.studentId || id) + '</b> ไม่อยู่ในรายชื่อนักศึกษาของระบบลงทะเบียน ไม่ได้บันทึกการตรวจ กรุณาตรวจสอบกับผู้ดูแล</p>' : '') + nextButton();
  bindNext();
}
const nextButton = () => '<div class="row end"><button id="nextBtn" class="btn primary" type="button">ตรวจคนต่อไป</button></div>';
function bindNext() { const b = $('nextBtn'); if (b) b.onclick = () => { cur = null; $('result').innerHTML = PLACEHOLDER; $('sid').value = ''; if (cameraMode) { cameraMode = false; startCamera(); } else $('sid').focus(); }; }

function renderResult(d, quiet) {
  const s = d.student, c = d.check, r = d.result;
  const mine = r && myEmail && String(r.checked_by).toLowerCase() === myEmail.toLowerCase();
  const canRefine = !d.blocked && r && (isAdmin || mine);
  const initial = [...String(s.name).replace(/^(นางสาว|นาย|นาง|เด็กชาย|เด็กหญิง)\s*/, '')][0] || '?';
  const photo = d.picture ? '<img class="avatar" alt="" referrerpolicy="no-referrer" src="' + esc(d.picture) + '">' : '<span class="avatar ph">' + esc(initial) + '</span>';
  // 1. the outcome, first and large
  let h;
  if (d.blocked) h = '<div class="banner bad big"><b>บันทึกไม่ได้</b><span>' + esc(d.blocked) + ' (รายการตรวจ “' + esc(c.name) + '” ต้องลงทะเบียนเลือกฝ่ายก่อน)</span></div>';
  else if (!r) h = '<div class="banner big"><b>ยังไม่ได้ตรวจ</b><span>รายการตรวจ “' + esc(c.name) + '” ยังไม่มีการบันทึกของนักศึกษาคนนี้</span></div>';
  else if (r.result === 'fail') h = '<div class="banner bad big"><b>ตรวจแล้ว · ไม่ผ่าน</b><span>' + esc(c.name) + ' · ' + esc(fmt(r.checked_at)) + ' · ' + esc(r.checked_by) + '</span></div>';
  else if (d.justRecorded) h = '<div class="banner ok big"><b>ตรวจแล้ว</b><span>บันทึกผลการตรวจ “' + esc(c.name) + '” เรียบร้อย · ' + esc(fmt(r.checked_at)) + ' · ' + esc(r.checked_by) + '</span></div>';
  else h = '<div class="banner warn big"><b>ตรวจแล้ว (บันทึกไว้ก่อนหน้านี้)</b><span>' + esc(c.name) + ' · เมื่อ ' + esc(fmt(r.checked_at)) + ' โดย ' + esc(r.checked_by) + ' · ไม่ได้บันทึกซ้ำ</span></div>';
  // 2. who it is (from the registration database)
  h += '<div class="person">' + photo + '<div><div class="pname">' + esc(s.name) + '</div><div class="pid">รหัสนักศึกษา ' + esc(s.studentId) + ' · พบในฐานข้อมูลลงทะเบียน</div></div></div>'
    + '<dl class="kv"><dt>ชั้นปี</dt><dd>ปี ' + esc(s.year) + '</dd><dt>เพศ</dt><dd>' + esc(GENDER[s.gender] || '—') + '</dd><dt>ฝ่าย</dt><dd>' + (s.departmentName ? esc(s.departmentName) : '<span class="muted-t">ยังไม่ได้ลงทะเบียนเลือกฝ่าย</span>') + '</dd>'
    + (r ? '<dt>ผลการตรวจ</dt><dd>' + badge(r.result) + (r.reference ? ' · รหัสป้าย AKA <b>' + esc(r.reference) + '</b>' : '') + (r.note ? '<div class="small">หมายเหตุ: ' + esc(r.note) + '</div>' : '') + (r.updated_at ? '<div class="small">แก้ไขล่าสุด ' + esc(fmt(r.updated_at)) + ' โดย ' + esc(r.updated_by || '—') + '</div>' : '') + '</dd>' : '') + '</dl>';
  // 3. actions
  if (!r && !d.blocked) h += '<div class="row end"><button id="recNow" class="btn ok" type="button">บันทึกว่าตรวจแล้ว</button></div>';
  if (canRefine) h += refineForm(c, r, !mine && isAdmin);
  else if (r && !isAdmin) h += '<p class="hint">แก้ไขผลได้เฉพาะผู้ที่บันทึก หรือผู้ดูแล</p>';
  if (d.history && d.history.length) h += '<h3 class="mt">ประวัติการตรวจของนักศึกษา</h3><ul class="hist">' + d.history.map((x) => '<li><span>' + esc(x.name) + '</span>' + badge(x.result) + '<small>' + esc(fmtShort(x.checked_at)) + '</small></li>').join('') + '</ul>';
  h += nextButton();
  $('result').innerHTML = h; bindNext(); bindActions();
  const im = document.querySelector('#result img.avatar'); if (im) im.onerror = () => { const sp = document.createElement('span'); sp.className = 'avatar ph'; sp.textContent = initial; im.replaceWith(sp); };
  if (!quiet) $('resultCard').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}
// optional follow-up on a recorded check: badge code (AKA), note, or change the result
function refineForm(c, r, byAdmin) {
  const open = c.kind === 'aka' && !r.reference ? ' open' : '';
  return '<details class="refine"' + open + '><summary>' + (c.kind === 'aka' ? 'บันทึกรหัสป้าย AKA / หมายเหตุ / เปลี่ยนผล' : 'หมายเหตุ / เปลี่ยนผลการตรวจ') + (byAdmin ? ' (ผู้ดูแล)' : '') + '</summary><form id="recForm" novalidate>'
    + (c.kind === 'aka' ? '<label>รหัสป้าย AKA<input id="recRef" maxlength="60" autocomplete="off" placeholder="เลข/รหัสบนป้าย" value="' + esc(r.reference) + '"></label>' : '')
    + '<label>หมายเหตุ <small>(จำเป็นเมื่อเปลี่ยนเป็นไม่ผ่าน)</small><input id="recNote" maxlength="300" autocomplete="off" placeholder="เช่น ชื่อบนป้ายไม่ตรง" value="' + esc(r.note) + '"></label>'
    + '<div class="row"><button type="button" id="recSave" class="btn primary">บันทึกข้อมูล</button>' + (r.result === 'pass' ? '<button type="button" id="recFail" class="btn danger">เปลี่ยนเป็นไม่ผ่าน</button>' : '<button type="button" id="recPass" class="btn ok">เปลี่ยนเป็นผ่าน</button>') + '</div></form></details>';
}
function bindActions() {
  const now = $('recNow'); if (now) now.onclick = async () => { now.disabled = true; await lookup(cur.student.studentId, cameraMode, true); };
  if (!$('recForm')) return;
  const go = async (result) => {
    const note = $('recNote').value.trim(), reference = $('recRef') ? $('recRef').value.trim() : '';
    if (result === 'fail' && !note) { $('recNote').focus(); return toast('ระบุเหตุผลในช่องหมายเหตุเมื่อไม่ผ่าน', true); }
    ['recSave', 'recFail', 'recPass'].forEach((id) => { if ($(id)) $(id).disabled = true; });
    try {
      await send('POST', '/camps/qrcheck/record', { studentId: cur.student.studentId, checkId, result, note, reference, overwrite: true });
      toast('บันทึกแล้ว'); await lookup(cur.student.studentId, cameraMode, true, true);
    } catch (e) { toast(e.message, true); ['recSave', 'recFail', 'recPass'].forEach((id) => { if ($(id)) $(id).disabled = false; }); }
  };
  $('recSave').onclick = () => go(cur.result.result);
  if ($('recFail')) $('recFail').onclick = () => go('fail'); if ($('recPass')) $('recPass').onclick = () => go('pass');
}

// ---------- 2. results (admin) ----------
let resultRows = [];
async function loadResults() {
  try {
    const d = await data('/camps/qrcheck/admin/checks');
    $('sumTable').innerHTML = '<thead><tr><th>รายการตรวจ</th><th>ประเภท</th><th class="num">ตรวจแล้ว</th><th class="num">ผ่าน</th><th class="num">ไม่ผ่าน</th><th class="num">ยังไม่ตรวจ*</th></tr></thead><tbody>'
      + d.checks.map((c) => '<tr><td data-l="รายการตรวจ"><b>' + esc(c.name) + '</b>' + (c.active ? '' : ' <span class="badge muted">ปิดใช้งาน</span>') + '</td><td data-l="ประเภท">' + KIND[c.kind] + '</td><td class="num" data-l="ตรวจแล้ว">' + c.results + '</td><td class="num" data-l="ผ่าน">' + c.passed + '</td><td class="num" data-l="ไม่ผ่าน">' + c.failed + '</td><td class="num" data-l="ยังไม่ตรวจ">' + Math.max(0, d.registered - c.results) + '</td></tr>').join('') + '</tbody>'
      + '<tfoot><tr><td colspan="6" class="small">ฐานข้อมูลลงทะเบียน: นักศึกษาในรายชื่อ ' + d.roster + ' คน · เลือกฝ่ายแล้ว ' + d.registered + ' คน · *ยังไม่ตรวจ นับจากผู้ที่เลือกฝ่ายแล้ว</td></tr></tfoot>';
    const sel = $('fCheck'), keep = sel.value;
    sel.innerHTML = '<option value="">ทุกรายการ</option>' + d.checks.map((c) => '<option value="' + c.id + '">' + esc(c.name) + '</option>').join(''); sel.value = keep;
    await loadResultRows();
  } catch (e) { toast(e.message, true); }
}
async function loadResultRows() {
  const q = new URLSearchParams(); if ($('fCheck').value) q.set('checkId', $('fCheck').value); if ($('fResult').value) q.set('result', $('fResult').value); if ($('fQ').value.trim()) q.set('q', $('fQ').value.trim());
  try {
    resultRows = (await data('/camps/qrcheck/admin/results?' + q)).results || [];
    $('resTable').innerHTML = resultRows.length ? '<thead><tr><th>รายการตรวจ</th><th>รหัสนักศึกษา</th><th>ชื่อ-นามสกุล</th><th>ชั้นปี</th><th>ฝ่าย</th><th>ผล</th><th>รหัสป้าย</th><th>หมายเหตุ</th><th>เวลา</th><th>ผู้ตรวจ</th></tr></thead><tbody>'
      + resultRows.map((x) => '<tr><td data-l="รายการตรวจ">' + esc(x.check_name) + '</td><td data-l="รหัส">' + esc(x.student_id) + '</td><td data-l="ชื่อ">' + esc(x.name || '—') + '</td><td data-l="ชั้นปี">' + esc(x.year || '—') + '</td><td data-l="ฝ่าย">' + esc(x.department_name || '—') + '</td><td data-l="ผล">' + badge(x.result) + '</td><td data-l="รหัสป้าย">' + esc(x.reference || '—') + '</td><td data-l="หมายเหตุ">' + esc(x.note || '—') + '</td><td data-l="เวลา">' + esc(fmtShort(x.updated_at || x.checked_at)) + '</td><td data-l="ผู้ตรวจ">' + esc(x.updated_by || x.checked_by) + '</td></tr>').join('') + '</tbody>'
      : '<tbody><tr><td class="empty">ไม่พบผลการตรวจ</td></tr></tbody>';
  } catch (e) { toast(e.message, true); }
}
['fCheck', 'fResult'].forEach((id) => $(id).onchange = loadResultRows);
$('fQ').oninput = () => { clearTimeout(window.__qt); window.__qt = setTimeout(loadResultRows, 300); };
let xlsxP = null;
const loadXlsx = () => window.XLSX ? Promise.resolve(window.XLSX) : (xlsxP || (xlsxP = new Promise((res, rej) => { const el = document.createElement('script'); el.src = '/qrcheck/vendor/xlsx.mini.min.js'; el.onload = () => res(window.XLSX); el.onerror = () => { xlsxP = null; rej(new Error('load')); }; document.head.appendChild(el); })));
$('exportBtn').onclick = async () => {
  if (!resultRows.length) return toast('ไม่มีข้อมูลให้ดาวน์โหลด', true);
  try {
    const X = await loadXlsx(), rows = [['รายการตรวจ', 'รหัสนักศึกษา', 'ชื่อ-นามสกุล', 'ชั้นปี', 'เพศ', 'ฝ่าย', 'ผล', 'รหัสป้าย AKA', 'หมายเหตุ', 'ตรวจเมื่อ', 'ผู้ตรวจ', 'แก้ไขเมื่อ', 'ผู้แก้ไข']]
      .concat(resultRows.map((x) => [x.check_name, String(x.student_id), x.name || '', x.year || '', GENDER[x.gender] || '', x.department_name || '', x.result === 'pass' ? 'ผ่าน' : 'ไม่ผ่าน', x.reference || '', x.note || '', fmt(x.checked_at), x.checked_by, x.updated_at ? fmt(x.updated_at) : '', x.updated_by || '']));
    const ws = X.utils.aoa_to_sheet(rows); ws['!cols'] = [22, 15, 26, 8, 8, 18, 9, 16, 28, 18, 28, 18, 28].map((w) => ({ wch: w }));
    const wb = X.utils.book_new(); X.utils.book_append_sheet(wb, ws, 'ผลการตรวจ'); X.writeFile(wb, 'qr-check-results-' + new Date().toISOString().slice(0, 10) + '.xlsx');
  } catch (e) { toast('สร้างไฟล์ Excel ไม่ได้', true); }
};

// ---------- 3. settings (admin) ----------
async function loadSettings() {
  try {
    const d = await data('/camps/qrcheck/admin/checks');
    $('checksTable').innerHTML = '<thead><tr><th>ลำดับ</th><th>ชื่อรายการ</th><th>ประเภท</th><th>ต้องเลือกฝ่ายแล้ว</th><th>สถานะ</th><th class="num">ผลที่บันทึก</th><th>จัดการ</th></tr></thead><tbody>'
      + d.checks.map((c) => '<tr><td data-l="ลำดับ">' + c.sortOrder + '</td><td data-l="ชื่อ"><b>' + esc(c.name) + '</b><div class="small">' + esc(c.description) + '</div></td><td data-l="ประเภท">' + KIND[c.kind] + '</td><td data-l="ต้องเลือกฝ่ายแล้ว">' + (c.requireRegistered ? 'ใช่' : 'ไม่') + '</td><td data-l="สถานะ">' + (c.active ? '<span class="badge ok">เปิดใช้งาน</span>' : '<span class="badge muted">ปิดใช้งาน</span>') + '</td><td class="num" data-l="ผลที่บันทึก">' + c.results + '</td><td class="act" data-l="จัดการ"><button class="btn sm" data-edit="' + c.id + '">แก้ไข</button><button class="btn sm" data-toggle="' + c.id + '">' + (c.active ? 'ปิดใช้งาน' : 'เปิดใช้งาน') + '</button>' + (c.results ? '' : '<button class="btn sm danger" data-del="' + c.id + '">ลบ</button>') + '</td></tr>').join('') + '</tbody>';
    const byId = Object.fromEntries(d.checks.map((c) => [c.id, c]));
    $('checksTable').querySelectorAll('[data-toggle]').forEach((b) => b.onclick = async () => { try { await send('PATCH', '/camps/qrcheck/admin/checks/' + b.dataset.toggle, { active: !byId[b.dataset.toggle].active }); toast('อัปเดตแล้ว'); loadSettings(); loadChecks(); } catch (e) { toast(e.message, true); } });
    $('checksTable').querySelectorAll('[data-del]').forEach((b) => b.onclick = async () => { if (!confirm('ลบรายการตรวจ “' + byId[b.dataset.del].name + '” ?')) return; try { await send('DELETE', '/camps/qrcheck/admin/checks/' + b.dataset.del); toast('ลบแล้ว'); loadSettings(); loadChecks(); } catch (e) { toast(e.message, true); } });
    $('checksTable').querySelectorAll('[data-edit]').forEach((b) => b.onclick = async () => {
      const c = byId[b.dataset.edit], name = prompt('ชื่อรายการตรวจ', c.name); if (name === null) return;
      const description = prompt('คำอธิบาย', c.description); if (description === null) return;
      const order = prompt('ลำดับที่แสดง (ตัวเลข)', String(c.sortOrder)); if (order === null) return;
      try { await send('PATCH', '/camps/qrcheck/admin/checks/' + c.id, { name, description, sortOrder: Number(order) }); toast('บันทึกแล้ว'); loadSettings(); loadChecks(); } catch (e) { toast(e.message, true); }
    });
    const o = await data('/camps/qrcheck/admin/officers');
    $('officersTable').innerHTML = o.officers.length ? '<thead><tr><th>อีเมล</th><th>เพิ่มโดย</th><th>เมื่อ</th><th></th></tr></thead><tbody>' + o.officers.map((x) => '<tr><td data-l="อีเมล">' + esc(x.email) + '</td><td data-l="เพิ่มโดย">' + esc(x.added_by) + '</td><td data-l="เมื่อ">' + esc(fmtShort(x.created_at)) + '</td><td class="act"><button class="btn sm danger" data-rm="' + esc(x.email) + '">ถอนสิทธิ์</button></td></tr>').join('') + '</tbody>' : '<tbody><tr><td class="empty" data-l="">ยังไม่มีเจ้าหน้าที่ที่ได้รับมอบหมาย (ผู้ดูแลใช้ได้เสมอ)</td></tr></tbody>';
    $('officersTable').querySelectorAll('[data-rm]').forEach((b) => b.onclick = async () => { if (!confirm('ถอนสิทธิ์ ' + b.dataset.rm + ' ?')) return; try { await send('DELETE', '/camps/qrcheck/admin/officers/' + encodeURIComponent(b.dataset.rm)); toast('ถอนสิทธิ์แล้ว'); loadSettings(); } catch (e) { toast(e.message, true); } });
  } catch (e) { toast(e.message, true); }
}
$('checkForm').onsubmit = async (e) => {
  e.preventDefault();
  try { await send('POST', '/camps/qrcheck/admin/checks', { name: $('cName').value, description: $('cDesc').value, kind: $('cKind').value, requireRegistered: $('cReq').checked }); $('checkForm').reset(); $('cReq').checked = true; toast('เพิ่มรายการตรวจแล้ว'); loadSettings(); loadChecks(); }
  catch (er) { toast(er.message, true); }
};
$('officerForm').onsubmit = async (e) => {
  e.preventDefault();
  try { await send('POST', '/camps/qrcheck/admin/officers', { email: $('oEmail').value }); $('officerForm').reset(); toast('เพิ่มเจ้าหน้าที่แล้ว'); loadSettings(); }
  catch (er) { toast(er.message, true); }
};

init();
})();
