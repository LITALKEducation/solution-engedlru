// Shared site footer for every Camps page except /budget/ and /admin/ (the admin keeps a plain line). Plain script, no dependencies.
// Replaces any <footer> already in the page, then appends the new one to the page shell (or the body).
(function () {
  if (document.getElementById('siteFoot')) return;
  var css = '#siteFoot{margin:56px 0 0;max-width:none;width:100%;padding:0;text-align:left;background:#f1f1f3;color:#18181b;font-family:"Noto Sans Thai",Inter,system-ui,sans-serif;position:relative;overflow:hidden}'
    + '#siteFoot a{color:inherit;text-decoration:none}#siteFoot,#siteFoot a{text-decoration-line:none}'
    + '#siteFoot .sf-in{max-width:1120px;margin:0 auto;padding:48px 24px 0;display:grid;gap:36px;grid-template-columns:minmax(0,1fr)}'
    + '#siteFoot .sf-brand img{height:44px;width:auto;display:block}'
    + '#siteFoot .sf-brand p{margin:14px 0 0;max-width:22em;color:#5f5f68;font-size:.9375rem;line-height:1.6}'
    + '#siteFoot nav{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:28px 20px}'
    + '#siteFoot h2{margin:0 0 12px;font-size:.9375rem;font-weight:600;line-height:1.4;letter-spacing:0;text-transform:none;color:#18181b}'
    + '#siteFoot ul{list-style:none;margin:0;padding:0;display:grid;gap:4px}'
    + '#siteFoot li a{display:inline-flex;align-items:center;min-height:36px;color:#5f5f68;font-size:.9375rem;transition:color .2s}'
    + '#siteFoot li a:hover{color:#18181b;text-decoration:underline;text-underline-offset:3px}'
    + '#siteFoot .sf-legal{max-width:1120px;margin:0 auto;padding:36px 24px 28px;font-size:.8125rem;line-height:1.7;color:#4a4a52;text-align:center}'
    + '#siteFoot .sf-legal p{margin:0}'
    + '#siteFoot .sf-photo{position:relative;height:clamp(200px,34vw,340px);background:#cfd8dc url(/assets/hero-hills.jpg) center 62%/cover no-repeat}'
    + '#siteFoot .sf-photo::before{content:"";position:absolute;inset:0;background:linear-gradient(180deg,#f1f1f3 0%,rgba(241,241,243,.55) 28%,rgba(241,241,243,0) 60%)}'
    + '#siteFoot .sf-mark{position:absolute;left:50%;bottom:-6%;transform:translateX(-50%);width:min(86vw,640px);height:auto;opacity:.92;filter:drop-shadow(0 6px 30px rgba(0,0,0,.25));pointer-events:none}'
    + '@media(min-width:860px){#siteFoot .sf-in{grid-template-columns:minmax(0,1fr) minmax(0,1.5fr);align-items:start}#siteFoot nav{grid-template-columns:repeat(3,minmax(0,1fr))}}'
    + '@media(max-width:600px){#siteFoot .sf-mark{display:none}#siteFoot .sf-photo{height:180px}}'
    + '@media print{#siteFoot{display:none!important}}';
  var st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
  var COLS = [
    ['นักศึกษา', [['/hr/', 'ข้อมูลส่วนตัว'], ['/hr/aka', 'ตั้งชื่อ AKA'], ['/shirt/', 'แบบเสื้อค่าย']]],
    ['เจ้าหน้าที่', [['/lotto/', 'จับสลาก'], ['/qrcheck/', 'เช็ก QR']]],
    ['การเงิน', [['/budget/', 'งบประมาณ']]]
  ];
  var nav = COLS.map(function (c) {
    return '<div><h2>' + c[0] + '</h2><ul>' + c[1].map(function (l) { return '<li><a href="' + l[0] + '">' + l[1] + '</a></li>'; }).join('') + '</ul></div>';
  }).join('');
  var f = document.createElement('footer');
  f.id = 'siteFoot';
  f.innerHTML = '<div class="sf-in"><div class="sf-brand"><a href="/" aria-label="English Camp On Tour"><img src="/assets/logo-english-education.png" alt="English Education · Faculty of Education"></a>'
    + '<p>ระบบสารสนเทศของค่ายภาษาอังกฤษ คณะครุศาสตร์ ครั้งที่ 9</p></div><nav aria-label="ลิงก์ท้ายหน้า">' + nav + '</nav></div>'
    + '<div class="sf-legal"><p>&copy; 2026&ndash;2027 sorasukt.com.<br>Powered by STNET World Solutions.<br>The logo and name of English Education are owned by the English Education Program, Faculty of Education, Loei Rajabhat University.</p></div>'
    + '<div class="sf-photo" aria-hidden="true"><img class="sf-mark" src="/assets/english-camp-logo.png" alt="" width="1000" height="399" loading="lazy"></div>';
  Array.prototype.forEach.call(document.querySelectorAll('footer'), function (o) { o.parentNode.removeChild(o); });
  (document.querySelector('.shell') || document.body).appendChild(f);
})();
