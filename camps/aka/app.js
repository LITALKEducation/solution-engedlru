(() => {
'use strict';
// This system has its OWN Auth0 application (SPA) and callback /aka/. Paste its Client ID below (see camps/README.md → "One Auth0 application per system").
const API = 'https://engedlru-api.stnetworld.workers.dev', DOMAIN = window.AKA_AUTH0_DOMAIN || 'auth.litalkeducation.com', CLIENT = window.AKA_AUTH0_CLIENT_ID || 'PGqozL94LzOwstm4pD39W5kvalYRiK7w', REDIRECT = location.origin + '/aka/';   // Allowed Callback + Logout URLs must list it
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const GENDER = { M: 'ชาย', F: 'หญิง' };
const AUTH_GONE = ['login_required', 'missing_refresh_token', 'invalid_grant', 'consent_required', 'interaction_required'];
const REASONS = {
  not_university_email: 'บัญชี Google นี้ไม่ใช่อีเมลมหาวิทยาลัย (@lru.ac.th) กรุณาเข้าสู่ระบบด้วยอีเมลมหาวิทยาลัยของคุณ',
  email_not_verified: 'อีเมลของบัญชีนี้ยังไม่ได้ยืนยัน กรุณายืนยันอีเมลกับ Google ก่อน',
  not_in_roster: 'ไม่พบรหัสนักศึกษาของคุณในรายชื่อ กรุณาติดต่อผู้ดูแล'
};
let auth = null, me = null, isAdmin = false;

// ---------- helpers ----------
let toastT;
function toast(msg, bad) { const t = $('toast'); t.textContent = msg; t.className = (bad ? 'bad ' : '') + 'show'; clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 3200); }
async function api(path, opt = {}) {
  const go = async (fresh) => { const t = await auth.getTokenSilently(fresh ? { cacheMode: 'off' } : undefined); return fetch(API + path, { ...opt, headers: { ...(opt.headers || {}), Authorization: 'Bearer ' + t } }); };
  let r = await go(false); if (r.status === 401) r = await go(true); return r;
}
async function data(method, path, body) {
  const r = await api(path, { method, headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  const d = await r.json().catch(() => ({ error: 'ตอบกลับจากเซิร์ฟเวอร์ไม่ถูกต้อง' }));
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
    $('account').innerHTML = '<span class="em">' + esc(me.email) + '</span>' + (isAdmin ? '<span class="badge">ผู้ดูแล</span>' : '') + '<button id="logoutBtn" class="link" type="button">ออก</button>';
    $('logoutBtn').onclick = signOut;
    document.querySelectorAll('.adm').forEach((b) => b.classList.toggle('hidden', !isAdmin));
    $('login').classList.add('hidden'); $('app').classList.remove('hidden');
    renderMe();
  } catch (e) {
    $('login').classList.remove('hidden');
    if (AUTH_GONE.includes(e.error)) { $('account').textContent = 'เซสชันหมดอายุ'; return; }
    $('login').querySelector('p').textContent = e.message || 'ไม่สามารถเชื่อมต่อระบบได้'; $('account').textContent = 'เกิดข้อผิดพลาด';
  }
}
async function loadMe() { me = await data('GET', '/camps/aka/me'); isAdmin = !!me.isAdmin; }
function signOut() { try { sessionStorage.setItem('chooseGoogle', '1'); } catch (e) { /* ignore */ } auth.logout({ logoutParams: { returnTo: REDIRECT } }); }
$('loginBtn').onclick = () => { const ap = { connection: 'google-oauth2' }; try { if (sessionStorage.getItem('chooseGoogle')) { ap.prompt = 'select_account'; sessionStorage.removeItem('chooseGoogle'); } } catch (e) { /* ignore */ } auth.loginWithRedirect({ authorizationParams: ap }); };

document.querySelectorAll('#tabs button').forEach((b) => b.onclick = () => {
  document.querySelectorAll('#tabs button').forEach((x) => x.classList.toggle('on', x === b));
  document.querySelectorAll('.view').forEach((v) => v.classList.add('hidden'));
  $('view-' + b.dataset.tab).classList.remove('hidden');
  if (b.dataset.tab === 'me') renderMe(); else if (b.dataset.tab === 'list') loadList(); else if (b.dataset.tab === 'settings') loadSettings();
});

// ---------- my names ----------
function setChip(open) { const c = $('heroChip'); c.textContent = open ? 'เปิดรับการตั้งชื่อ' : 'ปิดรับแล้ว'; c.className = 'state-chip ' + (open ? 'open' : 'closed'); }
function renderMe() {
  const open = me.state === 'open'; setChip(open);
  $('stateBanner').innerHTML = '<div class="banner ' + (open ? 'ok' : 'warn') + '"><b>' + (open ? 'เปิดรับการตั้งชื่อ' : 'ปิดรับการตั้งชื่อแล้ว') + '</b><span>' + (open ? 'ตั้งชื่อและเปลี่ยนชื่อได้ตลอดเวลา จนกว่าผู้ดูแลจะปิดรับ' : 'ไม่สามารถเปลี่ยนชื่อได้แล้ว หากต้องการแก้ไขให้ติดต่อผู้ดูแล') + '</span></div>';
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
  catch (er) { toast(er.message, true); if (er.data && er.data.code === 'CLOSED') { await loadMe(); renderMe(); } else $('saveBtn').disabled = false; }
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
    await loadOverview(); const o = overview, pct = o.total ? Math.round(o.named / o.total * 100) : 0;
    $('progress').innerHTML = '<div class="bar"><i style="width:' + pct + '%"></i></div><div class="small">ตั้งชื่อแล้ว <b>' + o.named + '</b> จาก ' + o.total + ' คน (' + pct + '%)</div>';
    $('stOpen').classList.toggle('on', o.state === 'open'); $('stClosed').classList.toggle('on', o.state === 'closed'); setChip(o.state === 'open');
    const rows = await exportRows(false);
    $('exportPreview').innerHTML = rows.length ? rows.map((g) => esc(g.name) + ' ' + g.people.length + ' คน').join(' · ') : 'ยังไม่มีรายชื่อในระบบ';
  } catch (e) { toast(e.message, true); }
}
async function setState(state) {
  if (overview && overview.state === state) return;
  if (!confirm(state === 'closed' ? 'ปิดรับการตั้งชื่อ? นักศึกษาจะเปลี่ยนชื่อไม่ได้อีก (ผู้ดูแลยังแก้ไขได้)' : 'เปิดรับการตั้งชื่ออีกครั้ง?')) return;
  try { await data('POST', '/camps/aka/admin/state', { state }); toast(state === 'closed' ? 'ปิดรับการตั้งชื่อแล้ว' : 'เปิดรับการตั้งชื่อแล้ว'); loadSettings(); }
  catch (e) { toast(e.message, true); }
}
$('stOpen').onclick = () => setState('open'); $('stClosed').onclick = () => setState('closed');

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
  } catch (e) { toast('สร้างไฟล์ Excel ไม่ได้', true); }
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
  } catch (e) { toast('สร้างไฟล์ PDF ไม่ได้', true); }
};

init();
})();
