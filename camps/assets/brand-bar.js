// Brand menu shown at the top of every camps page (not the budget app): logo + links to each system.
// Plain script, no dependencies. Adds class "has-bar" to <body> so a page can hide its own back link.
(function () {
  if (document.getElementById('brandBar')) return;
  var LINKS = [['/hr/', 'เลือกฝ่าย'], ['/aka/', 'ตั้งชื่อ AKA'], ['/lotto/', 'จับสลาก'], ['/qrcheck/', 'เช็ก QR'], ['/budget/', 'งบประมาณ'], ['/admin/', 'แอดมิน']];
  var css = '#brandBar{position:sticky;top:0;z-index:40;background:#fff;border-bottom:1px solid #efe6e5;font-family:"Noto Sans Thai",system-ui,sans-serif}'
    + '#brandBar .bb{max-width:1200px;margin:0 auto;padding:calc(env(safe-area-inset-top,0px) + 0px) 20px 0;min-height:64px;display:flex;align-items:center;gap:14px}'
    + '#brandBar .bl{display:flex;align-items:center;gap:10px;color:#171212;text-decoration:none;font-weight:700;font-size:18px;flex:none;min-height:44px}'
    + '#brandBar .bl img{height:40px;width:auto;display:block}'
    + '#brandBar .bn{margin-left:auto;display:flex;gap:2px;align-items:center}'
    + '#brandBar .bn a{color:#171212;text-decoration:none;font-weight:600;font-size:15px;padding:0 14px;min-height:44px;display:inline-flex;align-items:center;border-radius:10px;white-space:nowrap}'
    + '#brandBar .bn a:hover{background:#faf3f2}'
    + '#brandBar .bn a[aria-current]{color:#b71c1c;background:#fde8e8}'
    + '#brandBar .bm{display:none;margin-left:auto;min-height:44px;padding:0 16px;border:1px solid #efe6e5;border-radius:10px;background:#fff;font:inherit;font-weight:600;font-size:15px;color:#171212;cursor:pointer}'
    + '@media(max-width:719px){#brandBar .bm{display:inline-flex;align-items:center}#brandBar .bn{display:none;position:absolute;left:0;right:0;top:100%;background:#fff;border-bottom:1px solid #efe6e5;flex-direction:column;align-items:stretch;padding:8px 20px 14px;box-shadow:0 12px 24px #17121214}#brandBar .bn.open{display:flex}#brandBar .bn a{padding:0 12px;font-size:16px}}'
    + 'body.has-bar .back{display:none}body.has-bar .hero .herotop{justify-content:flex-end}'
    + 'body.has-bar .home .logo{display:none}';
  var st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
  var path = location.pathname.replace(/\/+$/, '') + '/';
  var items = LINKS.map(function (l) {
    var on = path === l[0] || path.indexOf(l[0]) === 0;
    return '<a href="' + l[0] + '"' + (on ? ' aria-current="page"' : '') + '>' + l[1] + '</a>';
  }).join('');
  var bar = document.createElement('nav');
  bar.setAttribute('aria-label', 'เมนูหลัก');
  bar.id = 'brandBar';
  bar.innerHTML = '<div class="bb"><a class="bl" href="/"><img src="/assets/logo-english-education.png" alt="English Education Faculty of Education"></a>'
    + '<button class="bm" type="button" aria-expanded="false" aria-controls="brandNav">เมนู</button>'
    + '<div id="brandNav" class="bn">' + items + '</div></div>';
  var skip = document.querySelector('.skip');
  document.body.insertBefore(bar, skip ? skip.nextSibling : document.body.firstChild);
  document.body.classList.add('has-bar');
  var btn = bar.querySelector('.bm'), nav = bar.querySelector('.bn');
  btn.addEventListener('click', function () { var o = nav.classList.toggle('open'); btn.setAttribute('aria-expanded', o ? 'true' : 'false'); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && nav.classList.contains('open')) { nav.classList.remove('open'); btn.setAttribute('aria-expanded', 'false'); btn.focus(); } });
})();
