// Maintenance mode notice shared by every Camps page (not the budget app): asks the Worker for /camps/maintenance and, while an admin has the system closed
// ("ปิดปรับปรุงระบบ"), covers the page with a notice; before the start time it shows a heads-up banner. Admin pages only ever get a slim banner (admins can
// keep working). Fails open: if the status cannot be read the page is left alone. The Worker also refuses the writes, this is just the friendly face.
(function () {
  'use strict';
  if (window.__maint) return; window.__maint = 1;
  var API = window.CAMPS_API || 'https://engedlru-api.stnetworld.workers.dev';
  var path = location.pathname, admin = /^\/admin(\/|$)/.test(path), home = path === '/' || path === '/index.html';
  var sys = /^\/lotto(\/|$)/.test(path) ? 'lotto' : /^\/qrcheck(\/|$)/.test(path) ? 'qrcheck' : 'hr';   // /hr/, /aka/, /shirt/ ... are all "hr"
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var when = function (ms) { return new Date(ms).toLocaleString('th-TH', { dateStyle: 'long', timeStyle: 'short' }); };
  var css = '#maintOv{position:fixed;inset:0;z-index:2147483000;background:#fff;display:grid;place-items:center;padding:24px;font-family:"Noto Sans Thai",system-ui,sans-serif;color:#161616;overflow:auto}'
    + '#maintOv .mc{max-width:460px;width:100%;text-align:center;display:grid;gap:12px}#maintOv img{width:160px;margin:0 auto}#maintOv h1{margin:0;font-size:28px;line-height:1.4}'
    + '#maintOv .mm{white-space:pre-line;font-size:17px;line-height:1.7;color:#4f4445}#maintOv .mu{font-weight:700;color:#c62828}'
    + '#maintOv a,#maintOv button{font:inherit;color:#4f4445;background:none;border:0;text-decoration:underline;cursor:pointer;padding:6px}#maintOv .mb{display:inline-block;background:#c62828;color:#fff;text-decoration:none;border-radius:99px;padding:10px 22px;font-weight:700}'
    + '#maintBn{position:relative;z-index:2147482000;background:#fff7d6;color:#6b4e00;border-bottom:2px solid #f0c000;padding:10px 16px;font:15px/1.6 "Noto Sans Thai",system-ui,sans-serif;text-align:center;white-space:pre-line}#maintBn b{color:#161616}';
  var st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
  var wasActive = false;
  function overlay(d) {
    var el = document.getElementById('maintOv');
    if (!el) {
      el = document.createElement('div'); el.id = 'maintOv'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-labelledby', 'maintT');
      document.body.appendChild(el); document.documentElement.style.overflow = 'hidden';
      Array.prototype.forEach.call(document.body.children, function (c) { if (c !== el && c.tagName !== 'SCRIPT' && c.tagName !== 'STYLE') { c.setAttribute('inert', ''); c.setAttribute('aria-hidden', 'true'); } });
    }
    el.innerHTML = '<div class="mc"><img src="/assets/logo-english-education.png" alt=""><h1 id="maintT">ปิดปรับปรุงระบบ</h1><div class="mm">' + esc(d.message) + '</div>'
      + (d.until ? '<div class="mu">คาดว่าจะเปิดใช้งานอีกครั้ง ' + esc(when(d.until)) + '</div>' : '') + '<div><button type="button" id="maintRe">ตรวจสอบอีกครั้ง</button> · <a href="/admin/">สำหรับแอดมิน</a></div></div>';
    document.getElementById('maintRe').onclick = function () { check(true); };
  }
  function clearOverlay() {
    var el = document.getElementById('maintOv'); if (!el) return; el.remove(); document.documentElement.style.overflow = '';
    Array.prototype.forEach.call(document.body.children, function (c) { c.removeAttribute('inert'); c.removeAttribute('aria-hidden'); });
  }
  function banner(html) {
    var el = document.getElementById('maintBn');
    if (!html) { if (el) el.remove(); return; }
    if (!el) { el = document.createElement('div'); el.id = 'maintBn'; el.setAttribute('role', 'status'); document.body.insertBefore(el, document.body.firstChild); }
    el.innerHTML = html;
  }
  function apply(d) {
    var active = d.state === 'active', upcoming = d.state === 'upcoming', inScope = (d.scope || []).indexOf(sys) >= 0;
    if (wasActive && d.state === 'off' && !admin) { location.reload(); return; }   // the window ended: open the page again
    wasActive = active;
    if (admin) {
      banner(active ? '<b>ปิดปรับปรุงระบบอยู่</b> · นักศึกษา / เจ้าหน้าที่ใช้งานไม่ได้ (แอดมินใช้ได้ปกติ)' + (d.until ? ' · ถึง ' + esc(when(d.until)) : '') + ' · <a href="/admin/hr/maintenance">ตั้งค่า</a>'
        : upcoming ? '<b>กำหนดปิดปรับปรุงระบบ</b> ' + esc(when(d.from)) + (d.until ? ' ถึง ' + esc(when(d.until)) : '') + ' · <a href="/admin/hr/maintenance">ตั้งค่า</a>' : '');
      return;
    }
    if (active && !home && inScope) { banner(''); overlay(d); return; }
    clearOverlay();
    if (active && home) banner('<b>ปิดปรับปรุงระบบ</b>\n' + esc(d.message) + (d.until ? '\nคาดว่าจะเปิดใช้งานอีกครั้ง ' + esc(when(d.until)) : ''));
    else if (upcoming && (home || inScope)) banner('<b>แจ้งล่วงหน้า: ปิดปรับปรุงระบบ</b> ' + esc(when(d.from)) + (d.until ? ' ถึง ' + esc(when(d.until)) : '') + '\n' + esc(d.message));
    else banner('');
  }
  function check(manual) {
    fetch(API + '/camps/maintenance').then(function (r) { if (!r.ok) throw new Error('http'); return r.json(); }).then(apply).catch(function () { /* fail open */ });
  }
  check(); setInterval(check, 60000);
})();
