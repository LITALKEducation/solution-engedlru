(() => {
'use strict';
// This system has its OWN Auth0 application (SPA) and callback /aka/. Paste its Client ID below (see camps/README.md → "One Auth0 application per system").
const API = 'https://engedlru-api.stnetworld.workers.dev', DOMAIN = window.AKA_AUTH0_DOMAIN || 'auth.litalkeducation.com', CLIENT = window.AKA_AUTH0_CLIENT_ID || 'PGqozL94LzOwstm4pD39W5kvalYRiK7w', REDIRECT = location.origin + '/aka/';   // Allowed Callback + Logout URLs must list it
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const GENDER = { M: 'ชาย', F: 'หญิง' };
const AUTH_GONE = ['login_required', 'missing_refresh_token', 'invalid_grant', 'consent_required', 'interaction_required'];
const REASONS = {
  not_university_email: 'ต้องใช้อีเมลมหาวิทยาลัย (@lru.ac.th) ลองออกจากระบบแล้วเข้าใหม่ด้วยอีเมลนั้น',
  email_not_verified: 'อีเมลนี้ยังไม่ได้ยืนยันกับ Google',
  not_in_roster: 'ไม่พบรหัสของคุณในรายชื่อ ลองแจ้งแอดมิน'
};
let auth = null, me = null, isAdmin = false, schedule = null, srvOff = 0;

// ---------- helpers ----------
let toastT;
function toast(msg, bad) { const t = $('toast'); t.textContent = msg; t.className = (bad ? 'bad ' : '') + 'show'; clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 3200); }
async function api(path, opt = {}) {
  const go = async (fresh) => { const t = await auth.getTokenSilently(fresh ? { cacheMode: 'off' } : undefined); return fetch(API + path, { ...opt, headers: { ...(opt.headers || {}), Authorization: 'Bearer ' + t } }); };
  let r = await go(false); if (r.status === 401) r = await go(true); return r;
}
async function data(method, path, body) {
  const r = await api(path, { method, headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  const d = await r.json().catch(() => ({ error: 'เกิดข้อผิดพลาด กรุณาลองใหม่' }));
  if (!r.ok) throw Object.assign(new Error(d.error || 'เกิดข้อผิดพลาด'), { status: r.status, data: d });
  return d;
}
const fmt = (s) => (s ? new Date(String(s).replace(' ', 'T') + 'Z').toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' }) : '—');

// ---------- sign-in ----------
async function init() {
  try {
    auth = await auth0.createAuth0Client({ domain: DOMAIN, clientId: CLIENT, cacheLocation: 'localstorage', useRefreshTokens: true, authorizationParams: { redirect_uri: REDIRECT } });
    if (location.search.includes('code=') || location.search.includes('error=')) { try { await auth.handleRedirectCallback(); } finally { history.replaceState({}, document.title, REDIRECT); } }
    if (!(await auth.isAuthenticated())) { $('login').classList.remove('hidden'); $('account').textContent = 'ยังไม่ได้เข้าสู่ระบบ'; return; }
    await loadMe();
    $('account').innerHTML = '<span class="em">' + esc(me.email) + '</span>' + (isAdmin ? '<span class="badge">แอดมิน</span>' : '') + '<button id="logoutBtn" class="link" type="button">ออก</button>';
    $('logoutBtn').onclick = signOut;
    document.querySelectorAll('.adm').forEach((b) => b.classList.toggle('hidden', !isAdmin));
    $('login').classList.add('hidden'); $('app').classList.remove('hidden');
    renderMe();
  } catch (e) {
    $('login').classList.remove('hidden');
    if (AUTH_GONE.includes(e.error)) { $('account').textContent = 'เข้าสู่ระบบหมดอายุ ลองเข้าใหม่'; return; }
    $('login').querySelector('p').textContent = e.message || 'เชื่อมต่อไม่ได้ ลองใหม่อีกครั้ง'; $('account').textContent = 'เกิดข้อผิดพลาด';
  }
}
async function loadMe() { me = await data('GET', '/camps/aka/me'); isAdmin = !!me.isAdmin; applyInfo(me); }
function signOut() { try { sessionStorage.setItem('chooseGoogle', '1'); } catch (e) { /* ignore */ } auth.logout({ logoutParams: { returnTo: REDIRECT } }); }
$('loginBtn').onclick = () => { const ap = { connection: 'google-oauth2' }; try { if (sessionStorage.getItem('chooseGoogle')) { ap.prompt = 'select_account'; sessionStorage.removeItem('chooseGoogle'); } } catch (e) { /* ignore */ } auth.loginWithRedirect({ authorizationParams: ap }); };

document.querySelectorAll('#tabs button').forEach((b) => b.onclick = () => {
  document.querySelectorAll('#tabs button').forEach((x) => x.classList.toggle('on', x === b));
  document.querySelectorAll('.view').forEach((v) => v.classList.add('hidden'));
  $('view-' + b.dataset.tab).classList.remove('hidden');
  if (b.dataset.tab === 'me') renderMe(); else if (b.dataset.tab === 'list') loadList(); else if (b.dataset.tab === 'settings') loadSettings();
});

// ---------- countdown in the page header ----------
function applyInfo(d) { if (d.schedule) schedule = d.schedule; if (typeof d.now === 'number') srvOff = d.now - Date.now(); renderCountdown(); }
const pad2 = (n) => String(n).padStart(2, '0');
let cdFired = 0;
function renderCountdown() {
  const host = document.querySelector('.hero-body'); if (!host) return;
  let box = $('cdBox'); if (!box) { box = document.createElement('div'); box.id = 'cdBox'; box.className = 'cdbox hidden'; box.setAttribute('role', 'timer'); host.appendChild(box); }
  const now = Date.now() + srvOff, s = schedule; let target = null, label = '';
  if (s && s.enabled) {
    if (s.openAt != null && now < s.openAt) { target = s.openAt; label = 'เปิดรับการตั้งชื่อในอีก'; }
    else if (s.closeAt != null && now < s.closeAt) { target = s.closeAt; label = 'ปิดรับการตั้งชื่อในอีก'; }
  }
  if (target == null) { box.classList.add('hidden'); return; }
  const left = Math.max(0, Math.ceil((target - now) / 1000)), d = Math.floor(left / 86400), h = Math.floor(left % 86400 / 3600), m = Math.floor(left % 3600 / 60), sec = left % 60;
  const cells = (d ? [[d, 'วัน']] : []).concat([[pad2(h), 'ชม.'], [pad2(m), 'นาที'], [pad2(sec), 'วินาที']]);
  box.classList.remove('hidden'); box.classList.toggle('closing', label.startsWith('ปิด'));
  const html = '<span class="cdl">' + label + '</span><span class="cdn">' + cells.map(([v, u]) => '<b>' + v + '<small>' + u + '</small></b>').join('') + '</span>';
  if (box.dataset.h !== html) { box.dataset.h = html; box.innerHTML = html; }
  if (left === 0 && cdFired !== target) { cdFired = target; setTimeout(refreshAfterCountdown, 700); }   // time is up: pick up the new state
}
async function refreshAfterCountdown() { try { await loadMe(); const tab = document.querySelector('#tabs button.on'); if (tab && tab.dataset.tab === 'settings') loadSettings(); else renderMe(); } catch (e) { /* the next tick tries again */ } }
setInterval(() => { if (schedule && schedule.enabled) renderCountdown(); }, 1000);

// ---------- my names ----------
const CHIP = { open: ['เปิดรับการตั้งชื่อ', 'open'], pending: ['ยังไม่เปิด', ''], closed: ['ปิดรับแล้ว', 'closed'] };
function setChip(state) { const c = $('heroChip'), v = CHIP[state] || CHIP.closed; c.textContent = v[0]; c.className = 'state-chip ' + v[1]; }
function renderMe() {
  const st = me.state, open = st === 'open'; setChip(st);
  $('stateBanner').innerHTML = open ? '<div class="banner ok"><b>ตั้งชื่อได้แล้ว</b><span>แก้ไขได้จนกว่าจะปิดรับ</span></div>'
    : st === 'pending' ? '<div class="banner warn"><b>ยังไม่เปิดรับ</b><span>รอถึงเวลา แล้วกลับมาตั้งชื่อได้เลย</span></div>'
    : '<div class="banner warn"><b>ปิดรับแล้ว</b><span>ถ้าอยากแก้ชื่อ ให้แจ้งแอดมิน</span></div>';
  if (me.reason) { $('meBody').classList.add('hidden'); $('meProblem').classList.remove('hidden'); $('meProblem').innerHTML = '<div class="banner bad"><b>ตั้งชื่อไม่ได้</b><span>' + esc(REASONS[me.reason] || 'ไม่พบข้อมูลนักศึกษา') + '</span></div>' + (me.reason !== 'not_in_roster' || !isAdmin ? '<div class="row"><button class="btn" id="switchBtn" type="button">ใช้บัญชี Google อื่น</button></div>' : ''); const sw = $('switchBtn'); if (sw) sw.onclick = signOut; return; }
  $('meProblem').classList.add('hidden'); $('meBody').classList.remove('hidden');
  const s = me.student;
  $('meInfo').innerHTML = '<dt>ชื่อ-สกุล</dt><dd>' + esc(s.name) + '</dd><dt>รหัสนักศึกษา</dt><dd>' + esc(s.studentId) + '</dd><dt>ชั้นปี</dt><dd>ปี ' + esc(s.year) + '</dd><dt>ฝ่าย</dt><dd>' + (s.departmentName ? esc(s.departmentName) : '<span class="muted-t">ยังไม่ได้เลือกฝ่าย</span>') + '</dd>';
  $('nick').value = s.nickname; $('akaName').value = s.aka;
  $('nick').disabled = $('akaName').disabled = $('saveBtn').disabled = !open;
  $('saveBtn').classList.toggle('hidden', !open);
  preview();
  $('savedAt').textContent = s.updatedAt ? 'บันทึกล่าสุด ' + fmt(s.updatedAt) : 'ยังไม่ได้ตั้งชื่อ';
}
function preview() { const a = $('akaName').value.trim(), n = $('nick').value.trim(); $('preview').innerHTML = '<div class="nt-aka' + (a ? '' : ' ph') + '">' + esc(a || 'AKA ของคุณ') + '</div><div class="nt-nick">' + (n ? 'ชื่อเล่น ' + esc(n) : 'ชื่อเล่น —') + '</div>'; }
$('nick').oninput = $('akaName').oninput = preview;
$('nameForm').onsubmit = async (e) => {
  e.preventDefault();
  const nickname = $('nick').value.trim(), aka = $('akaName').value.trim();
  if (!nickname) { $('nick').focus(); return toast('กรอกชื่อเล่น', true); }
  if (!aka) { $('akaName').focus(); return toast('กรอกชื่อ AKA', true); }
  $('saveBtn').disabled = true;
  try { const d = await data('POST', '/camps/aka/save', { nickname, aka }); me.student = d.student; renderMe(); toast('บันทึกชื่อแล้ว'); }
  catch (er) { toast(er.message, true); if (er.data && (er.data.code === 'CLOSED' || er.data.code === 'NOT_OPEN')) { await loadMe(); renderMe(); } else $('saveBtn').disabled = false; }
};

// ---------- list (admin) ----------
let overview = null, listRows = [];
async function loadOverview() { overview = await data('GET', '/camps/aka/admin/overview'); }
async function loadList() {
  try {
    if (!overview) await loadOverview();
    const sel = $('fDept'), keep = sel.value;
    sel.innerHTML = '<option value="">ทุกฝ่าย</option>' + overview.departments.map((d) => '<option value="' + esc(d.code) + '">' + esc(d.name) + '</option>').join('') + '<option value="none">ยังไม่เลือกฝ่าย</option>'; sel.value = keep;
    const q = new URLSearchParams(); if ($('fDept').value) q.set('department', $('fDept').value); if ($('fYear').value) q.set('year', $('fYear').value); if ($('fNamed').value) q.set('named', $('fNamed').value); if ($('fQ').value.trim()) q.set('q', $('fQ').value.trim());
    listRows = (await data('GET', '/camps/aka/admin/list?' + q)).students || [];
    $('listCount').textContent = listRows.length + ' คน';
    $('listTable').innerHTML = listRows.length ? '<thead><tr><th>รหัสนักศึกษา</th><th>ชื่อ-สกุล</th><th>ชั้นปี</th><th>ฝ่าย</th><th>ชื่อเล่น</th><th>AKA</th><th></th></tr></thead><tbody>'
      + listRows.map((x, i) => '<tr><td data-l="รหัส">' + esc(x.studentId) + '</td><td data-l="ชื่อ-สกุล">' + esc(x.name) + '</td><td data-l="ชั้นปี">' + esc(x.year) + '</td><td data-l="ฝ่าย">' + (x.departmentName ? esc(x.departmentName) : '<span class="muted-t">—</span>') + '</td><td data-l="ชื่อเล่น">' + (x.nickname ? esc(x.nickname) : '<span class="muted-t">—</span>') + '</td><td data-l="AKA">' + (x.aka ? '<b>' + esc(x.aka) + '</b>' : '<span class="badge muted">ยังไม่ตั้ง</span>') + '</td><td class="act"><button class="btn sm" data-edit="' + i + '">แก้ไข</button></td></tr>').join('') + '</tbody>'
      : '<tbody><tr><td class="empty" data-l="">ไม่พบรายชื่อ</td></tr></tbody>';
    $('listTable').querySelectorAll('[data-edit]').forEach((b) => b.onclick = () => openEdit(listRows[Number(b.dataset.edit)]));
  } catch (e) { toast(e.message, true); }
}
['fDept', 'fYear', 'fNamed'].forEach((id) => $(id).onchange = loadList);
$('fQ').oninput = () => { clearTimeout(window.__qt); window.__qt = setTimeout(loadList, 300); };
let editing = null;
function openEdit(x) {
  editing = x; $('editTitle').textContent = 'แก้ไขชื่อ — ' + x.name; $('editSub').textContent = 'รหัส ' + x.studentId + ' · ปี ' + x.year + (x.departmentName ? ' · ' + x.departmentName : '');
  $('eNick').value = x.nickname; $('eAka').value = x.aka; $('eClear').classList.toggle('hidden', !x.aka && !x.nickname);
  if (typeof $('editDlg').showModal === 'function') $('editDlg').showModal(); else $('editDlg').setAttribute('open', '');
  $('eNick').focus();
}
const closeEdit = () => { if ($('editDlg').open) $('editDlg').close(); editing = null; };
$('eCancel').onclick = closeEdit;
$('editForm').onsubmit = async (e) => {
  e.preventDefault(); if (!editing) return;
  try { await data('POST', '/camps/aka/admin/set', { studentId: editing.studentId, nickname: $('eNick').value, aka: $('eAka').value }); toast('บันทึกแล้ว'); closeEdit(); overview = null; loadList(); }
  catch (er) { toast(er.message, true); }
};
$('eClear').onclick = async () => {
  if (!editing || !confirm('ล้างชื่อเล่นและ AKA ของ ' + editing.name + ' ?')) return;
  try { await data('POST', '/camps/aka/admin/set', { studentId: editing.studentId, clear: true }); toast('ล้างชื่อแล้ว'); closeEdit(); overview = null; loadList(); }
  catch (er) { toast(er.message, true); }
};

// ---------- settings + export (admin) ----------
async function loadSettings() {
  try {
    await loadOverview(); applyInfo(overview); setChip(overview.state); const o = overview, pct = o.total ? Math.round(o.named / o.total * 100) : 0;
    $('progress').innerHTML = '<div class="bar"><i style="width:' + pct + '%"></i></div><div class="small">ตั้งชื่อแล้ว <b>' + o.named + '</b> จาก ' + o.total + ' คน (' + pct + '%)</div>';
    $('stOpen').classList.toggle('on', o.manual === 'open'); $('stClosed').classList.toggle('on', o.manual === 'closed');
    renderSchedule();
    const rows = await exportRows(false);
    $('exportPreview').innerHTML = rows.length ? rows.map((g) => esc(g.name) + ' ' + g.people.length + ' คน').join(' · ') : 'ยังไม่มีรายชื่อ';
  } catch (e) { toast(e.message, true); }
}
async function setState(state) {
  if (overview && overview.manual === state) return;
  if (!confirm(state === 'closed' ? 'ปิดรับการตั้งชื่อ? นักศึกษาจะแก้ชื่อเองไม่ได้อีก' : 'เปิดรับการตั้งชื่ออีกครั้ง?')) return;
  try { await data('POST', '/camps/aka/admin/state', { state }); toast(state === 'closed' ? 'ปิดรับการตั้งชื่อแล้ว' : 'เปิดรับการตั้งชื่อแล้ว'); loadSettings(); }
  catch (e) { toast(e.message, true); }
}
$('stOpen').onclick = () => setState('open'); $('stClosed').onclick = () => setState('closed');

// ---------- automatic schedule (admin) ----------
const toLocalInput = (ms) => (ms == null ? '' : new Date(ms - new Date(ms).getTimezoneOffset() * 60000).toISOString().slice(0, 16));
const fromLocalInput = (v) => (v ? new Date(v).getTime() : null);
const fmtWhen = (ms) => new Date(ms).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' });
function showMode(cd) { $('scModeDT').classList.toggle('on', !cd); $('scModeCD').classList.toggle('on', cd); $('scDT').classList.toggle('hidden', cd); $('scCD').classList.toggle('hidden', !cd); $('scSave').textContent = cd ? 'เริ่มนับถอยหลัง' : 'บันทึกเวลา'; }
function renderSchedule() {
  const sc = overview.schedule || {}, cd = sc.mode === 'countdown';
  showMode(cd);
  $('scOpen').value = cd ? '' : toLocalInput(sc.openAt); $('scClose').value = cd ? '' : toLocalInput(sc.closeAt);
  const word = { pending: 'ยังไม่เปิด', open: 'เปิดรับอยู่', closed: 'ปิดรับแล้ว' }[overview.state];
  $('schedState').className = 'schedstate' + (sc.enabled ? ' on' : '');
  $('schedState').textContent = sc.enabled ? 'กำลังตั้งเวลา · ตอนนี้' + word + (sc.openAt != null ? ' · เปิด ' + fmtWhen(sc.openAt) : '') + (sc.closeAt != null ? ' · ปิด ' + fmtWhen(sc.closeAt) : '') : 'ยังไม่ได้ตั้งเวลา';
  $('scStop').classList.toggle('hidden', !sc.enabled);
}
$('scModeDT').onclick = () => showMode(false); $('scModeCD').onclick = () => showMode(true);
async function saveSchedule(payload, msg) { try { await data('POST', '/camps/aka/admin/schedule', payload); toast(msg); await loadSettings(); } catch (e) { toast(e.message, true); } }
$('scSave').onclick = () => {
  if ($('scModeCD').classList.contains('on')) {
    const inSec = (Number($('cdInH').value) || 0) * 3600 + (Number($('cdInM').value) || 0) * 60;
    const hasFor = $('cdForH').value !== '' || $('cdForM').value !== '', forSec = (Number($('cdForH').value) || 0) * 3600 + (Number($('cdForM').value) || 0) * 60;
    if (hasFor && forSec < 10) return toast('ระยะเวลาที่เปิดรับต้องมากกว่า 10 วินาที', true);
    return saveSchedule({ enabled: true, mode: 'countdown', startInSec: inSec, durationSec: hasFor ? forSec : null }, 'เริ่มนับถอยหลังแล้ว');
  }
  const openAt = fromLocalInput($('scOpen').value), closeAt = fromLocalInput($('scClose').value);
  if (openAt == null && closeAt == null) return toast('ใส่เวลาเปิดหรือเวลาปิดอย่างน้อยหนึ่งอย่าง', true);
  return saveSchedule({ enabled: true, mode: 'datetime', openAt, closeAt }, 'บันทึกเวลาแล้ว');
};
$('scStop').onclick = () => { if (confirm('หยุดตั้งเวลา? แล้วใช้ปุ่มเปิด/ปิดแทน')) saveSchedule({ enabled: false, mode: (overview.schedule || {}).mode }, 'หยุดตั้งเวลาแล้ว'); };

// groups by department (HR order, "ยังไม่เลือกฝ่าย" last); inside a department: year 4 -> 1, then student id (the server already sorts this way)
async function exportRows(onlyNamed) {
  const list = (await data('GET', '/camps/aka/admin/list' + (onlyNamed ? '?named=1' : ''))).students || [], groups = [];
  for (const s of list) {
    const code = s.departmentCode || 'none';
    let g = groups.find((x) => x.code === code);
    if (!g) groups.push(g = { code, name: s.departmentName || 'ยังไม่เลือกฝ่าย', people: [] });
    g.people.push(s);
  }
  const yr = (a, b) => b.year - a.year || String(a.studentId).localeCompare(String(b.studentId));
  groups.forEach((g) => g.people.sort(yr));
  return groups;
}
const HEAD = ['รหัสนักศึกษา', 'ชื่อ-สกุล', 'ชื่อเล่น', 'AKA'];
const row = (s) => [String(s.studentId), s.name, s.nickname, s.aka];
const stamp = () => new Date().toISOString().slice(0, 10);
const loadJs = (src) => new Promise((res, rej) => { const el = document.createElement('script'); el.src = src; el.onload = res; el.onerror = () => rej(new Error('load ' + src)); document.head.appendChild(el); });
$('exportXlsx').onclick = async () => {
  try {
    const groups = await exportRows($('onlyNamed').checked); if (!groups.length) return toast('ไม่มีข้อมูลให้ส่งออก', true);
    if (!window.XLSX) await loadJs('/aka/vendor/xlsx.mini.min.js');
    const X = window.XLSX, wb = X.utils.book_new(), used = new Set();
    for (const g of groups) {
      const ws = X.utils.aoa_to_sheet([HEAD].concat(g.people.map(row))); ws['!cols'] = [16, 28, 16, 20].map((w) => ({ wch: w }));
      let n = g.name.replace(/[\\/?*[\]:]/g, ' ').slice(0, 28) || 'ฝ่าย', k = 2; const base = n; while (used.has(n)) n = base.slice(0, 26) + ' ' + k++;
      used.add(n); X.utils.book_append_sheet(wb, ws, n);
    }
    X.writeFile(wb, 'aka-by-department-' + stamp() + '.xlsx');
  } catch (e) { toast('ดาวน์โหลดไม่สำเร็จ ลองใหม่อีกครั้ง', true); }
};
let fonts = null;
$('exportPdf').onclick = async () => {
  try {
    const groups = await exportRows($('onlyNamed').checked); if (!groups.length) return toast('ไม่มีข้อมูลให้ส่งออก', true);
    if (!window.jspdf) { await loadJs('/aka/vendor/jspdf.umd.min.js'); await loadJs('/aka/vendor/jspdf.plugin.autotable.min.js'); }
    const b64 = async (u) => { const r = await fetch(u); if (!r.ok) throw new Error('font'); const buf = new Uint8Array(await r.arrayBuffer()); let bin = ''; for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000)); return btoa(bin); };
    if (!fonts) fonts = { n: await b64('/aka/fonts/Sarabun-Regular.ttf'), b: await b64('/aka/fonts/Sarabun-Bold.ttf') };
    const doc = new window.jspdf.jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    doc.addFileToVFS('Sarabun-Regular.ttf', fonts.n); doc.addFont('Sarabun-Regular.ttf', 'Sarabun', 'normal'); doc.addFileToVFS('Sarabun-Bold.ttf', fonts.b); doc.addFont('Sarabun-Bold.ttf', 'Sarabun', 'bold');
    const styles = { font: 'Sarabun', fontSize: 11, cellPadding: 2 }, headStyles = { font: 'Sarabun', fontStyle: 'bold', fillColor: [183, 28, 28] };
    groups.forEach((g, i) => {
      if (i) doc.addPage();
      doc.setFont('Sarabun', 'bold'); doc.setFontSize(16); doc.text(g.name, 14, 17);
      doc.setFont('Sarabun', 'normal'); doc.setFontSize(10); doc.text('รายชื่อ AKA · ' + g.people.length + ' คน · เรียงชั้นปีจากสูงไปต่ำ · พิมพ์เมื่อ ' + new Date().toLocaleString('th-TH'), 14, 23);
      const body = []; let y = null;
      for (const s of g.people) { if (s.year !== y) { y = s.year; body.push([{ content: 'ชั้นปี ' + y, colSpan: 4, styles: { fontStyle: 'bold', fillColor: [243, 244, 246] } }]); } body.push(row(s)); }
      doc.autoTable({ startY: 28, head: [HEAD], body, styles, headStyles, columnStyles: { 0: { cellWidth: 34 }, 2: { cellWidth: 36 } } });
    });
    const n = doc.getNumberOfPages(); for (let i = 1; i <= n; i++) { doc.setPage(i); doc.setFont('Sarabun', 'normal'); doc.setFontSize(9); doc.text(i + ' / ' + n, 196, 290, { align: 'right' }); }
    doc.save('aka-by-department-' + stamp() + '.pdf');
  } catch (e) { toast('ดาวน์โหลดไม่สำเร็จ ลองใหม่อีกครั้ง', true); }
};

init();
})();
