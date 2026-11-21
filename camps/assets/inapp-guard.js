/* Camps · in-app browser guard.
   Pages must be opened in a real browser (Safari, Chrome, …), not inside LINE / Facebook / Instagram / … web views:
   Google refuses sign-in there ("disallowed_useragent"), location and installing the web app do not work reliably.
   Load synchronously first in <head>. If this file fails to load the page simply works as before.
   Pages that need no sign-in (home, 404, legal, the shirt gallery) set window.INAPP_PUBLIC = 1 before loading this file and are never blocked.
   A person the detection got wrong can continue in the app ("ใช้งานต่อในแอปนี้"): that is remembered for the tab (sessionStorage). */
(function () {
  'use strict';
  // returns null for a normal browser, otherwise { app: 'LINE' | 'Facebook' | ... }
  function detect(ua, standalone) {
    ua = String(ua || '');
    if (standalone) return null;   // installed web app (iOS home-screen apps have no "Safari" token in the user agent)
    var named = [
      ['LINE', /\bLine\//i], ['Facebook', /FBAN|FBAV|FB_IAB|FBIOS/i], ['Messenger', /Messenger|FBAN\/Messenger/i], ['Instagram', /Instagram/i],
      ['TikTok', /TikTok|musical_ly|Bytedance/i], ['WeChat', /MicroMessenger|WeChat/i], ['X (Twitter)', /Twitter/i], ['Snapchat', /Snapchat/i],
      ['KakaoTalk', /KAKAOTALK/i], ['Naver', /NAVER\(inapp/i], ['Pinterest', /Pinterest/i], ['LinkedIn', /LinkedInApp/i], ['Slack', /Slack/i],
      ['Google app', /\bGSA\//]
    ];
    for (var i = 0; i < named.length; i++) if (named[i][1].test(ua)) return { app: named[i][0] };
    var ios = /iPhone|iPad|iPod/.test(ua);
    if (ios && !/Safari\//.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS|DuckDuckGo/.test(ua)) return { app: 'แอป' };   // iOS web view
    if (/Android/.test(ua) && /; wv\)/.test(ua)) return { app: 'แอป' };                                           // Android WebView
    return null;
  }
  // the address to hand over to a real browser: no fragment, and never a one-time sign-in answer (code / state / error) that would be useless there
  function cleanUrl(href) {
    var u;
    try { u = new URL(href); } catch (e) { return String(href).replace(/#.*$/, ''); }
    ['code', 'state', 'error', 'error_description', 'openExternalBrowser'].forEach(function (k) { u.searchParams.delete(k); });
    u.hash = '';
    return u.toString();
  }
  var NAMES = [[/^\/student(\/|$)/, 'ข้อมูลนักศึกษา'], [/^\/lotto(\/|$)/, 'จับสลาก'], [/^\/qrcheck(\/|$)/, 'เช็ก QR'], [/^\/budget(\/|$)/, 'งบประมาณ'], [/^\/admin(\/|$)/, 'แอดมิน'], [/^\/aka(\/|$)/, 'ตั้งชื่อ AKA']];
  function pageName(path) { for (var i = 0; i < NAMES.length; i++) if (NAMES[i][0].test(path)) return NAMES[i][1]; return 'ระบบสารสนเทศค่ายภาษาอังกฤษ'; }
  if (typeof module !== 'undefined' && module.exports) module.exports = { detect: detect, cleanUrl: cleanUrl, pageName: pageName };
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  // LINE's "open in the default browser" flag stays out of the address bar
  try { var cu = new URL(location.href); if (cu.searchParams.has('openExternalBrowser')) { cu.searchParams.delete('openExternalBrowser'); history.replaceState(null, '', cu.pathname + cu.search + cu.hash); } } catch (e) { /* ignore */ }
  if (window.INAPP_PUBLIC) return;   // nothing here needs a Google sign-in
  try { if (sessionStorage.getItem('inappOK') === '1') return; } catch (e) { /* ignore */ }
  var standalone = false;
  try { standalone = !!(window.navigator.standalone || (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches)); } catch (e) { /* ignore */ }
  var hit = detect(window.navigator.userAgent, standalone);
  if (!hit) return;

  var url = cleanUrl(location.href), U = new URL(url);
  var ua = navigator.userAgent, isAndroid = /Android/.test(ua), isIos = /iPhone|iPad|iPod/.test(ua), isLine = hit.app === 'LINE';
  var openUrl = '', openLabel = '';
  if (isLine) { openUrl = url + (url.indexOf('?') >= 0 ? '&' : '?') + 'openExternalBrowser=1'; openLabel = 'เปิดด้วยเบราว์เซอร์'; }   // LINE opens the page in the default browser
  else if (isAndroid) { openUrl = 'intent://' + U.host + U.pathname + U.search + '#Intent;scheme=' + U.protocol.replace(':', '') + ';action=android.intent.action.VIEW;category=android.intent.category.BROWSABLE;end'; openLabel = 'เปิดด้วยเบราว์เซอร์'; }   // no fixed package: any installed browser (Chrome, Samsung Internet, …) works
  var safariUrl = isIos && !isLine ? 'x-safari-' + url : '';   // a few in-app browsers honour this; the copy button is the sure way
  var esc = function (s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var glyph = isIos && !isLine ? '⋯' : '⋮';
  var s1 = isLine ? 'แตะ <b>⋮</b> หรือไอคอน <b>แชร์</b> มุมขวาบน' : isAndroid ? 'แตะ <b>⋮</b> มุมขวาบน' : 'แตะ <b>⋯</b> หรือไอคอน <b>แชร์ / เข็มทิศ</b>';
  var s2 = isLine ? 'เลือก <b>“เปิดในเบราว์เซอร์เริ่มต้น”</b>' : isAndroid ? 'เลือก <b>“เปิดใน Chrome”</b> หรือ <b>“เปิดในเบราว์เซอร์”</b>' : 'เลือก <b>“เปิดใน Safari”</b> หรือ <b>“เปิดในเบราว์เซอร์”</b>';
  var name = pageName(location.pathname), app = esc(hit.app);
  var html = '<!doctype html><html lang="th"><head><meta charset="utf-8"><meta name="color-scheme" content="light dark"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="robots" content="noindex,nofollow"><title>เปิดด้วยเบราว์เซอร์ · Camps</title><link rel="stylesheet" href="/assets/fonts/fonts.css"><style>'
    + '*{box-sizing:border-box}body{margin:0;min-height:100vh;padding:calc(env(safe-area-inset-top,0px) + 28px) 24px 32px;background:#fff;font-family:"Inter","Noto Sans Thai",system-ui,-apple-system,sans-serif;color:#171717;line-height:1.65;-webkit-font-smoothing:antialiased}'
    + '.w{width:min(440px,100%);margin:0 auto}.hd{display:flex;align-items:center;gap:12px;margin:0 0 28px}.hd img{height:36px;width:auto;display:block}.hd span{font-size:12px;color:#6b6b6b;line-height:1.45}'
    + 'h1{font-size:26px;font-weight:600;line-height:1.4;margin:0 0 8px}p{margin:8px 0;color:#6b6b6b;font-size:15px}b{font-weight:600;color:#171717}'
    + '.bar{display:flex;align-items:center;justify-content:space-between;gap:10px;margin:22px 0 6px;padding:8px 10px 8px 16px;border:1px solid #e8e8e8;border-radius:999px;background:#fafafa}.bar i{font-style:normal;font-size:13px;color:#8a8a8a;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}'
    + '.dot{flex:none;width:40px;height:40px;border-radius:50%;display:grid;place-items:center;font-size:22px;font-weight:700;background:#171717;color:#fff;animation:pulse 1.6s ease-in-out infinite}@keyframes pulse{0%,100%{box-shadow:0 0 0 0 rgba(23,23,23,.35)}50%{box-shadow:0 0 0 9px rgba(23,23,23,0)}}'
    + '.ptr{text-align:right;font-size:13px;color:#6b6b6b;margin:0 4px 10px}.ptr::before{content:"↑ "}'
    + 'ol{list-style:none;counter-reset:s;margin:0 0 18px;padding:0;display:grid;gap:10px}li{counter-increment:s;display:flex;gap:12px;align-items:flex-start;font-size:15px;color:#171717}li::before{content:counter(s);flex:none;width:26px;height:26px;border-radius:50%;background:#171717;color:#fff;display:grid;place-items:center;font-size:13px;font-weight:600}'
    + 'button,a.b{width:100%;min-height:50px;border:1px solid #d4d4d4;border-radius:10px;font:inherit;font-weight:500;font-size:16px;margin-top:10px;cursor:pointer;text-decoration:none;display:flex;align-items:center;justify-content:center;text-align:center;padding:0 14px}'
    + '.p{background:#171717;color:#fff;border-color:#171717}.g{background:#fff;color:#171717}.u{word-break:break-all;font-size:12px;color:#6b6b6b;background:#fafafa;border:1px solid #e8e8e8;border-radius:8px;padding:8px 10px;margin:14px 0 0}'
    + '.or{margin:18px 0 8px;font-size:13px;color:#8a8a8a}.en{font-size:13px;color:#8a8a8a;margin:20px 0 0}.sk{display:block;margin:22px auto 0;background:none;border:0;color:#6b6b6b;font-size:13px;text-decoration:underline;width:auto;min-height:44px;font-weight:400}.ok{font-size:14px;color:#166534;margin:10px 0 0;min-height:1.6em}'
    + '@media(prefers-color-scheme:dark){body{background:#0e0e10;color:#ececef}.hd img{filter:invert(1)}.hd span,p,.ptr,.or,.en,.sk,.u{color:#a1a1aa}b,li{color:#ececef}.bar{background:#161616;border-color:#2d2d31}.bar i{color:#7d7d86}.dot{background:#ececef;color:#18181b;animation:none}li::before{background:#ececef;color:#18181b}button,a.b{border-color:#3a3a3e}.p{background:#e4e4e7;color:#18181b;border-color:#e4e4e7}.g{background:#161616;color:#ececef}.u{background:#161616;border-color:#2d2d31}.ok{color:#5eead4}}'
    + '@media(prefers-reduced-motion:reduce){.dot{animation:none}}</style></head><body><div class="w">'
    + '<div class="hd"><img src="/assets/logo-english-education.png" alt="English Education"><span>ระบบสารสนเทศของค่ายภาษาอังกฤษ<br>คณะครุศาสตร์ ครั้งที่ 9</span></div>'
    + '<div role="alert"><h1>เปิดด้วยเบราว์เซอร์ก่อนนะ</h1><p>หน้า <b>' + esc(name) + '</b> ต้องเข้าสู่ระบบด้วย Google ซึ่งทำในแอป <b>' + app + '</b> ไม่ได้ (Google ไม่อนุญาต) เปิดด้วยเบราว์เซอร์ของเครื่องแล้วใช้งานต่อได้ทันที</p></div>'
    + (openUrl ? '<a class="b p" id="go" href="' + esc(openUrl) + '">' + openLabel + '</a><div class="or">หรือทำเอง</div>' : '')
    + '<div class="bar" aria-hidden="true"><i>' + esc(U.host) + '</i><span class="dot">' + glyph + '</span></div><div class="ptr">ปุ่มนี้อยู่มุมขวาบนของแอป</div>'
    + '<ol><li><span>' + s1 + '</span></li><li><span>' + s2 + '</span></li></ol>'
    + (openUrl ? '' : '<div class="or">หรือคัดลอกลิงก์ไปวางเอง</div>')
    + '<button class="' + (openUrl ? 'g' : 'p') + '" id="cp" type="button">คัดลอกลิงก์ แล้วไปวางใน Safari / Chrome</button><div class="ok" id="ok" role="status"></div>'
    + (safariUrl ? '<a class="b g" id="sf" href="' + esc(safariUrl) + '">ลองเปิดใน Safari</a>' : '')
    + '<div class="u" id="u">' + esc(url) + '</div>'
    + '<p class="en">Please open this page in your phone’s browser (Safari or Chrome). Google sign-in does not work inside ' + app + '.</p>'
    + '<button class="sk" id="skip" type="button">ใช้งานต่อในแอปนี้ (อาจเข้าสู่ระบบไม่ได้)</button></div></body></html>';
  // Swap in a brand-new <html> tree. The parser keeps appending the real page to the old (now detached) tree, and scripts that
  // are not connected to a document never run, so nothing else on the page executes (no sign-in attempt inside the web view).
  var copy = function (btn) {
    var t = url, done = function () { btn.textContent = 'คัดลอกลิงก์แล้ว ✓'; var o = document.getElementById('ok'); if (o) o.textContent = 'เปิด Safari หรือ Chrome แล้ววางลิงก์ที่ช่องที่อยู่เว็บ'; };
    var fallback = function () { var a = document.createElement('textarea'); a.value = t; document.body.appendChild(a); a.select(); try { document.execCommand('copy'); done(); } catch (e) { /* ignore */ } a.remove(); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(t).then(done, fallback); else fallback();
  };
  var wire = function () {
    var b = document.getElementById('cp'); if (b) b.onclick = function () { copy(b); };
    var sk = document.getElementById('skip'); if (sk) sk.onclick = function () { try { sessionStorage.setItem('inappOK', '1'); } catch (e) { /* ignore */ } location.reload(); };
  };
  try {
    var parsed = new DOMParser().parseFromString(html, 'text/html');
    document.replaceChild(document.adoptNode(parsed.documentElement), document.documentElement);
    wire();
  } catch (e) {
    document.open(); document.write(html); document.close();   // very old browsers: fall back to replacing the whole document
    wire();
  }
})();
