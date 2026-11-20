// Brand menu shown at the top of every camps page (not the budget app): logo + links to each system.
// Plain script, no dependencies. Adds class "has-bar" to <body> so a page can hide its own back link.
(function () {
  if (document.getElementById('brandBar')) return;
  var STUDENT = [['/aka/', 'ตั้งชื่อ AKA'], ['/lotto/', 'จับสลาก'], ['/qrcheck/', 'เช็ก QR'], ['/budget/', 'งบประมาณ']];
  var CTA_STUDENT = ['/student/', 'ข้อมูลส่วนตัว'];
  // the admin section has its own menu and no links into the student pages
  var ADMIN_RE = /^\/admin(\/|$)/;
  var isAdmin = ADMIN_RE.test(location.pathname.replace(/\/+$/, '') + '/') || ADMIN_RE.test(location.pathname);
  var ADMIN = [['/admin/', 'ศูนย์แอดมิน'], ['/admin/#depts', 'ฝ่ายบุคคล'], ['/admin/#lotto', 'จับสลาก'], ['/admin/#qr', 'เช็ก QR'], ['/admin/#aka', 'AKA']];
  var CTA_ADMIN = ['/', 'ออกจากแอดมิน'];
  var LINKS = isAdmin ? ADMIN : STUDENT;
  var css = '#brandBar{position:fixed;top:0;left:0;right:0;z-index:40;height:0;font-family:"Noto Sans Thai",Inter,system-ui,sans-serif}'
    + '#brandBar .bb{position:absolute;left:50%;top:calc(env(safe-area-inset-top,0px) + 12px);transform:translateX(-50%);width:min(1120px,calc(100% - 24px));min-height:60px;box-sizing:border-box;padding:6px 8px 6px 20px;display:flex;align-items:center;gap:16px;'
    + 'background:rgba(24,24,27,.9);-webkit-backdrop-filter:blur(18px) saturate(1.5);backdrop-filter:blur(18px) saturate(1.5);border:1px solid rgba(255,255,255,.22);border-radius:999px;box-shadow:0 10px 30px -12px rgba(0,0,0,.45),inset 0 1px 0 rgba(255,255,255,.12);color:#fff}'
    + '#brandBar .bl{display:flex;align-items:center;color:#fff;text-decoration:none;flex:none;min-height:44px}'
    + '#brandBar .bl img{height:30px;width:auto;display:block;filter:brightness(0) invert(1)}'
    + '#brandBar .bsep{width:1px;height:26px;background:rgba(255,255,255,.28);flex:none}'
    + '#brandBar .bn{display:flex;gap:2px;align-items:center;flex:1;min-width:0}'
    + '#brandBar .bn a{color:#fff;text-decoration:none;font-weight:500;font-size:15px;padding:0 14px;min-height:40px;display:inline-flex;align-items:center;border-radius:999px;white-space:nowrap;opacity:.92;transition:background-color .2s,opacity .2s}'
    + '#brandBar .bn a:hover{background:rgba(255,255,255,.16);opacity:1}'
    + '#brandBar .bn a[aria-current]{background:rgba(255,255,255,.2);opacity:1;font-weight:600}'
    + '#brandBar .bcta{margin-left:auto;display:inline-flex;align-items:center;justify-content:center;min-height:44px;padding:0 22px;border-radius:999px;background:#fff;color:#18181b;font-weight:600;font-size:15px;text-decoration:none;white-space:nowrap;flex:none;transition:transform .15s,background-color .2s}'
    + '#brandBar .bcta:hover{background:#ececee}#brandBar .bcta:active{transform:scale(.97)}#brandBar .bcta[aria-current]{background:#e4e4e7}'
    + '#brandBar .bm{display:none;flex:none;width:44px;height:44px;border:0;border-radius:50%;background:rgba(255,255,255,.16);color:#fff;cursor:pointer;place-items:center}'
    + '#brandBar .bm svg{width:22px;height:22px}'
    + '#brandBar .badm{background:#fff;color:#18181b;border-radius:999px;padding:3px 12px;font-weight:700;font-size:13px;flex:none}'
    + '@media(max-width:' + (isAdmin ? 999 : 719) + 'px){#brandBar .bsep{display:none}#brandBar .bcta{margin-left:auto}#brandBar .bm{display:inline-grid}'
    + '#brandBar .bn{display:none;position:absolute;left:0;right:0;top:calc(100% + 8px);flex:none;flex-direction:column;align-items:stretch;padding:10px;background:rgba(24,24,27,.95);-webkit-backdrop-filter:blur(18px);backdrop-filter:blur(18px);border:1px solid rgba(255,255,255,.2);border-radius:24px;box-shadow:0 18px 36px -14px rgba(0,0,0,.5)}'
    + '#brandBar .bn.open{display:flex}#brandBar .bn a{padding:0 16px;font-size:16px;min-height:48px}}'
    + '@media(max-width:420px){#brandBar .bb{padding-left:14px;gap:10px}#brandBar .bl img{height:26px}#brandBar .bcta{padding:0 16px}}'
    + 'body:has(.cxhero) #brandBar .bb{background:rgba(24,24,27,.5)}'
    + 'body.has-bar{padding-top:84px}body.has-bar:has(.cxhero){padding-top:0}'
    + 'body.has-bar .back{display:none}body.has-bar .hero .herotop{justify-content:flex-end}'
    + 'body.has-bar .home .logo{display:none}';
  var st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
  var path = location.pathname.replace(/\/+$/, '') + '/';
  var items = LINKS.map(function (l) {
    var on = isAdmin ? (l[0] === '/admin/' ? path === '/admin/' : l[0] === '/admin/#depts' ? path.indexOf('/admin/hr/') === 0 : l[0] !== '/' && path.indexOf(l[0]) === 0) : (path === l[0] || path.indexOf(l[0]) === 0);
    return '<a href="' + l[0] + '"' + (on ? ' aria-current="page"' : '') + '>' + l[1] + '</a>';
  }).join('');
  var bar = document.createElement('nav');
  bar.setAttribute('aria-label', 'เมนูหลัก');
  bar.id = 'brandBar';
  var CTA = isAdmin ? CTA_ADMIN : CTA_STUDENT, ctaOn = !isAdmin && (path === CTA[0] || path.indexOf(CTA[0]) === 0);
  bar.innerHTML = '<div class="bb"><a class="bl" href="' + (isAdmin ? '/admin/' : '/') + '"><img src="/assets/logo-english-education.png" alt="English Education Faculty of Education"></a>' + (isAdmin ? '<span class="badm">แอดมิน</span>' : '') + '<span class="bsep" aria-hidden="true"></span>'
    + '<div id="brandNav" class="bn">' + items + '</div>'
    + '<a class="bcta" href="' + CTA[0] + '"' + (ctaOn ? ' aria-current="page"' : '') + '>' + CTA[1] + '</a>'
    + '<button class="bm" type="button" aria-expanded="false" aria-controls="brandNav" aria-label="เมนู"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16"/></svg></button></div>';
  var skip = document.querySelector('.skip');
  document.body.insertBefore(bar, skip ? skip.nextSibling : document.body.firstChild);
  document.body.classList.add('has-bar');
  var btn = bar.querySelector('.bm'), nav = bar.querySelector('.bn');
  btn.addEventListener('click', function () { var o = nav.classList.toggle('open'); btn.setAttribute('aria-expanded', o ? 'true' : 'false'); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && nav.classList.contains('open')) { nav.classList.remove('open'); btn.setAttribute('aria-expanded', 'false'); btn.focus(); } });
})();
