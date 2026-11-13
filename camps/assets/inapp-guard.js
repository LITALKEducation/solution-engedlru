/* Camps · in-app browser guard.
   Pages must be opened in a real browser (Safari, Chrome, …), not inside LINE / Facebook / Instagram / … web views:
   Google refuses sign-in there ("disallowed_useragent"), location and installing the web app do not work reliably.
   Load synchronously first in <head>. If this file fails to load the page simply works as before. */
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
  if (typeof module !== 'undefined' && module.exports) module.exports = { detect: detect };
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  var standalone = false;
  try { standalone = !!(window.navigator.standalone || (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches)); } catch (e) { /* ignore */ }
  var hit = detect(window.navigator.userAgent, standalone);
  if (!hit) return;

  var url = location.href.replace(/#.*$/, '');
  var isAndroid = /Android/.test(navigator.userAgent), isLine = hit.app === 'LINE';
  var openUrl = '';
  if (isLine) openUrl = url + (url.indexOf('?') >= 0 ? '&' : '?') + 'openExternalBrowser=1';             // LINE opens the page in the default browser
  else if (isAndroid) openUrl = 'intent://' + location.host + location.pathname + location.search + '#Intent;scheme=' + location.protocol.replace(':', '') + ';package=com.android.chrome;end';
  var esc = function (s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var how = isLine ? 'แตะปุ่ม <b>⋮</b> หรือ <b>แชร์</b> มุมขวาบน แล้วเลือก <b>“เปิดในเบราว์เซอร์เริ่มต้น”</b>'
    : isAndroid ? 'แตะ <b>⋮</b> มุมขวาบน แล้วเลือก <b>“เปิดใน Chrome”</b> หรือ <b>“เปิดในเบราว์เซอร์”</b>'
    : 'แตะ <b>⋯</b> หรือไอคอน <b>แชร์ / เข็มทิศ</b> แล้วเลือก <b>“เปิดใน Safari”</b> หรือ <b>“เปิดในเบราว์เซอร์”</b>';
  var html = '<!doctype html><html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="robots" content="noindex,nofollow"><title>เปิดด้วยเบราว์เซอร์</title><style>'
    + '*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;padding:20px;background:linear-gradient(160deg,#e53935,#b71c1c);font-family:"Noto Sans Thai",system-ui,-apple-system,sans-serif;color:#171212;line-height:1.55}'
    + '.c{width:min(460px,100%);background:#fff;border-radius:28px;padding:28px 24px;text-align:center;box-shadow:0 24px 70px #0005}.i{width:68px;height:68px;margin:0 auto 12px;border-radius:50%;background:#fde8e8;color:#b71c1c;display:grid;place-items:center;font-size:34px}'
    + 'h1{font-size:22px;margin:0 0 8px}p{margin:8px 0;color:#5b4f51;font-size:15px}.s{background:#faf3f2;border-radius:16px;padding:12px 14px;margin:14px 0;text-align:left;font-size:15px;color:#171212}'
    + '.u{word-break:break-all;font-size:12px;color:#82787a;background:#faf3f2;border-radius:12px;padding:8px 10px;margin:10px 0}'
    + 'button,a.b{display:block;width:100%;min-height:50px;border:0;border-radius:16px;font:inherit;font-weight:700;font-size:16px;margin-top:10px;cursor:pointer;text-decoration:none;display:flex;align-items:center;justify-content:center}'
    + '.p{background:#d32f2f;color:#fff}.g{background:#faf3f2;color:#4c3d3e}</style></head><body><div class="c" role="alert"><div class="i" aria-hidden="true">🌐</div>'
    + '<h1>กรุณาเปิดด้วยเบราว์เซอร์</h1><p>หน้านี้ใช้งานในเบราว์เซอร์ของแอป <b>' + esc(hit.app) + '</b> ไม่ได้ เพราะ Google ไม่อนุญาตให้เข้าสู่ระบบในเบราว์เซอร์ของแอป และการระบุตำแหน่งอาจทำงานไม่ถูกต้อง</p>'
    + '<div class="s">' + how + '</div>'
    + (openUrl ? '<a class="b p" id="go" href="' + esc(openUrl) + '">' + (isLine || !isAndroid ? 'เปิดด้วยเบราว์เซอร์' : 'เปิดด้วย Chrome') + '</a>' : '')
    + '<div class="u" id="u">' + esc(url) + '</div><button class="g" id="cp" type="button">คัดลอกลิงก์ แล้วนำไปวางใน Safari / Chrome</button></div>'
    + '</body></html>';
  // Swap in a brand-new <html> tree. The parser keeps appending the real page to the old (now detached) tree, and scripts that
  // are not connected to a document never run, so nothing else on the page executes (no sign-in attempt inside the web view).
  var copy = function (btn) {
    var t = url, done = function () { btn.textContent = 'คัดลอกลิงก์แล้ว ✓'; };
    var fallback = function () { var a = document.createElement('textarea'); a.value = t; document.body.appendChild(a); a.select(); try { document.execCommand('copy'); done(); } catch (e) { /* ignore */ } a.remove(); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(t).then(done, fallback); else fallback();
  };
  try {
    var parsed = new DOMParser().parseFromString(html, 'text/html');
    document.replaceChild(document.adoptNode(parsed.documentElement), document.documentElement);
    var btn = document.getElementById('cp'); if (btn) btn.onclick = function () { copy(btn); };
  } catch (e) {
    document.open(); document.write(html); document.close();   // very old browsers: fall back to replacing the whole document
    var b2 = document.getElementById('cp'); if (b2) b2.onclick = function () { copy(b2); };
  }
})();
