// Shared site footer for every Camps page except /budget/ and /admin/ (the admin keeps a plain line). Plain script, no dependencies.
// Replaces any <footer> already in the page, then appends the new one to the page shell (or the body).
(function () {
  if (document.getElementById('siteFoot')) return;
  var css = '#siteFoot{margin:48px 0 0;max-width:none;width:100%;padding:0;text-align:left;background:var(--soft,#f1f1f3);color:var(--ink,#18181b);font-family:"Noto Sans Thai",Inter,system-ui,sans-serif;border-top:1px solid var(--line,#e4e4e7)}'
    + '#siteFoot a{color:inherit;text-decoration:none}'
    + '#siteFoot .sf-in{max-width:1040px;margin:0 auto;padding:28px 24px 8px;display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:16px 32px}'
    + '#siteFoot .sf-brand{display:flex;align-items:center;gap:14px;min-width:0}#siteFoot .sf-brand img{height:36px;width:auto;display:block;flex:none}'
    + '#siteFoot .sf-brand p{margin:0;color:var(--mute,#5f5f68);font-size:.875rem;line-height:1.55;max-width:24em}'
    + '#siteFoot .sf-links{display:flex;flex-wrap:wrap;gap:2px 18px}#siteFoot .sf-links a{display:inline-flex;align-items:center;min-height:40px;color:var(--ink,#18181b);font-size:.875rem;text-decoration:underline;text-underline-offset:3px}'
    + '#siteFoot .sf-legal{max-width:1040px;margin:0 auto;padding:4px 24px calc(env(safe-area-inset-bottom,0px) + 24px);font-size:.8125rem;line-height:1.7;color:#4a4a52}#siteFoot .sf-legal p{margin:0}'
    + '@media(max-width:600px){#siteFoot .sf-brand{flex-wrap:wrap}}'
    + '@media(prefers-color-scheme:dark){#siteFoot .sf-legal{color:var(--mute,#a1a1aa)}#siteFoot .sf-brand img{filter:invert(1)}}'
    + '@media print{#siteFoot{display:none!important}}';
  var st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
  var f = document.createElement('footer');
  f.id = 'siteFoot';
  f.innerHTML = '<div class="sf-in"><a class="sf-brand" href="/" aria-label="English Camp On Tour"><img src="/assets/logo-english-education.png" alt="English Education · Faculty of Education"><p>ระบบสารสนเทศของค่ายภาษาอังกฤษ คณะครุศาสตร์ ครั้งที่ 9</p></a>'
    + '<nav class="sf-links" aria-label="เอกสารและนโยบาย"><a href="/legal/terms">ข้อกำหนดการใช้งาน</a><a href="/legal/privacy">นโยบายความเป็นส่วนตัว</a><a href="/legal/third-party">บริการของบุคคลที่สาม</a></nav></div>'
    + '<div class="sf-legal"><p>&copy; 2026&ndash;2027 sorasukt.com. Powered by STNET World Solutions.<br>The logo and name of English Education are owned by the English Education Program, Faculty of Education, Loei Rajabhat University.</p></div>';
  Array.prototype.forEach.call(document.querySelectorAll('footer'), function (o) { o.parentNode.removeChild(o); });
  (document.querySelector('.shell') || document.body).appendChild(f);
})();
