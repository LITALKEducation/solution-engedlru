// Maintenance mode notice shared by every Camps page (not the budget app): asks the Worker for /camps/maintenance and, while an admin has the system closed
// ("ปิดปรับปรุงระบบ"), covers the page with a notice; before the start time it shows a heads-up banner. Admin pages only ever get a slim banner (admins can
// keep working). Fails open: if the status cannot be read the page is left alone. The Worker also refuses the writes, this is just the friendly face.
(function () {
  'use strict';
  if (window.__maint) return; window.__maint = 1;
  var API = window.CAMPS_API || 'https://engedlru-api.stnetworld.workers.dev';
  var path = location.pathname, admin = /^\/admin(\/|$)/.test(path), home = path === '/' || path === '/index.html';
  var sys = /^\/lotto(\/|$)/.test(path) ? 'lotto' : /^\/qrcheck(\/|$)/.test(path) ? 'qrcheck' : 'hr';   // /student/, /aka/, /shirt/ ... are all "hr"
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
    + '#maintOv .mbed{transform-box:fill-box;transform-origin:50% 100%;animation:mbreath 3.6s ease-in-out infinite}#maintOv .msh{transform-box:fill-box;transform-origin:center;animation:mshadow 3.6s ease-in-out infinite}'
    + '@keyframes mbreath{0%,100%{transform:translateY(0) scale(1)}50%{transform:translateY(-4px) scale(1.012,1.02)}}@keyframes mshadow{0%,100%{transform:scale(1);opacity:.07}50%{transform:scale(.94);opacity:.045}}'
    + '@keyframes min{from{opacity:0;transform:translateY(var(--distance-medium,12px));filter:blur(var(--blur-medium,3px))}to{opacity:1;transform:none;filter:none}}@keyframes mart{from{opacity:0;transform:translateY(-18px) scale(.92)}to{opacity:1;transform:none}}'
    + '#maintOv .mart{animation:mart var(--duration-very-slow,500ms) var(--ease-smooth-out,cubic-bezier(.22,1,.36,1)) both}#maintOv .mc>:not(.mart){animation:min var(--duration-very-slow,500ms) var(--ease-smooth-out,cubic-bezier(.22,1,.36,1)) both}'
    + '#maintOv .mc>:nth-child(2){animation-delay:var(--duration-stagger,40ms)}#maintOv .mc>:nth-child(3){animation-delay:calc(var(--duration-stagger,40ms)*2)}#maintOv .mc>:nth-child(4){animation-delay:calc(var(--duration-stagger,40ms)*3)}#maintOv .mc>:nth-child(5){animation-delay:calc(var(--duration-stagger,40ms)*4)}#maintOv .mc>:nth-child(6){animation-delay:calc(var(--duration-stagger,40ms)*5)}'
    + '@keyframes mz{0%{opacity:0;transform:translate(0,8px) scale(.7)}30%{opacity:1}100%{opacity:0;transform:translate(10px,-18px) scale(1.15)}}'
    + '@keyframes mpulse{50%{opacity:.35}}'
    + '@media(prefers-reduced-motion:reduce){#maintOv .mbed,#maintOv .msh,#maintOv .mart,#maintOv .mc>*,#maintOv .z,#maintOv .mu span::before{animation:none}#maintOv .z{opacity:1}}'
    + '#maintBn{position:relative;z-index:2147482000;background:#fff7d6;color:#6b4e00;border-bottom:2px solid #f0c000;padding:10px 44px 10px 16px;font:15px/1.6 "Noto Sans Thai",system-ui,sans-serif;text-align:center;white-space:pre-line}#maintBn b{color:#161616}#maintBn a{color:inherit;text-decoration:underline;text-underline-offset:3px;white-space:normal}'
    + '#maintBn.urgent{background:#fde4e1;color:#7a1d12;border-bottom-color:#e5483a}#maintBn.ro{background:#e8f0fe;color:#1a3b73;border-bottom-color:#4f7cd6}#maintBn .cd{font-variant-numeric:tabular-nums;font-weight:700}'
    + '#maintBn .x{position:absolute;right:6px;top:50%;transform:translateY(-50%);width:40px;height:40px;border:0;background:none;color:inherit;font-size:22px;line-height:1;cursor:pointer;border-radius:50%}'
    + '#maintOv .mu i{font-style:normal;font-size:.875rem}#maintOv .mnote{font-size:.9rem;color:#4a4a52;background:#f1f1f3;border-radius:12px;padding:10px 14px;max-width:30em}#maintOv .ml.sm{font-size:.8125rem;min-height:40px}'
    + (/^\/admin(\/|$)/.test(location.pathname) ? '' : '@media(prefers-color-scheme:dark){#maintOv{background:#0e0e10;color:#ececef}#maintOv .mm,#maintOv .ml{color:#a1a1aa}#maintOv .mu,#maintOv .mnote{background:#232326;color:#a1a1aa}#maintOv .mu b{color:#ececef}#maintOv .mb{background:#e4e4e7;color:#18181b}#maintOv .mb:hover{background:#fff}#maintOv .mart{filter:invert(.9) hue-rotate(180deg)}#maintOv .mc>.mlogo{animation:none;filter:invert(1)}#maintBn{background:#3a2f10;color:#fcd34d;border-bottom-color:#7a5b00}#maintBn b{color:#fff}}');
  var st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
  var ART = '<svg class="mart" viewBox="0 0 320 220" role="img" aria-label="กำลังปิดปรับปรุงระบบ" xmlns="http://www.w3.org/2000/svg">'
    + '<ellipse class="msh" cx="160" cy="196" rx="112" ry="12" fill="#18181b" opacity=".07"/><g class="mbed">'
    + '<rect x="58" y="132" width="5" height="50" rx="2.5" fill="#18181b"/><rect x="258" y="132" width="5" height="50" rx="2.5" fill="#18181b"/><rect x="156" y="150" width="5" height="40" rx="2.5" fill="#18181b"/>'
    + '<path d="M52 112 L160 70 L268 112 L268 150 Q160 196 52 150 Z" fill="#5a4fd1"/>'
    + '<path d="M52 112 L160 70 L268 112 L160 158 Z" fill="#8c84ea"/>'
    + '<path d="M196 92 L254 112 L226 124 L170 104 Z" fill="#e6e3fd"/>'
    + '<ellipse cx="205" cy="104" rx="26" ry="9" fill="#cfcaf8" transform="rotate(20 205 104)"/>'
    + '<circle cx="196" cy="100" r="13" fill="#fff"/>'
    + '<path d="M184 96 Q196 70 214 92 Q206 100 196 100 Z" fill="#ef4444"/><circle cx="214" cy="92" r="4" fill="#fff"/>'
    + '<path d="M190 102 q4 3 8 0" stroke="#18181b" stroke-width="1.6" fill="none" stroke-linecap="round"/>'
    + '<path d="M72 120 L196 112 L240 128 L160 168 L84 140 Z" fill="#a39bf0" opacity=".9"/>'
    + '<path d="M96 126 Q150 112 214 124" stroke="#fff" stroke-width="1.5" fill="none" opacity=".7"/>'
    + '</g><text class="z z1" x="214" y="62" font-size="22" font-weight="600" fill="#18181b">z</text><text class="z z2" x="234" y="44" font-size="28" font-weight="600" fill="#18181b">Z</text><text class="z z3" x="258" y="30" font-size="34" font-weight="600" fill="#18181b">Z</text></svg>';
  var wasActive = false, last = null, offset = 0, fromWrite = false, dirty = false, allowed = null, tickT = 0;
  document.addEventListener('input', function (e) { var t = e.target; if (t && t.closest && !t.closest('#maintOv') && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) dirty = true; }, true);
  var pad = function (n) { return n < 10 ? '0' + n : '' + n; };
  var dur = function (ms) { var t = Math.max(0, Math.ceil(ms / 1000)), d = Math.floor(t / 86400), h = Math.floor(t % 86400 / 3600), m = Math.floor(t % 3600 / 60), sec = t % 60;
    return d ? d + ' วัน ' + h + ' ชม.' : h ? h + ' ชม. ' + pad(m) + ' นาที' : pad(m) + ':' + pad(sec) + ' นาที'; };
  var nowMs = function () { return Date.now() + offset; };
  var msgFor = function (d) { return (d.messages && d.messages[sys]) || d.message || ''; };
  function overlay(d) {
    var el = document.getElementById('maintOv');
    if (!el) {
      el = document.createElement('div'); el.id = 'maintOv'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-labelledby', 'maintT');
      document.body.appendChild(el); document.documentElement.style.overflow = 'hidden';
      Array.prototype.forEach.call(document.body.children, function (c) { if (c !== el && c.tagName !== 'SCRIPT' && c.tagName !== 'STYLE') { c.setAttribute('inert', ''); c.setAttribute('aria-hidden', 'true'); } });
    }
    el.innerHTML = '<div class="mc">' + ART + '<h1 id="maintT">ปิดปรับปรุงระบบชั่วคราว</h1><div class="mm">' + esc(msgFor(d)) + '</div>'
      + (fromWrite ? '<div class="mnote">ข้อมูลที่คุณกรอกไว้ในหน้านี้ยังอยู่ ไม่ได้ถูกบันทึก เมื่อระบบเปิดอีกครั้งหน้านี้จะกลับมาให้บันทึกต่อได้ทันที</div>' : '')
      + (d.until ? '<div class="mu"><span>คาดว่าจะเปิดใช้งานอีกครั้ง</span><b>' + esc(when(d.until)) + '</b><i class="cd" id="maintCd"></i></div>' : '')
      + '<div class="mact"><button type="button" class="mb" id="maintRe">ตรวจสอบอีกครั้ง</button></div><a class="ml sm" href="/admin/">สำหรับผู้ดูแลระบบ</a>'
      + '<img class="mlogo" src="/assets/logo-english-education.png" alt="English Education"></div>';
    document.getElementById('maintRe').onclick = function () { var b = this; b.disabled = true; b.textContent = 'กำลังตรวจสอบ…'; check(true, function () { b.disabled = false; b.textContent = 'ตรวจสอบอีกครั้ง'; }); };
  }
  function clearOverlay() {
    var el = document.getElementById('maintOv'); if (!el) return; el.remove(); document.documentElement.style.overflow = '';
    Array.prototype.forEach.call(document.body.children, function (c) { c.removeAttribute('inert'); c.removeAttribute('aria-hidden'); });
  }
  function banner(html, cls, key) {
    var el = document.getElementById('maintBn');
    if (!html) { if (el) el.remove(); return; }
    if (!el) { el = document.createElement('div'); el.id = 'maintBn'; el.setAttribute('role', 'status'); document.body.insertBefore(el, document.body.firstChild); }
    el.className = cls || ''; el.innerHTML = html + (key ? '<button type="button" class="x" aria-label="ปิดประกาศนี้">×</button>' : '');
    var x = el.querySelector('.x'); if (x) x.onclick = function () { try { sessionStorage.setItem('maintDismiss', key); } catch (e) { /* ignore */ } el.remove(); };
  }
  var dismissed = function (key) { try { return sessionStorage.getItem('maintDismiss') === key; } catch (e) { return false; } };
  var ics = function (d) {
    var f = function (ms) { return new Date(ms).toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z'); };
    var t = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//English Camp//Maintenance//TH', 'BEGIN:VEVENT', 'UID:maint-' + d.from + '@engedlru', 'DTSTAMP:' + f(Date.now()), 'DTSTART:' + f(d.from), 'DTEND:' + f(d.until || d.from + 3600e3), 'SUMMARY:ระบบค่ายภาษาอังกฤษปิดปรับปรุง', 'DESCRIPTION:' + String(msgFor(d)).replace(/\r?\n/g, '\\n'), 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
    return 'data:text/calendar;charset=utf-8,' + encodeURIComponent(t);
  };
  // text of the heads-up for a planned closure; the last 15 minutes get a countdown and cannot be dismissed
  function notice(d) {
    var left = d.from - nowMs(), urgent = left <= 15 * 60e3, key = 'n' + d.from;
    if (!urgent && dismissed(key)) return banner('');
    var ro = d.mode === 'readonly';
    var head = urgent ? '<b>' + (ro ? 'ระบบจะเปิดให้ดูอย่างเดียว' : 'ระบบจะปิดปรับปรุง') + 'ในอีก <span class="cd" id="maintLeft">' + dur(left) + '</span></b>\n' + (ro ? 'กรุณาบันทึกข้อมูลที่แก้ไขให้เรียบร้อยก่อนถึงเวลา' : 'กรุณาบันทึกข้อมูลที่กรอกให้เรียบร้อยก่อนถึงเวลา')
      : '<b>แจ้งล่วงหน้า: ' + (ro ? 'ระบบจะเปิดให้ดูอย่างเดียว' : 'ระบบจะปิดปรับปรุง') + '</b> ' + esc(when(d.from)) + (d.until ? ' ถึง ' + esc(when(d.until)) : '') + ' <span class="mute">(อีก <span class="cd" id="maintLeft">' + dur(left) + '</span>)</span>';
    var txt = d.notice || msgFor(d);
    banner(head + (txt ? '\n' + esc(txt) : '') + (urgent ? '' : '\n<a href="' + esc(ics(d)) + '" download="maintenance.ics">เพิ่มลงปฏิทิน</a>'), urgent ? 'urgent' : '', urgent ? '' : key);
  }
  function apply(d) {
    last = d; if (d.now) offset = d.now - Date.now();
    var active = d.state === 'active', upcoming = d.state === 'upcoming', inScope = (d.scope || []).indexOf(sys) >= 0, ro = d.mode === 'readonly';
    if (wasActive && !active && !admin) { fromWrite = false; var canReload = !dirty; clearOverlay(); wasActive = false; if (canReload) { location.reload(); return; } }   // the window ended: open the page again (never when the person has typed something)
    wasActive = active && !admin;
    if (admin) {
      banner(active ? '<b>' + (ro ? 'อยู่ในโหมดดูอย่างเดียว' : 'ปิดปรับปรุงระบบอยู่') + '</b> · นักศึกษา / เจ้าหน้าที่' + (ro ? 'บันทึกข้อมูลไม่ได้' : 'ใช้งานไม่ได้') + ' (แอดมินใช้ได้ปกติ)' + (d.until ? ' · คาดว่าเปิด ' + esc(when(d.until)) : '') + ' · <a href="/admin/hr/maintenance">ตั้งค่า</a>'
        : upcoming ? '<b>กำหนดปิดปรับปรุงระบบ</b> ' + esc(when(d.from)) + (d.until ? ' ถึง ' + esc(when(d.until)) : '') + ' · <a href="/admin/hr/maintenance">ตั้งค่า</a>' : '');
      return;
    }
    if (active && !home && inScope) {
      if (allowed === null && hasToken()) { askAllowed(function () { apply(last); }); return; }
      if (allowed) { clearOverlay(); banner('<b>ระบบอยู่ระหว่างปิดปรับปรุง</b> · บัญชีของคุณอยู่ในรายชื่อที่ใช้งานต่อได้', 'ro'); return; }
      if (ro) { clearOverlay(); banner('<b>ระบบเปิดให้ดูอย่างเดียวชั่วคราว</b> · บันทึกข้อมูลไม่ได้ในขณะนี้\n' + esc(msgFor(d)) + (d.until ? '\nคาดว่าจะใช้งานได้ตามปกติ ' + esc(when(d.until)) : ''), 'ro'); return; }
      banner(''); overlay(d); return;
    }
    clearOverlay();
    if (active && home) banner('<b>ปิดปรับปรุงระบบ</b>\n' + esc(d.message) + (d.until ? '\nคาดว่าจะเปิดใช้งานอีกครั้ง ' + esc(when(d.until)) : ''));
    else if (upcoming && (home || inScope)) notice(d);
    else banner('');
  }
  function hasToken() { try { var x = JSON.parse(localStorage.getItem('camps.session.v1') || 'null'); return !!(x && x.at); } catch (e) { return false; } }
  function askAllowed(done) {
    var t = ''; try { t = JSON.parse(localStorage.getItem('camps.session.v1')).at; } catch (e) { /* ignore */ }
    fetch(API + '/camps/maintenance/me', { headers: { Authorization: 'Bearer ' + t }, cache: 'no-store' }).then(function (r) { return r.ok ? r.json() : { allowed: false }; }).then(function (j) { allowed = !!j.allowed; }, function () { allowed = false; }).then(done);
  }
  // once a second: the countdowns, and the moment a closure starts or ends is picked up without waiting for the next poll
  function tick() {
    if (!last) return;
    var left = last.from - nowMs(), el = document.getElementById('maintLeft'), cd = document.getElementById('maintCd');
    if (last.state === 'upcoming') {
      if (left <= 0) { check(true); return; }
      if (el) el.textContent = dur(left);
      if (left <= 15 * 60e3 && !document.getElementById('maintBn').classList.contains('urgent')) apply(last);
    }
    if (last.state === 'active' && last.until) { if (nowMs() >= last.until) { check(true); return; } if (cd) cd.textContent = '(อีก ' + dur(last.until - nowMs()) + ')'; }
  }
  var busy = false;
  function check(manual, done) {
    if (busy) { if (done) done(); return; } busy = true;
    fetch(API + '/camps/maintenance', manual ? { cache: 'no-store' } : undefined).then(function (r) { if (!r.ok) throw new Error('http'); return r.json(); }).then(apply).catch(function () { /* fail open */ }).then(function () { busy = false; if (done) done(); });
  }
  // a save refused with MAINTENANCE: the page learns about it at once (and keeps what the person typed)
  var rawFetch = window.fetch;
  if (rawFetch) window.fetch = function () {
    return rawFetch.apply(this, arguments).then(function (r) {
      if (r && r.status === 503 && !admin) { try { r.clone().json().then(function (j) { if (j && j.code === 'MAINTENANCE') { fromWrite = true; allowed = null; check(true); } }, function () { /* ignore */ }); } catch (e) { /* ignore */ } }
      return r;
    });
  };
  check(); setInterval(check, 60000); tickT = setInterval(tick, 1000);
})();
