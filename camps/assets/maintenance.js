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
  var css = '#maintOv{position:fixed;inset:0;z-index:2147483000;background:#fff;display:grid;place-items:center;padding:24px;font-family:"Noto Sans Thai",Inter,system-ui,sans-serif;color:#18181b;overflow:auto}'
    + '#maintOv .mc{max-width:560px;width:100%;text-align:center;display:grid;justify-items:center;gap:14px}'
    + '#maintOv .mart{width:min(78vw,300px);height:auto;display:block;margin:0 auto 8px}'
    + '#maintOv h1{margin:0;font-size:clamp(1.6rem,6vw,2.25rem);font-weight:600;line-height:1.4}'
    + '#maintOv .mm{white-space:pre-line;font-size:1.0625rem;line-height:1.7;color:#4a4a52;max-width:30em}'
    + '#maintOv .mu{display:grid;justify-items:center;gap:2px;background:#f1f1f3;border-radius:22px;padding:10px 22px;font-size:.9375rem;color:#4a4a52;text-align:center}#maintOv .mu b{font-size:1.0625rem;color:#18181b;font-weight:600}'
    + '#maintOv .mu span::before{content:"";display:inline-block;width:8px;height:8px;margin-right:8px;border-radius:50%;background:#f59e0b;animation:mpulse 1.6s ease-in-out infinite}'
    + '#maintOv .mact{display:flex;flex-wrap:wrap;justify-content:center;gap:10px;margin-top:10px}'
    + '#maintOv .mb{font:inherit;display:inline-flex;align-items:center;justify-content:center;min-height:48px;padding:0 26px;border-radius:999px;background:#18181b;color:#fff;border:0;font-weight:600;cursor:pointer;text-decoration:none;transition:transform .15s,background-color .2s}'
    + '#maintOv .mb:hover{background:#000}#maintOv .mb:active{transform:scale(.97)}#maintOv .mb[disabled]{opacity:.6}'
    + '#maintOv .ml{font:inherit;color:#5f5f68;text-decoration:underline;text-underline-offset:3px;display:inline-flex;align-items:center;min-height:48px;padding:0 14px}'
    + '#maintOv .mlogo{height:30px;width:auto;margin-top:26px;opacity:.75}'
    + '#maintOv .z{animation:mz 3.2s ease-in-out infinite;opacity:0;transform-box:fill-box;transform-origin:center}#maintOv .z2{animation-delay:.9s}#maintOv .z3{animation-delay:1.8s}'
    + '@keyframes mz{0%{opacity:0;transform:translate(0,8px) scale(.7)}30%{opacity:1}100%{opacity:0;transform:translate(10px,-18px) scale(1.15)}}'
    + '@keyframes mpulse{50%{opacity:.35}}'
    + '@media(prefers-reduced-motion:reduce){#maintOv .z,#maintOv .mu span::before{animation:none}#maintOv .z{opacity:1}}'
    + '#maintBn{position:relative;z-index:2147482000;background:#fff7d6;color:#6b4e00;border-bottom:2px solid #f0c000;padding:10px 16px;font:15px/1.6 "Noto Sans Thai",system-ui,sans-serif;text-align:center;white-space:pre-line}#maintBn b{color:#161616}';
  var st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
  var ART = '<svg class="mart" viewBox="0 0 320 220" role="img" aria-label="กำลังปิดปรับปรุงระบบ" xmlns="http://www.w3.org/2000/svg">'
    + '<ellipse cx="160" cy="196" rx="112" ry="12" fill="#18181b" opacity=".07"/>'
    + '<rect x="58" y="132" width="5" height="50" rx="2.5" fill="#18181b"/><rect x="258" y="132" width="5" height="50" rx="2.5" fill="#18181b"/><rect x="156" y="150" width="5" height="40" rx="2.5" fill="#18181b"/>'
    + '<path d="M52 112 L160 70 L268 112 L268 150 Q160 196 52 150 Z" fill="#38bdf8"/>'
    + '<path d="M52 112 L160 70 L268 112 L160 158 Z" fill="#7dd3fc"/>'
    + '<path d="M196 92 L254 112 L226 124 L170 104 Z" fill="#e0f2fe"/>'
    + '<ellipse cx="205" cy="104" rx="26" ry="9" fill="#bae6fd" transform="rotate(20 205 104)"/>'
    + '<circle cx="196" cy="100" r="13" fill="#fff"/>'
    + '<path d="M184 96 Q196 70 214 92 Q206 100 196 100 Z" fill="#ef4444"/><circle cx="214" cy="92" r="4" fill="#fff"/>'
    + '<path d="M190 102 q4 3 8 0" stroke="#18181b" stroke-width="1.6" fill="none" stroke-linecap="round"/>'
    + '<path d="M72 120 L196 112 L240 128 L160 168 L84 140 Z" fill="#a5e4fc" opacity=".9"/>'
    + '<path d="M96 126 Q150 112 214 124" stroke="#fff" stroke-width="1.5" fill="none" opacity=".7"/>'
    + '<text class="z z1" x="214" y="62" font-size="22" font-weight="600" fill="#18181b">z</text><text class="z z2" x="234" y="44" font-size="28" font-weight="600" fill="#18181b">Z</text><text class="z z3" x="258" y="30" font-size="34" font-weight="600" fill="#18181b">Z</text></svg>';
  var wasActive = false;
  function overlay(d) {
    var el = document.getElementById('maintOv');
    if (!el) {
      el = document.createElement('div'); el.id = 'maintOv'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-labelledby', 'maintT');
      document.body.appendChild(el); document.documentElement.style.overflow = 'hidden';
      Array.prototype.forEach.call(document.body.children, function (c) { if (c !== el && c.tagName !== 'SCRIPT' && c.tagName !== 'STYLE') { c.setAttribute('inert', ''); c.setAttribute('aria-hidden', 'true'); } });
    }
    el.innerHTML = '<div class="mc">' + ART + '<h1 id="maintT">ปิดปรับปรุงระบบชั่วคราว</h1><div class="mm">' + esc(d.message) + '</div>'
      + (d.until ? '<div class="mu"><span>คาดว่าจะเปิดใช้งานอีกครั้ง</span><b>' + esc(when(d.until)) + '</b></div>' : '')
      + '<div class="mact"><button type="button" class="mb" id="maintRe">ตรวจสอบอีกครั้ง</button><a class="ml" href="/admin/">สำหรับแอดมิน</a></div>'
      + '<img class="mlogo" src="/assets/logo-english-education.png" alt="English Education"></div>';
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
