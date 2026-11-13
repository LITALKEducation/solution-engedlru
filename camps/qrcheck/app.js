(() => {
'use strict';
// This system has its OWN Auth0 application (SPA) and callback /qrcheck/. Paste its Client ID below (see camps/README.md → "One Auth0 application per system").
const API = 'https://engedlru-api.stnetworld.workers.dev', DOMAIN = window.QRCHECK_AUTH0_DOMAIN || 'auth.litalkeducation.com', CLIENT = window.QRCHECK_AUTH0_CLIENT_ID || 'PGqozL94LzOwstm4pD39W5kvalYRiK7w', REDIRECT = location.origin + '/qrcheck/';   // Allowed Callback + Logout URLs must list it
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const GENDER = { M: 'ชาย', F: 'หญิง' };
const AUTH_GONE = ['login_required', 'missing_refresh_token', 'invalid_grant', 'consent_required', 'interaction_required'];
let auth = null, isAdmin = false, checks = [], checkId = null, cur = null, camera = null, cameraMode = false;

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
    const me = await data('/camps/qrcheck/me'); isAdmin = !!me.isAdmin;
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
$('checkSel').onchange = () => { checkId = Number($('checkSel').value) || null; try { localStorage.setItem('qrcheck.check', String(checkId)); } catch (e) { /* ignore */ } showCheckInfo(); if (cur) lookup(cur.student.studentId, false, true); };

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

async function lookup(value, fromCamera, quiet) {
  const id = String(value || '').trim(); if (!id) return toast('กรอกรหัสนักศึกษาหรือสแกน QR ก่อน', true);
  if (!checkId) return toast('เลือกรายการตรวจก่อน', true);
  cameraMode = !!fromCamera; $('sid').value = id;
  try { const d = await send('POST', '/camps/qrcheck/lookup', { studentId: id, checkId }); cur = d; renderResult(d, quiet); }
  catch (e) { cur = null; renderProblem(e, id); }
}
function renderProblem(e, id) {
  const nf = e.data && e.data.code === 'NOT_FOUND';
  $('result').innerHTML = '<div class="banner bad"><b>' + (nf ? 'ไม่พบในฐานข้อมูลลงทะเบียน' : 'ตรวจสอบไม่ได้') + '</b><span>' + esc(e.message) + '</span></div>' + (nf ? '<p class="hint">รหัสที่สแกน: <b>' + esc(e.data.studentId || id) + '</b> ไม่อยู่ในรายชื่อนักศึกษาของระบบลงทะเบียน กรุณาตรวจสอบกับผู้ดูแล</p>' : '') + nextButton();
  bindNext();
}
const nextButton = () => '<div class="row end"><button id="nextBtn" class="btn primary" type="button">ตรวจคนต่อไป</button></div>';
function bindNext() { const b = $('nextBtn'); if (b) b.onclick = () => { cur = null; $('result').innerHTML = '<p class="empty">ยังไม่มีข้อมูล สแกน QR หรือกรอกรหัสนักศึกษาเพื่อเริ่มตรวจ</p>'; $('sid').value = ''; if (cameraMode) { cameraMode = false; startCamera(); } else $('sid').focus(); }; }

function renderResult(d, quiet) {
  const s = d.student, c = d.check, r = d.result, canRecord = !d.blocked && !r, canEdit = !d.blocked && r && isAdmin;
  const dept = s.departmentName ? esc(s.departmentName) : '<span class="muted-t">ยังไม่ได้ลงทะเบียนเลือกฝ่าย</span>';
  const initial = [...String(s.name).replace(/^(นางสาว|นาย|นาง|เด็กชาย|เด็กหญิง)\s*/, '')][0] || '?';
  const photo = d.picture ? '<img class="avatar" alt="" referrerpolicy="no-referrer" src="' + esc(d.picture) + '">' : '<span class="avatar ph">' + esc(initial) + '</span>';
  let h = '<div class="banner ok"><b>พบในฐานข้อมูลลงทะเบียน</b><span>ข้อมูลจากระบบลงทะเบียนและเลือกฝ่ายของฝ่ายบุคคล</span></div>'
    + '<div class="person">' + photo + '<div><div class="pname">' + esc(s.name) + '</div><div class="pid">รหัสนักศึกษา ' + esc(s.studentId) + '</div></div></div>'
    + '<dl class="kv"><dt>ชั้นปี</dt><dd>ปี ' + esc(s.year) + '</dd><dt>เพศ</dt><dd>' + esc(GENDER[s.gender] || '—') + '</dd><dt>ฝ่าย</dt><dd>' + dept + '</dd></dl>'
    + '<h3>' + esc(c.name) + '</h3>';
  if (r) {
    h += '<div class="statusbox ' + (r.result === 'pass' ? 'ok' : 'bad') + '"><div>' + badge(r.result) + ' <b>ตรวจแล้ว</b></div><div class="small">เมื่อ ' + esc(fmt(r.checked_at)) + ' โดย ' + esc(r.checked_by) + (r.updated_at ? '<br>แก้ไขล่าสุด ' + esc(fmt(r.updated_at)) + ' โดย ' + esc(r.updated_by || '—') : '') + '</div>'
      + (r.reference ? '<div class="small">รหัสป้าย AKA: <b>' + esc(r.reference) + '</b></div>' : '') + (r.note ? '<div class="small">หมายเหตุ: ' + esc(r.note) + '</div>' : '') + '</div>'
      + (isAdmin ? '' : '<p class="hint">รายการนี้ตรวจไปแล้ว บันทึกซ้ำไม่ได้ (เฉพาะผู้ดูแลที่แก้ไขผลได้)</p>');
  } else if (d.blocked) {
    h += '<div class="statusbox bad"><b>บันทึกผลไม่ได้</b><div class="small">' + esc(d.blocked) + ' (รายการตรวจนี้ต้องลงทะเบียนเลือกฝ่ายก่อน)</div></div>';
  } else h += '<div class="statusbox"><b>ยังไม่ได้ตรวจรายการนี้</b></div>';
  if (canRecord || canEdit) h += recordForm(c, r, canEdit);
  if (d.history && d.history.length) h += '<h3 class="mt">ประวัติการตรวจของนักศึกษา</h3><ul class="hist">' + d.history.map((x) => '<li><span>' + esc(x.name) + '</span>' + badge(x.result) + '<small>' + esc(fmt(x.checked_at)) + '</small></li>').join('') + '</ul>';
  h += nextButton();
  $('result').innerHTML = h; bindNext(); bindRecord(canEdit);
  const im = document.querySelector('#result img.avatar'); if (im) im.onerror = () => { const sp = document.createElement('span'); sp.className = 'avatar ph'; sp.textContent = initial; im.replaceWith(sp); };
  if (!quiet) $('resultCard').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}
function recordForm(c, r, edit) {
  return '<form id="recForm" class="rec" novalidate><h3 class="mt">' + (edit ? 'แก้ไขผลการตรวจ (ผู้ดูแล)' : 'บันทึกผลการตรวจ') + '</h3>'
    + (c.kind === 'aka' ? '<label>รหัสป้าย AKA<input id="recRef" maxlength="60" autocomplete="off" placeholder="เลข/รหัสบนป้าย" value="' + esc(r ? r.reference : '') + '"></label>' : '')
    + '<label>หมายเหตุ <small>(จำเป็นเมื่อไม่ผ่าน)</small><input id="recNote" maxlength="300" autocomplete="off" placeholder="เช่น ชื่อบนป้ายไม่ตรง" value="' + esc(r ? r.note : '') + '"></label>'
    + '<div class="row"><button type="button" id="recPass" class="btn ok">ผ่าน</button><button type="button" id="recFail" class="btn danger">ไม่ผ่าน</button></div></form>';
}
function bindRecord(edit) {
  const f = $('recForm'); if (!f) return;
  const go = async (result) => {
    const note = $('recNote').value.trim(), reference = $('recRef') ? $('recRef').value.trim() : '';
    if (result === 'fail' && !note) { $('recNote').focus(); return toast('ระบุเหตุผลในช่องหมายเหตุเมื่อไม่ผ่าน', true); }
    if (edit && !confirm('ยืนยันแก้ไขผลการตรวจที่บันทึกไว้แล้ว?')) return;
    $('recPass').disabled = $('recFail').disabled = true;
    try {
      await send('POST', '/camps/qrcheck/record', { studentId: cur.student.studentId, checkId, result, note, reference, overwrite: !!edit });
      toast(result === 'pass' ? 'บันทึกผล “ผ่าน” แล้ว' : 'บันทึกผล “ไม่ผ่าน” แล้ว');
      await lookup(cur.student.studentId, cameraMode, true);
    } catch (e) {
      toast(e.message, true);
      if (e.data && (e.data.code === 'ALREADY_CHECKED' || e.data.code === 'NOT_REGISTERED')) await lookup(cur.student.studentId, cameraMode, true);
      else { $('recPass').disabled = $('recFail').disabled = false; }
    }
  };
  $('recPass').onclick = () => go('pass'); $('recFail').onclick = () => go('fail');
}

// ---------- 2. results (admin) ----------
let resultRows = [];
async function loadResults() {
  try {
    const d = await data('/camps/qrcheck/admin/checks');
    $('sumTable').innerHTML = '<thead><tr><th>รายการตรวจ</th><th>ประเภท</th><th class="num">ตรวจแล้ว</th><th class="num">ผ่าน</th><th class="num">ไม่ผ่าน</th><th class="num">ยังไม่ตรวจ (จากผู้ลงทะเบียนฝ่าย)</th></tr></thead><tbody>'
      + d.checks.map((c) => '<tr><td data-l="รายการตรวจ"><b>' + esc(c.name) + '</b>' + (c.active ? '' : ' <span class="badge muted">ปิดใช้งาน</span>') + '</td><td data-l="ประเภท">' + KIND[c.kind] + '</td><td class="num" data-l="ตรวจแล้ว">' + c.results + '</td><td class="num" data-l="ผ่าน">' + c.passed + '</td><td class="num" data-l="ไม่ผ่าน">' + c.failed + '</td><td class="num" data-l="ยังไม่ตรวจ">' + Math.max(0, d.registered - c.results) + '</td></tr>').join('') + '</tbody>'
      + '<tfoot><tr><td colspan="6" class="small">ฐานข้อมูลลงทะเบียน: นักศึกษาในรายชื่อ ' + d.roster + ' คน · เลือกฝ่ายแล้ว ' + d.registered + ' คน</td></tr></tfoot>';
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
      + resultRows.map((x) => '<tr><td data-l="รายการตรวจ">' + esc(x.check_name) + '</td><td data-l="รหัส">' + esc(x.student_id) + '</td><td data-l="ชื่อ">' + esc(x.name || '—') + '</td><td data-l="ชั้นปี">' + esc(x.year || '—') + '</td><td data-l="ฝ่าย">' + esc(x.department_name || '—') + '</td><td data-l="ผล">' + badge(x.result) + '</td><td data-l="รหัสป้าย">' + esc(x.reference || '—') + '</td><td data-l="หมายเหตุ">' + esc(x.note || '—') + '</td><td data-l="เวลา">' + esc(fmt(x.updated_at || x.checked_at)) + '</td><td data-l="ผู้ตรวจ">' + esc(x.updated_by || x.checked_by) + '</td></tr>').join('') + '</tbody>'
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
    $('officersTable').innerHTML = o.officers.length ? '<thead><tr><th>อีเมล</th><th>เพิ่มโดย</th><th>เมื่อ</th><th></th></tr></thead><tbody>' + o.officers.map((x) => '<tr><td data-l="อีเมล">' + esc(x.email) + '</td><td data-l="เพิ่มโดย">' + esc(x.added_by) + '</td><td data-l="เมื่อ">' + esc(fmt(x.created_at)) + '</td><td class="act"><button class="btn sm danger" data-rm="' + esc(x.email) + '">ถอนสิทธิ์</button></td></tr>').join('') + '</tbody>' : '<tbody><tr><td class="empty">ยังไม่มีเจ้าหน้าที่ที่ได้รับมอบหมาย (ผู้ดูแลใช้ได้เสมอ)</td></tr></tbody>';
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
