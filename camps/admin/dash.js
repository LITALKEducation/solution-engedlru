// Admin dashboard (/admin/): live numbers for the HR registration, roster and AKA naming. Sign-in uses the HR Auth0 application
// (callback /hr/, which sends the admin back here); everything below the numbers is the old menu of tiles.
(() => {
'use strict';
const API = window.CAMPS_API || 'https://engedlru-api.stnetworld.workers.dev';
const DOMAIN = window.HR_AUTH0_DOMAIN || 'auth.litalkeducation.com', CLIENT = window.HR_AUTH0_CLIENT_ID || 'PGqozL94LzOwstm4pD39W5kvalYRiK7w';
const HR_URL = location.origin + '/hr/';
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const STATE = { pending: ['เร็วๆ นี้', ''], open: ['เปิดลงทะเบียน', 'open'], closed: ['ปิดลงทะเบียน', 'closed'] };
const AKA_STATE = { pending: 'ยังไม่เปิด', open: 'เปิดรับ', closed: 'ปิดรับ' };
let auth = null, timer = null, fails = 0;
const root = $('dash');
const signin = (msg) => { root.innerHTML = '<div class="dcard"><h2>เข้าสู่ระบบแอดมิน</h2><p class="dmute">' + esc(msg || 'เข้าสู่ระบบด้วยบัญชี Google ที่มีสิทธิ์แอดมินเพื่อดูแดชบอร์ด') + '</p><button class="dbtn" id="dLogin" type="button">เข้าสู่ระบบด้วย Google</button></div>'; $('dLogin').onclick = login; };
async function login() {
  try { sessionStorage.setItem('hrReturn', '/admin/'); } catch (e) { /* ignore */ }
  try { await auth.loginWithRedirect({ authorizationParams: { connection: 'google-oauth2' }, appState: { returnTo: '/admin/' } }); } catch (e) { signin(e.message); }
}
async function get(path) {
  const go = async (fresh) => { const t = await auth.getTokenSilently(fresh ? { cacheMode: 'off' } : undefined); return fetch(API + path, { headers: { Authorization: 'Bearer ' + t } }); };
  let r = await go(false); if (r.status === 401) r = await go(true); return r;
}
const pct = (f, q) => (q > 0 ? Math.min(100, Math.round(f * 100 / q)) : 0);
const stat = (label, big, sub, pc) => '<div class="dstat"><span>' + esc(label) + '</span><b>' + big + '</b><small>' + sub + '</small>' + (pc == null ? '' : '<div class="dbar" role="img" aria-label="' + pc + ' เปอร์เซ็นต์"><i style="width:' + pc + '%"></i></div>') + '</div>';
function draw(live, ov, aka) {
  const total = ['M', 'F'].reduce((n, g) => n + [1, 2, 3, 4].reduce((m, y) => m + ((ov.students[g] || {})[y] || 0), 0), 0);
  const st = STATE[live.registration] || STATE.pending;
  const rows = live.departments.map((x) => '<li class="' + (x.quota > 0 && x.filled >= x.quota ? 'full' : '') + '"><div class="dh"><b>' + esc(x.name) + '</b><span>' + x.filled + ' / ' + x.quota + (x.quota > 0 && x.filled >= x.quota ? ' · เต็ม' : ' · เหลือ ' + x.remaining) + '</span></div><div class="dbar" role="img" aria-label="' + esc(x.name) + ' ' + pct(x.filled, x.quota) + ' เปอร์เซ็นต์"><i style="width:' + pct(x.filled, x.quota) + '%"></i></div></li>').join('');
  const t = (x) => new Date(String(x).replace(' ', 'T') + 'Z').toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
  const recent = live.recent.length ? live.recent.map((x) => '<li><span class="dt">' + esc(t(x.selected_at)) + '</span><span>' + esc(x.name) + ' <small>ปี ' + x.year + '</small></span><span class="dd">' + esc(x.department_name) + '</span></li>').join('') : '<li class="dmute">ยังไม่มีใครลงทะเบียน</li>';
  root.innerHTML = '<div class="dtop"><span class="dchip ' + st[1] + '">' + st[0] + '</span><span class="dmute" id="dNote">อัปเดต ' + new Date().toLocaleTimeString('th-TH') + ' · รีเฟรชเองทุก 10 วินาที</span></div>'
    + '<div class="dstats">' + stat('ลงทะเบียนฝ่ายแล้ว', live.filled, 'จากโควตา ' + live.quota + ' ที่ · เหลือ ' + Math.max(0, live.quota - live.filled), pct(live.filled, live.quota))
    + stat('นักศึกษาในรายชื่อ', total, 'ยังไม่เลือกฝ่าย ' + Math.max(0, total - ov.selectedTotal) + ' คน', pct(ov.selectedTotal, total))
    + stat('ตั้งชื่อ AKA แล้ว', aka.named, 'จาก ' + aka.total + ' คน · ' + (AKA_STATE[aka.state] || ''), pct(aka.named, aka.total)) + '</div>'
    + '<div class="dcols"><section class="dcard"><h2>แต่ละฝ่าย</h2><ul class="dlist">' + rows + '</ul></section><section class="dcard"><h2>ลงทะเบียนล่าสุด</h2><ul class="drecent">' + recent + '</ul></section></div>';
}
async function tick() {
  clearTimeout(timer);
  if (document.hidden) { timer = setTimeout(tick, 3000); return; }
  try {
    const [a, b, c] = await Promise.all([get('/camps/admin/live'), get('/camps/admin/overview'), get('/camps/aka/admin/overview')]);
    if ([a, b, c].some((r) => r.status === 401)) return signin('เข้าสู่ระบบหมดอายุ');
    if ([a, b, c].some((r) => r.status === 403)) { root.innerHTML = '<div class="dcard"><h2>ไม่มีสิทธิ์</h2><p class="dmute">บัญชีนี้ไม่ใช่แอดมิน ใช้บัญชีอื่นแทน</p><button class="dbtn" id="dOut" type="button">ใช้บัญชี Google อื่น</button></div>'; $('dOut').onclick = () => { try { sessionStorage.setItem('chooseGoogle', '1'); } catch (e) { /* ignore */ } auth.logout({ logoutParams: { returnTo: HR_URL } }); }; return; }
    if (![a, b, c].every((r) => r.ok)) throw new Error('http');
    fails = 0; draw(await a.json(), await b.json(), await c.json());
  } catch (e) {
    if (e && ['login_required', 'missing_refresh_token', 'invalid_grant', 'consent_required', 'interaction_required'].includes(e.error)) return signin();
    fails++; const n = $('dNote'); if (n) n.textContent = 'เชื่อมต่อไม่ได้ กำลังลองใหม่…'; else root.innerHTML = '<div class="dcard"><p class="dmute">โหลดข้อมูลไม่สำเร็จ กำลังลองใหม่…</p></div>';
  }
  timer = setTimeout(tick, fails ? Math.min(30000, 5000 * (fails + 1)) : 10000);
}
(async () => {
  try {
    await new Promise((res, rej) => { let n = 0; const w = () => (window.auth0 ? res() : ++n > 100 ? rej(new Error('โหลดหน้าเข้าสู่ระบบไม่สำเร็จ')) : setTimeout(w, 100)); w(); });
    auth = await auth0.createAuth0Client({ domain: DOMAIN, clientId: CLIENT, cacheLocation: 'localstorage', useRefreshTokens: true, authorizationParams: { redirect_uri: HR_URL } });
    if (location.search.includes('code=') || location.search.includes('error=')) { try { await auth.handleRedirectCallback(); } catch (e) { signin(e.message); return; } }
    if (await auth.isAuthenticated()) tick(); else signin();
  } catch (e) { root.innerHTML = '<div class="dcard"><p class="dmute">' + esc(e.message || 'เข้าใช้งานไม่ได้ชั่วคราว') + '</p></div>'; }
})();
})();
