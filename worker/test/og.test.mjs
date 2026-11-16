// Link previews (Open Graph) for the Camps pages: public merged list + custom image, admin edit / upload / reset.
import { makeEnv, installFetch } from './env.mjs';
const { campsOg } = await import('../src/handlers/camps-og.js');
const { OG_PAGES, OG_SITE, ogKeyForPath, ogDefaultImage } = await import('../src/lib/og-pages.js');
installFetch(); const { db, env } = makeEnv();
let pass = 0, fl = 0; const ok = (c, m) => { if (c) pass++; else { fl++; console.log('  FAIL:', m); } };
async function call(who, method, path, body, raw) {
  const url = new URL('https://api.x' + path); const h = { Origin: 'https://enged.sorasukt.com' }; if (who) h.Authorization = 'Bearer ' + who;
  let b; if (raw) { b = raw.bytes; h['Content-Type'] = raw.type; } else if (body) { b = JSON.stringify(body); h['Content-Type'] = 'application/json'; }
  const r = await campsOg(new Request(url, { method, headers: h, body: b }), env, url);
  const ct = r.headers.get('content-type') || '';
  return { s: r.status, h: r.headers, d: ct.includes('json') ? await r.json().catch(() => null) : new Uint8Array(await r.arrayBuffer()) };
}
const png = (n = 40) => { const u = new Uint8Array(n); u.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]); return u; };
const jpg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);

// the page list
ok(Object.keys(OG_PAGES).join() === 'home,hr,aka,lotto,qrcheck,survey', 'six public pages');
ok(Object.values(OG_PAGES).every((p) => p.title && p.description && [...p.title].length <= 70 && [...p.description].length <= 200 && p.files.length), 'defaults fit the limits');
ok(ogKeyForPath('/') === 'home' && ogKeyForPath('/hr') === 'hr' && ogKeyForPath('/hr/') === 'hr' && ogKeyForPath('/hr/choose') === 'hr' && ogKeyForPath('/hr/select.html') === 'hr' && ogKeyForPath('/hr/survey') === 'survey' && ogKeyForPath('/aka/') === 'aka' && ogKeyForPath('/lotto') === 'lotto' && ogKeyForPath('/qrcheck/index.html') === 'qrcheck', 'paths map to page keys');
ok(ogKeyForPath('/admin/hr/overview') === null && ogKeyForPath('/budget/') === null && ogKeyForPath('/hr/overview') === null, 'admin, budget and other pages have no preview');

// public list: defaults until an admin changes something
let r = await call(null, 'GET', '/camps/og/pages');
ok(r.s === 200 && Object.keys(r.d.pages).length === 6 && r.d.pages.hr.title === OG_PAGES.hr.title && r.d.pages.hr.image === ogDefaultImage('hr') && r.d.pages.hr.customImage === false, 'public list returns the defaults');
ok(/max-age=60/.test(r.h.get('cache-control') || ''), 'public list is cacheable for a minute');
ok(r.d.pages.home.url === OG_SITE + '/', 'canonical url');

// admin only
r = await call(null, 'GET', '/camps/og/admin/pages'); ok(r.s === 401, 'admin list: anonymous 401');
r = await call('s1', 'GET', '/camps/og/admin/pages'); ok(r.s === 403, 'admin list: student refused');
r = await call('s1', 'POST', '/camps/og/admin/save', { page: 'hr', title: 'x' }); ok(r.s === 403, 'save: student refused');
r = await call('s1', 'POST', '/camps/og/admin/image?page=hr', null, { bytes: png(), type: 'image/png' }); ok(r.s === 403, 'image: student refused');
r = await call('s1', 'POST', '/camps/og/admin/reset', { page: 'hr' }); ok(r.s === 403, 'reset: student refused');
r = await call('admin', 'GET', '/camps/og/admin/pages'); ok(r.s === 200 && r.d.pages.length === 6 && r.d.limits.title === 70 && r.d.pages[1].defaults.title === OG_PAGES.hr.title && r.d.pages[1].custom.title === '', 'admin list: pages with defaults and (empty) overrides');

// text
r = await call('admin', 'POST', '/camps/og/admin/save', { page: 'nope', title: 'x' }); ok(r.s === 404, 'save: unknown page');
r = await call('admin', 'POST', '/camps/og/admin/save', { page: 'hr', title: 'ก'.repeat(71) }); ok(r.s === 400, 'save: title max 70');
r = await call('admin', 'POST', '/camps/og/admin/save', { page: 'hr', description: 'ก'.repeat(201) }); ok(r.s === 400, 'save: description max 200');
r = await call('admin', 'POST', '/camps/og/admin/save', { page: 'hr', title: '  เลือกฝ่าย  ค่ายครั้งที่ 9\n', description: 'ลงทะเบียนวันที่ 5 ธ.ค.' });
ok(r.s === 200 && r.d.page.title === 'เลือกฝ่าย ค่ายครั้งที่ 9' && r.d.page.description === 'ลงทะเบียนวันที่ 5 ธ.ค.' && r.d.page.custom.title === 'เลือกฝ่าย ค่ายครั้งที่ 9', 'save: whitespace tidied, values published');
r = await call(null, 'GET', '/camps/og/pages'); ok(r.d.pages.hr.title === 'เลือกฝ่าย ค่ายครั้งที่ 9' && r.d.pages.aka.title === OG_PAGES.aka.title, 'public list shows the override, other pages stay default');
r = await call('admin', 'POST', '/camps/og/admin/save', { page: 'hr', title: '', description: OG_PAGES.hr.description });
ok(r.d.page.title === OG_PAGES.hr.title && r.d.page.description === OG_PAGES.hr.description && r.d.page.custom.title === '' && r.d.page.custom.description === '', 'save: empty or default text means "use the default"');

// image
r = await call('admin', 'POST', '/camps/og/admin/image?page=nope', null, { bytes: png(), type: 'image/png' }); ok(r.s === 404, 'image: unknown page');
r = await call('admin', 'POST', '/camps/og/admin/image?page=hr', null, { bytes: new Uint8Array(0), type: 'image/png' }); ok(r.s === 400, 'image: empty body');
r = await call('admin', 'POST', '/camps/og/admin/image?page=hr', null, { bytes: new TextEncoder().encode('<svg onload=alert(1)>'), type: 'image/svg+xml' }); ok(r.s === 400, 'image: SVG / non-image content refused (checked by content, not by header)');
r = await call('admin', 'POST', '/camps/og/admin/image?page=hr', null, { bytes: png(2 * 1024 * 1024 + 1), type: 'image/png' }); ok(r.s === 413, 'image: over 2 MB refused');
r = await call('admin', 'POST', '/camps/og/admin/image?page=hr', null, { bytes: png(), type: 'text/plain' });
ok(r.s === 200 && r.d.page.customImage === true && /\/camps\/og\/image\?page=hr&v=/.test(r.d.page.image), 'image: a PNG is accepted whatever the header says, and published');
const k1 = db.prepare("select image_key k, image_mime m from camp_og_pages where page='hr'").get();
ok(k1.m === 'image/png' && /^camps\/og\/hr-\d+\.png$/.test(k1.k) && env.FILES._m.has(k1.k), 'image stored in R2 under camps/og/');
r = await call(null, 'GET', '/camps/og/image?page=hr'); ok(r.s === 200 && r.h.get('content-type') === 'image/png' && r.d.length === 40, 'public image is served');
r = await call(null, 'GET', '/camps/og/image?page=aka'); ok(r.s === 404, 'no custom image -> 404 (the page uses the static default)');
r = await call(null, 'GET', '/camps/og/image?page=zzz'); ok(r.s === 404, 'unknown page image 404');
r = await call(null, 'GET', '/camps/og/pages'); ok(r.d.pages.hr.customImage === true && r.d.pages.hr.image.includes('/camps/og/image?page=hr') && r.d.pages.aka.customImage === false, 'public list points at the custom image');
await new Promise((x) => setTimeout(x, 5));
r = await call('admin', 'POST', '/camps/og/admin/image?page=hr', null, { bytes: jpg, type: 'image/jpeg' });
const k2 = db.prepare("select image_key k, image_mime m from camp_og_pages where page='hr'").get();
ok(r.s === 200 && k2.m === 'image/jpeg' && k2.k !== k1.k && env.FILES._m.has(k2.k) && !env.FILES._m.has(k1.k), 'replacing the image removes the old file');
ok(db.prepare("select count(*) c from camp_og_pages where page='hr'").get().c === 1, 'one row per page');

// reset
await call('admin', 'POST', '/camps/og/admin/save', { page: 'hr', title: 'ชื่อใหม่' });
r = await call('admin', 'POST', '/camps/og/admin/reset', { page: 'hr', what: 'image' });
ok(r.s === 200 && r.d.page.customImage === false && r.d.page.title === 'ชื่อใหม่' && !env.FILES._m.has(k2.k), 'reset image only: text kept, file deleted');
await call('admin', 'POST', '/camps/og/admin/image?page=hr', null, { bytes: png(), type: 'image/png' });
r = await call('admin', 'POST', '/camps/og/admin/reset', { page: 'hr', what: 'text' });
ok(r.d.page.title === OG_PAGES.hr.title && r.d.page.customImage === true, 'reset text only: image kept');
r = await call('admin', 'POST', '/camps/og/admin/reset', { page: 'hr' });
ok(r.d.page.customImage === false && r.d.page.title === OG_PAGES.hr.title && db.prepare("select count(*) c from camp_og_pages").get().c === 0, 'reset all: row gone');
r = await call('admin', 'POST', '/camps/og/admin/reset', { page: 'zzz' }); ok(r.s === 404, 'reset: unknown page');
ok(db.prepare("select count(*) c from budget_audit_logs where entity_type='og'").get().c >= 8, 'every change is audited');
r = await call('admin', 'GET', '/camps/og/nope'); ok(r.s === 404, 'unknown route 404');

console.log(`og: ${pass} passed, ${fl} failed`); process.exit(fl ? 1 : 0);
