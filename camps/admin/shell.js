// Admin shell: wraps every /admin/ page in the dashboard layout (sidebar menu, top bar, grey canvas). The page's own markup and script stay
// as they are: this moves the page title and the account chip into the top bar, hides the old red header and keeps everything else in <main>.
(() => {
'use strict';
const I = (d) => '<svg viewBox="0 0 24 24" aria-hidden="true">' + d + '</svg>';
const NAV = [
  ['/admin/', 'แดชบอร์ด', '<path d="M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>'],
  ['', 'ฝ่ายบุคคล'],
  ['/admin/hr/overview', 'ภาพรวม', '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>'],
  ['/admin/hr/live', 'สด', '<path d="M3 12h4l3-8 4 16 3-8h4"/>'],
  ['/admin/hr/quota', 'โควตา', '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>'],
  ['/admin/hr/students', 'นักศึกษา', '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6M17 11a3 3 0 1 0 0-6M21.5 20c0-2.6-1.6-4.6-4-5.5"/>'],
  ['/admin/hr/survey', 'แบบสำรวจโรงเรียน', '<path d="M8 4h8l4 4v12H4V4zM8 12h8M8 16h5"/>'],
  ['/admin/hr/shirt', 'เสื้อค่าย', '<path d="M8 3l-5 3 2 5 3-1v10h8V10l3 1 2-5-5-3a4 4 0 0 1-8 0z"/>'],
  ['/admin/hr/og', 'ตัวอย่างลิงก์', '<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="10" r="1.6"/><path d="M21 16l-5-5-8 8"/>'],
  ['/admin/hr/settings', 'ตั้งค่า', '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1"/>'],
  ['', 'ระบบอื่น'],
  ['/admin/lotto/', 'จับสลาก', '<rect x="3" y="8" width="18" height="12" rx="2"/><path d="M12 8v12M3 12h18M12 8c-2-4-6-3-5 0M12 8c2-4 6-3 5 0"/>'],
  ['/admin/qrcheck/', 'เช็ก QR', '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 14h3v3h-3zM20 14v7M14 20h3"/>'],
  ['/admin/aka/', 'AKA', '<path d="M20 12a8 8 0 0 1-11.5 7.2L4 20l1-4.2A8 8 0 1 1 20 12z"/>'],
  ['/budget/', 'งบประมาณ', '<rect x="2" y="6" width="20" height="13" rx="2"/><circle cx="12" cy="12.5" r="2.5"/><path d="M6 10v5M18 10v5"/>']
];
const FOOT = '© 2026-2027 sorasukt.com. Powered by STNET World Solutions';
const norm = (p) => p.replace(/\.html$/, '').replace(/\/index$/, '/').replace(/(.)\/+$/, '$1');
function build() {
  const body = document.body; if (body.classList.contains('admin-shell')) return;
  body.classList.add('admin-shell');
  const here = norm(location.pathname);
  const nav = NAV.map(([h, l, ic]) => !ic ? '<p class="grp">' + l + '</p>' : '<a href="' + h + '"' + (norm(h) === here ? ' class="on" aria-current="page"' : '') + '>' + I(ic) + l + '</a>').join('');
  const side = document.createElement('aside'); side.className = 'side'; side.id = 'side'; side.setAttribute('aria-label', 'เมนูแอดมิน');
  side.innerHTML = '<a class="brand" href="/admin/"><img src="/assets/logo-english-education.png" alt=""><small>แอดมิน · กิจกรรมค่าย</small></a><nav>' + nav + '</nav><div class="sidefoot"><a href="/">' + I('<path d="M15 18l-6-6 6-6"/>') + 'หน้าแรกกิจกรรมค่าย</a><button type="button" id="shellLogout" class="hidden">' + I('<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-7M21 12H9"/>') + 'ออกจากระบบ</button></div>';
  const scrim = document.createElement('div'); scrim.className = 'scrim'; scrim.id = 'scrim';
  const main = document.createElement('div'); main.className = 'main';
  const top = document.createElement('header'); top.className = 'adtop';
  top.innerHTML = '<button type="button" class="burger" id="burger" aria-label="เมนู" aria-controls="side" aria-expanded="false">' + I('<path d="M4 7h16M4 12h16M4 17h16"/>') + '</button><div class="ttl" id="ttl"></div>' + (body.hasAttribute('data-admin-search') ? '<label class="search">' + I('<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>') + '<input id="q" type="search" placeholder="' + (body.getAttribute('data-admin-search') || 'ค้นหา') + '" aria-label="ค้นหา" autocomplete="off"></label>' : '') + '<div class="acc" id="acc"></div><span id="who" class="who hidden"></span>';
  main.appendChild(top);
  // the page itself: everything except scripts, templates, overlays and the skip link
  const move = [...body.children].filter((e) => !/^(SCRIPT|TEMPLATE|LINK|STYLE|ASIDE)$/.test(e.tagName) && !e.classList.contains('skip') && e.id !== 'toast' && e.id !== 'brandBar' && !e.classList.contains('modal') && !e.classList.contains('dlg') && e.tagName !== 'DIALOG' && !/Modal$|Dlg$/.test(e.id) && e !== main);
  const page = document.createElement('div'); page.className = 'page'; move.forEach((e) => page.appendChild(e)); main.appendChild(page);
  // title + account chip into the top bar (same nodes, so the page's own scripts keep updating them)
  const h1 = page.querySelector('header h1, .hero h1, h1'); const ttl = top.querySelector('#ttl');
  if (h1) ttl.appendChild(h1); else { const h = document.createElement('h1'); h.textContent = document.title.replace(/^แอดมิน · /, ''); ttl.appendChild(h); }
  const chip = page.querySelector('#userChip, #account'); if (chip) top.querySelector('#acc').appendChild(chip);
  const note = page.querySelector('.hero-body'); if (note) { note.classList.add('hero-note'); const first = page.querySelector('main') || page; first.insertBefore(note, first.firstChild); }
  const foot = page.querySelector('footer') || document.createElement('footer'); foot.textContent = FOOT; foot.classList.add('adfoot'); main.appendChild(foot);
  const app = document.createElement('div'); app.className = 'app'; app.appendChild(side); app.appendChild(main); app.appendChild(scrim);
  const skip = body.querySelector('.skip'); body.insertBefore(app, skip ? skip.nextSibling : body.firstChild);
  const setMenu = (on) => { body.classList.toggle('menu', on); top.querySelector('#burger').setAttribute('aria-expanded', String(on)); };
  top.querySelector('#burger').onclick = () => setMenu(!body.classList.contains('menu'));
  scrim.onclick = () => setMenu(false);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') setMenu(false); });
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', build); else build();
})();
