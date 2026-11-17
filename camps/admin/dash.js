// Admin dashboard (/admin/): live numbers for the HR registration, roster and AKA naming. Sign-in goes through the Worker (assets/worker-auth.js);
// the chrome (sidebar, search, calendar) works without data and the numbers refresh every 10 s once an admin is signed in.
(() => {
'use strict';
const API = window.CAMPS_API || 'https://engedlru-api.stnetworld.workers.dev';
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const STATE = { pending: ['เร็วๆ นี้', ''], open: ['เปิดลงทะเบียน', 'open'], closed: ['ปิดลงทะเบียน', 'closed'] };
const AKA_STATE = { pending: 'ยังไม่เปิด', open: 'เปิดรับ', closed: 'ปิดรับ' };
const MONTHS = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
const DOW = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'];
const root = $('dash');
let auth = null, timer = null, fails = 0, data = null, calMonth = null, filter = '';

// ---------- chrome ----------
const setMenu = (on) => { document.body.classList.toggle('menu', on); $('burger').setAttribute('aria-expanded', String(on)); };
$('burger').onclick = () => setMenu(!document.body.classList.contains('menu'));
$('scrim').onclick = () => setMenu(false);
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') setMenu(false); });
$('q').addEventListener('input', (e) => { filter = e.target.value.trim().toLowerCase(); if (data) renderTable(); });

// ---------- auth ----------
const signin = (msg) => { stop(); root.innerHTML = '<div class="card"><h2>เข้าสู่ระบบแอดมิน</h2><p class="mute">' + esc(msg || 'เข้าสู่ระบบด้วยบัญชี Google ที่มีสิทธิ์แอดมินเพื่อดูแดชบอร์ด') + '</p><button class="btn" id="dLogin" type="button">เข้าสู่ระบบด้วย Google</button></div>'; $('dLogin').onclick = login; $('logoutBtn').classList.add('hidden'); $('who').classList.add('hidden'); };
async function login() { try { await auth.loginWithRedirect({ authorizationParams: { connection: 'google-oauth2' }, appState: { returnTo: '/admin/' } }); } catch (e) { signin(e.message); } }
const signOut = (other) => { try { if (other) sessionStorage.setItem('chooseGoogle', '1'); } catch (e) { /* ignore */ } auth.logout({ logoutParams: { returnTo: location.origin + '/admin/' } }); };
$('logoutBtn').onclick = () => signOut(false);
async function get(path) {
  const go = async (fresh) => { const t = await auth.getTokenSilently(fresh ? { cacheMode: 'off' } : undefined); return fetch(API + path, { headers: { Authorization: 'Bearer ' + t } }); };
  let r = await go(false); if (r.status === 401) r = await go(true); return r;
}
async function showWho() {
  try { const u = await auth.getUser(); const el = $('who'); if (!u) return; el.classList.remove('hidden'); el.title = u.email || ''; el.innerHTML = u.picture ? '<img src="' + esc(u.picture) + '" alt="" referrerpolicy="no-referrer">' : esc(((u.name || u.email || '?').trim()[0] || '?').toUpperCase()); $('logoutBtn').classList.remove('hidden'); } catch (e) { /* optional */ }
}

// ---------- drawing ----------
const pct = (f, q) => (q > 0 ? Math.min(100, Math.round(f * 100 / q)) : 0);
const fmtN = (n) => Number(n || 0).toLocaleString('th-TH');
const stat = (label, big, sub, pc, dark) => '<div class="stat' + (dark ? ' dark' : '') + '"><span>' + esc(label) + '</span><b>' + big + '</b><small>' + sub + '</small>' + (pc == null ? '' : '<div class="bar" role="img" aria-label="' + pc + ' เปอร์เซ็นต์"><i style="width:' + pc + '%"></i></div>') + '</div>';
const dayKey = (d) => d.getFullYear() + '-' + d.getMonth() + '-' + d.getDate();
function events() {
  const s = data && data.ov.schedule, ev = new Map();
  if (s && s.enabled) { if (s.openAt != null) ev.set(dayKey(new Date(s.openAt)), 'เปิดลงทะเบียน'); if (s.closeAt != null) { const k = dayKey(new Date(s.closeAt)); ev.set(k, ev.has(k) ? ev.get(k) + ' / ปิดรับ' : 'ปิดรับลงทะเบียน'); } }
  return ev;
}
function calendar() {
  const now = new Date(); if (!calMonth) calMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const first = new Date(calMonth.getFullYear(), calMonth.getMonth(), 1), start = first.getDay(), days = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  const ev = events(), tk = dayKey(now); let cells = DOW.map((d) => '<span class="dow">' + d + '</span>').join('');
  for (let i = 0; i < start; i++) cells += '<span class="d out"></span>';
  for (let d = 1; d <= days; d++) { const k = first.getFullYear() + '-' + first.getMonth() + '-' + d; cells += '<span class="d' + (k === tk ? ' today' : '') + (ev.has(k) ? ' ev' : '') + '"' + (ev.has(k) ? ' title="' + esc(ev.get(k)) + '"' : '') + '>' + d + '</span>'; }
  const list = [...ev.entries()].map(([k, t]) => { const [y, m, d] = k.split('-').map(Number); return '<li>• ' + d + ' ' + MONTHS[m] + ' ' + (y + 543) + ' · ' + esc(t) + '</li>'; }).join('');
  return '<div class="cal"><button type="button" id="calPrev" aria-label="เดือนก่อน">‹</button><b>' + MONTHS[first.getMonth()] + ' ' + (first.getFullYear() + 543) + '</b><button type="button" id="calNext" aria-label="เดือนถัดไป">›</button></div><div class="grid7">' + cells + '</div>' + (list ? '<ul class="evlist">' + list + '</ul>' : '');
}
function chart(deps) {
  const max = Math.max(1, ...deps.map((d) => Math.max(d.quota, d.filled))), step = Math.max(1, Math.ceil(max / 4)), top = step * 4;
  const ticks = [0, 1, 2, 3, 4].map((i) => '<span>' + fmtN(i * step) + '</span>').join('');
  const cols = deps.map((d) => { const full = d.quota > 0 && d.filled >= d.quota; return '<div class="col' + (full ? ' full' : '') + '" title="' + esc(d.name) + ': ' + d.filled + ' / ' + d.quota + '"><em>' + d.filled + '</em><div class="well"><i style="height:' + (d.filled / top * 100) + '%"></i></div><label>' + esc(d.name.replace(/^ฝ่าย/, '')) + '</label></div>'; }).join('');
  return '<div class="chart"><div class="yax" aria-hidden="true">' + ticks + '</div><div class="plot" role="img" aria-label="จำนวนผู้ลงทะเบียนแต่ละฝ่าย">' + cols + '</div></div><div class="legend"><span><i></i>ลงทะเบียนแล้ว</span><span><i class="g"></i>ฝ่ายที่เต็ม</span></div>';
}
function ring(p) { const c = 2 * Math.PI * 38; return '<svg class="ring" viewBox="0 0 100 100" role="img" aria-label="' + p + ' เปอร์เซ็นต์"><circle class="t" cx="50" cy="50" r="38"/><circle class="v" cx="50" cy="50" r="38" stroke-dasharray="' + c.toFixed(1) + '" stroke-dashoffset="' + (c * (1 - p / 100)).toFixed(1) + '"/><text x="50" y="50">' + p + '%</text></svg>'; }
const timeOf = (x) => { const d = new Date(String(x).replace(' ', 'T') + 'Z'); return d.toLocaleDateString('th-TH', { day: 'numeric', month: 'short' }) + ' ' + d.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }); };
function renderTable() {
  const rows = data.live.recent.filter((x) => !filter || [x.name, x.student_id, x.department_name].some((v) => String(v || '').toLowerCase().includes(filter)));
  $('tbody').innerHTML = rows.length ? rows.map((x) => '<tr><td class="nm"><span class="av" aria-hidden="true">' + esc(((x.name || '?').replace(/^(นางสาว|นาย|นาง)\s*/, '')[0] || '?')) + '</span>' + esc(x.name) + '</td><td>' + esc(x.student_id) + '</td><td>' + esc(x.department_name) + '</td><td>ปี ' + esc(x.year) + '</td><td>' + esc(timeOf(x.selected_at)) + '</td><td><span class="tag">ลงทะเบียนแล้ว</span></td></tr>').join('') : '<tr class="empty"><td colspan="6">' + (filter ? 'ไม่พบรายการที่ค้นหา' : 'ยังไม่มีใครลงทะเบียน') + '</td></tr>';
}
function draw() {
  const { live, ov, aka } = data;
  const total = ['M', 'F'].reduce((n, g) => n + [1, 2, 3, 4].reduce((m, y) => m + ((ov.students[g] || {})[y] || 0), 0), 0);
  const st = STATE[live.registration] || STATE.pending, regPct = pct(ov.selectedTotal, total);
  const now = new Date();
  root.innerHTML = '<div class="pills"><span class="pill ' + st[1] + '">' + st[0] + '</span><span class="pill">AKA: ' + (AKA_STATE[aka.state] || '-') + '</span><span class="pill date" id="dNote">อัปเดต ' + now.toLocaleTimeString('th-TH') + '</span></div>'
    + '<div class="stats">' + stat('ลงทะเบียนฝ่ายแล้ว', fmtN(live.filled), 'จากโควตา ' + fmtN(live.quota) + ' ที่', pct(live.filled, live.quota), true)
    + stat('ที่ว่างที่เหลือ', fmtN(Math.max(0, live.quota - live.filled)), 'ทุกฝ่ายรวมกัน', null)
    + stat('นักศึกษาในรายชื่อ', fmtN(total), 'ยังไม่เลือกฝ่าย ' + fmtN(Math.max(0, total - ov.selectedTotal)) + ' คน', pct(ov.selectedTotal, total))
    + stat('ตั้งชื่อ AKA แล้ว', fmtN(aka.named), 'จาก ' + fmtN(aka.total) + ' คน', pct(aka.named, aka.total)) + '</div>'
    + '<div class="row2"><section class="card"><div class="chead"><h2>ผู้ลงทะเบียนแต่ละฝ่าย</h2><a class="iconbtn" href="/admin/hr/live" aria-label="ดูหน้าสด">↗</a></div>' + chart(live.departments) + '</section>'
    + '<section class="card"><div id="calBox">' + calendar() + '</div><div class="ringcard"><div><b>เลือกฝ่ายแล้ว</b><small>' + fmtN(ov.selectedTotal) + ' จาก ' + fmtN(total) + ' คน</small></div>' + ring(regPct) + '</div></section></div>'
    + '<section class="card"><div class="chead"><h2>ลงทะเบียนล่าสุด</h2><span><button type="button" class="iconbtn" id="reload" aria-label="รีเฟรช">↻</button> <a class="iconbtn" href="/admin/hr/students" aria-label="ดูรายชื่อนักศึกษา">↗</a></span></div><div class="tw"><table><thead><tr><th>ชื่อ-สกุล</th><th>รหัสนักศึกษา</th><th>ฝ่าย</th><th>ชั้นปี</th><th>เวลา</th><th>สถานะ</th></tr></thead><tbody id="tbody"></tbody></table></div></section>';
  renderTable(); bindCal(); $('reload').onclick = () => tick(true);
}
function bindCal() {
  const redo = () => { $('calBox').innerHTML = calendar(); bindCal(); };
  const p = $('calPrev'), n = $('calNext'); if (!p) return;
  p.onclick = () => { calMonth = new Date(calMonth.getFullYear(), calMonth.getMonth() - 1, 1); redo(); };
  n.onclick = () => { calMonth = new Date(calMonth.getFullYear(), calMonth.getMonth() + 1, 1); redo(); };
}
function stop() { clearTimeout(timer); }
async function tick(now) {
  stop();
  if (document.hidden && !now) { timer = setTimeout(tick, 3000); return; }
  try {
    const [a, b, c] = await Promise.all([get('/camps/admin/live'), get('/camps/admin/overview'), get('/camps/aka/admin/overview')]);
    if ([a, b, c].some((r) => r.status === 401)) return signin('เข้าสู่ระบบหมดอายุ');
    if ([a, b, c].some((r) => r.status === 403)) { root.innerHTML = '<div class="card"><h2>ไม่มีสิทธิ์</h2><p class="mute">บัญชีนี้ไม่ใช่แอดมิน ใช้บัญชีอื่นแทน</p><button class="btn" id="dOut" type="button">ใช้บัญชี Google อื่น</button></div>'; $('dOut').onclick = () => signOut(true); return; }
    if (![a, b, c].every((r) => r.ok)) throw new Error('http');
    fails = 0; const first = !data; data = { live: await a.json(), ov: await b.json(), aka: await c.json() };
    if (first || $('tbody')) draw();
  } catch (e) {
    if (e && ['login_required', 'missing_refresh_token', 'invalid_grant', 'consent_required', 'interaction_required'].includes(e.error)) return signin();
    fails++; const n = $('dNote'); if (n) n.textContent = 'เชื่อมต่อไม่ได้ กำลังลองใหม่…'; else root.innerHTML = '<div class="card"><p class="mute">โหลดข้อมูลไม่สำเร็จ กำลังลองใหม่…</p></div>';
  }
  timer = setTimeout(tick, fails ? Math.min(30000, 5000 * (fails + 1)) : 10000);
}
(async () => {
  try {
    await new Promise((res, rej) => { let n = 0; const w = () => (window.auth0 ? res() : ++n > 100 ? rej(new Error('โหลดหน้าเข้าสู่ระบบไม่สำเร็จ')) : setTimeout(w, 100)); w(); });
    auth = await auth0.createAuth0Client({ domain: 'auth.litalkeducation.com', clientId: 'x', authorizationParams: { redirect_uri: location.href } });
    if (location.search.includes('code=') || location.search.includes('error=')) { try { await auth.handleRedirectCallback(); } catch (e) { signin(e.message); return; } }
    if (await auth.isAuthenticated()) { showWho(); tick(true); } else signin();
  } catch (e) { root.innerHTML = '<div class="card"><p class="mute">' + esc(e.message || 'เข้าใช้งานไม่ได้ชั่วคราว') + '</p></div>'; }
})();
})();
