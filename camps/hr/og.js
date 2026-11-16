// ตัวอย่างลิงก์ (/admin/hr/og): the title, description and image shown when a Camps page is shared (LINE, Facebook ...).
// Runs after hr.js (shares its sign-in, api(), toast(), esc()); hr.js calls loadOg() once the admin is known.
let ogData = null;
const ogAsk = async (path, opt) => { const r = await api(path, opt); if (!r.ok) throw Object.assign(new Error(await errMsg(r)), { status: r.status }); return r.json(); };
const ogPost = (path, body) => ogAsk(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const ogHost = (u) => String(u).replace(/^https?:\/\//, '').replace(/\/.*$/, '');
const ogLen = (s) => [...String(s || '')].length;

async function loadOg() {
  const body = $('adminBody');
  try { ogData = await ogAsk('/camps/og/admin/pages'); }
  catch (e) { if (sessionGone(e)) { me = null; renderAdmin(); renderUserChip(); return; } body.innerHTML = failBox(e.message, 'loadOg()'); return; }
  body.innerHTML = '<div class="panel"><h3>ตัวอย่างลิงก์ของแต่ละหน้า</h3><p class="muted">ชื่อ คำอธิบาย และรูปที่เห็นเมื่อแชร์ลิงก์ใน LINE, Facebook ฯลฯ เว้นว่างหรือกด “คืนค่าเดิม” เพื่อใช้ค่าเริ่มต้น แอปแชตอาจจำตัวอย่างเดิมไว้สักพักหลังแก้ไข (ลองส่งลิงก์ใหม่ต่อท้ายด้วย ?x=1)</p></div>'
    + ogData.pages.map((p) => '<section class="panel ogp" id="og-' + p.page + '" aria-labelledby="ogh-' + p.page + '"></section>').join('');
  ogData.pages.forEach(ogRender);
}
function ogCard(p, title, desc) {
  return '<div class="ogcard"><img src="' + esc(p.image) + '" alt="" width="600" height="315" loading="lazy"><div class="ogtxt"><small>' + esc(ogHost(p.url)) + '</small><b>' + esc(title) + '</b><span>' + esc(desc) + '</span></div></div>';
}
function ogRender(p) {
  const t = ogData.limits.title, d = ogData.limits.description, id = p.page;
  $('og-' + id).innerHTML = '<h3 id="ogh-' + id + '">' + esc(p.label) + ' <a class="muted" href="' + esc(p.path) + '" target="_blank" rel="noopener">' + esc(p.path) + '</a></h3>'
    + '<div id="ogprev-' + id + '">' + ogCard(p, p.title, p.description) + '</div>'
    + '<div class="shf"><label for="ogt-' + id + '">ชื่อ <span class="muted" id="ogtc-' + id + '"></span></label><input id="ogt-' + id + '" maxlength="' + t + '" value="' + esc(p.custom.title) + '" placeholder="' + esc(p.defaults.title) + '" autocomplete="off"></div>'
    + '<div class="shf"><label for="ogd-' + id + '">คำอธิบาย <span class="muted" id="ogdc-' + id + '"></span></label><textarea id="ogd-' + id + '" rows="2" maxlength="' + d + '" placeholder="' + esc(p.defaults.description) + '">' + esc(p.custom.description) + '</textarea></div>'
    + '<div class="filerow"><button class="btn primary sm" type="button" id="ogsave-' + id + '">บันทึกข้อความ</button><button class="btn sm" type="button" id="ogreset-' + id + '"' + (p.custom.title || p.custom.description ? '' : ' disabled') + '>คืนค่าเดิม</button></div>'
    + '<div class="shf"><label for="ogf-' + id + '">รูปตัวอย่าง <span class="muted">' + (p.customImage ? 'ใช้รูปที่อัปโหลด' : 'ใช้รูปเริ่มต้น') + '</span></label><input id="ogf-' + id + '" type="file" accept="image/png,image/jpeg,image/webp" aria-describedby="ogh2-' + id + '"></div>'
    + '<p class="muted" id="ogh2-' + id + '">แนะนำ 1200 × 630 พิกเซล ไฟล์ PNG, JPG หรือ WebP ไม่เกิน 2 MB</p>'
    + (p.customImage ? '<div class="filerow"><button class="btn sm danger" type="button" id="ogrimg-' + id + '">ใช้รูปเริ่มต้น</button></div>' : '')
    + (p.updatedAt ? '<p class="muted">แก้ไขล่าสุด ' + esc(new Date(p.updatedAt.replace(' ', 'T') + 'Z').toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' })) + (p.updatedBy ? ' · ' + esc(p.updatedBy) : '') + '</p>' : '');
  const ti = $('ogt-' + id), de = $('ogd-' + id);
  const sync = () => {
    $('ogtc-' + id).textContent = ogLen(ti.value) + ' / ' + t; $('ogdc-' + id).textContent = ogLen(de.value) + ' / ' + d;
    $('ogprev-' + id).innerHTML = ogCard(p, ti.value.trim() || p.defaults.title, de.value.trim() || p.defaults.description);
  };
  ti.oninput = sync; de.oninput = sync; sync();
  $('ogsave-' + id).onclick = () => ogDo(id, () => ogPost('/camps/og/admin/save', { page: id, title: ti.value, description: de.value }), 'บันทึกแล้ว');
  $('ogreset-' + id).onclick = async () => { if (await confirmDlg('คืนค่าเดิม?', 'ชื่อและคำอธิบายของหน้า “' + p.label + '” จะกลับไปเป็นค่าเริ่มต้น (รูปไม่เปลี่ยน)', 'คืนค่าเดิม')) ogDo(id, () => ogPost('/camps/og/admin/reset', { page: id, what: 'text' }), 'คืนค่าเดิมแล้ว'); };
  if ($('ogrimg-' + id)) $('ogrimg-' + id).onclick = async () => { if (await confirmDlg('ใช้รูปเริ่มต้น?', 'ลบรูปที่อัปโหลดของหน้า “' + p.label + '” และกลับไปใช้รูปเริ่มต้น', 'ใช้รูปเริ่มต้น')) ogDo(id, () => ogPost('/camps/og/admin/reset', { page: id, what: 'image' }), 'ใช้รูปเริ่มต้นแล้ว'); };
  $('ogf-' + id).onchange = (e) => {
    const f = e.target.files[0]; if (!f) return;
    if (!/^image\/(png|jpeg|webp)$/.test(f.type)) { e.target.value = ''; return toast('ใช้ไฟล์ PNG, JPG หรือ WebP เท่านั้น', true); }
    if (f.size > ogData.limits.image) { e.target.value = ''; return toast('ไฟล์ใหญ่เกินไป (ไม่เกิน 2 MB)', true); }
    ogDo(id, () => ogAsk('/camps/og/admin/image?page=' + encodeURIComponent(id), { method: 'POST', headers: { 'Content-Type': f.type }, body: f }), 'อัปโหลดรูปแล้ว');
  };
}
async function ogDo(id, fn, msg) {
  const card = $('og-' + id); card.querySelectorAll('button,input,textarea').forEach((x) => { x.disabled = true; });
  try { const d = await fn(); const i = ogData.pages.findIndex((x) => x.page === id); ogData.pages[i] = d.page; toast(msg); ogRender(d.page); }
  catch (e) { if (sessionGone(e)) { me = null; renderAdmin(); renderUserChip(); return; } toast(e.message, true); card.querySelectorAll('button,input,textarea').forEach((x) => { x.disabled = false; }); }
}
