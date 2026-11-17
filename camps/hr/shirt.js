// เสื้อค่าย: students upload ONE design (picture + designer's name + class group / หมู่เรียน) while submissions are open, then vote for one design (not
// their own) while voting is open. The ADMINS upload the sample shirt the designs are shown on (/admin/hr/shirt), set both date windows, hide / delete
// designs and announce the results. Runs after hr.js (shares api(), toast(), esc() ...).
let shirtX = null;
let shSample = { image: null, area: { x: 32, y: 26, w: 36, h: 38 } };   // the admin's sample shirt (null image = the built-in drawing)
const shWhen = (ms) => (ms == null ? '—' : new Date(ms).toLocaleString('th-TH', { dateStyle: 'long', timeStyle: 'short' }));
const SH_STATE = { unset: ['ยังไม่กำหนดวัน', ''], before: ['ยังไม่ถึงเวลา', ''], open: ['เปิดอยู่', 'open'], after: ['ปิดแล้ว', 'closed'] };
const shChip = (st) => { const v = SH_STATE[st] || SH_STATE.unset; return '<span class="state-chip ' + v[1] + '">' + v[0] + '</span>'; };
const shRange = (a, b) => (a == null || b == null ? 'ยังไม่กำหนดวัน' : shWhen(a) + ' – ' + shWhen(b));
const shName = (d) => d.title || ('แบบของ ' + d.designer);   // the title is optional: fall back to the designer
const shWho = (d) => '<p class="shwho">ออกแบบโดย <b>' + esc(d.designer) + '</b> · ' + esc(d.classGroup) + '</p>';
const shErr = async (r) => { try { const d = await r.json(); return d.error || 'เกิดข้อผิดพลาด (' + r.status + ')'; } catch (e) { return 'เกิดข้อผิดพลาด (' + r.status + ')'; } };

// downscale in the browser: longest side 1600 px; the server still checks the type and size
function shResize(file) {
  return new Promise((res, rej) => {
    const url = URL.createObjectURL(file), im = new Image();
    im.onload = () => {
      const k = Math.min(1, 1600 / Math.max(im.naturalWidth, im.naturalHeight)), c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(im.naturalWidth * k)); c.height = Math.max(1, Math.round(im.naturalHeight * k));
      const g = c.getContext('2d'), keepAlpha = file.type !== 'image/jpeg';
      if (!keepAlpha) { g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); }
      g.drawImage(im, 0, 0, c.width, c.height); URL.revokeObjectURL(url);
      const jpeg = () => c.toBlob((b) => (b ? res(b) : rej(new Error('resize'))), 'image/jpeg', 0.88);
      if (!keepAlpha) return jpeg();
      // PNG / WebP keep their transparent background (it matters on a coloured shirt); a PNG that is still too big becomes a JPEG
      c.toBlob((b) => (b && b.size <= 2.8 * 1024 * 1024 ? res(b) : jpeg()), 'image/png');
    };
    im.onerror = () => { URL.revokeObjectURL(url); rej(new Error('image')); };
    im.src = url;
  });
}
// the design shown on a shirt (assets/shirt-mock.js): the admin's sample shirt picture with the design in its print area, or a built-in drawing
const SH_COLORS = window.ShirtMock.COLORS;
const shMock = (src, color, areaOverride) => window.ShirtMock.mock(shSample, src, color, areaOverride);
function shLightbox(src, title, whoHtml) {
  const d = openDlg('<h3>' + esc(title) + '</h3>' + (whoHtml || '') + '<div class="shtabs seg" role="tablist"><button type="button" role="tab" class="on" data-v="mock">บนเสื้อ</button><button type="button" role="tab" data-v="img">รูปต้นฉบับ</button></div>'
    + '<div class="shbig" id="shBig"></div><div class="shdots" id="shDots" role="group" aria-label="สีเสื้อ">' + SH_COLORS.map((c, i) => '<button type="button" class="shdot' + (i === 0 ? ' on' : '') + '" data-c="' + c[0] + '" aria-label="เสื้อสี' + c[1] + '" aria-pressed="' + (i === 0) + '" style="background:' + c[2] + '"></button>').join('') + '</div><div class="btns"><button class="btn primary" data-x>ปิด</button></div>');
  let view = 'mock', color = 'white';
  const draw = () => {
    $('shBig').innerHTML = view === 'mock' ? shMock(src, color) : '<img src="' + esc(src) + '" alt="' + esc(title) + '">';
    $('shDots').classList.toggle('hidden', view !== 'mock' || !!shSample.image);
    d.querySelectorAll('.shtabs button').forEach((b) => b.classList.toggle('on', b.dataset.v === view));
    d.querySelectorAll('.shdot').forEach((b) => { b.classList.toggle('on', b.dataset.c === color); b.setAttribute('aria-pressed', String(b.dataset.c === color)); });
  };
  d.addEventListener('click', (e) => {
    if (e.target.closest('[data-x]')) return d.remove();
    const t = e.target.closest('.shtabs button'); if (t) { view = t.dataset.v; draw(); return; }
    const c = e.target.closest('.shdot'); if (c) { color = c.dataset.c; draw(); }
  });
  draw();
}

// what the upload form shows while it is filled in: the shirt with the design, the designer and the class group
function shLive(src, designer, group, title) {
  return '<div class="shlivecard">' + (shMock(src, 'white') + (src ? '' : '<p class="muted">เลือกรูปเพื่อดูบนเสื้อตัวอย่าง</p>'))
    + '<p class="shliveT">' + esc(title || 'ชื่อแบบ (ถ้ามี)') + '</p><p class="shwho">ออกแบบโดย <b>' + (designer ? esc(designer) : '<i>ชื่อผู้ออกแบบ</i>') + '</b> · ' + (group ? esc(group) : '<i>หมู่เรียน</i>') + '</p></div>';
}
// ---------- student page ----------
async function loadShirt() {
  const box = $('shirtBox'); if (!box) return;
  try { const r = await api('/camps/shirt/me'); if (!r.ok) throw new Error(await shErr(r)); shirtX = await r.json(); }
  catch (e) { if (sessionGone(e)) { me = null; renderAcct(); renderGate(); return; } box.innerHTML = failBox(e.message || 'เชื่อมต่อไม่ได้', 'loadShirt()'); return; }
  renderShirt();
}
function renderShirt() {
  const box = $('shirtBox'), x = shirtX; if (!box || !x) return;
  const sc = x.schedule || {};
  const time = '<div class="card shtime"><div class="shrow"><b>รับผลงาน</b>' + shChip(x.submit) + '<span>' + esc(shRange(sc.submitFrom, sc.submitTo)) + '</span></div><div class="shrow"><b>โหวต</b>' + shChip(x.vote) + '<span>' + esc(shRange(sc.voteFrom, sc.voteTo)) + '</span></div></div>';
  if (x.reason) { box.innerHTML = time + '<div class="card acct"><div class="warn">' + esc(x.error || 'ใช้งานไม่ได้') + '</div><button class="btn primary sm" onclick="switchAccount()">ใช้บัญชี Google อื่น</button></div>'; return; }
  shSample = x.sample || shSample;
  box.innerHTML = time + '<div class="card shsec shsample"><h2>เสื้อตัวอย่าง</h2><div class="shsamplebody"><div class="shsamplepic">' + window.ShirtMock.sampleOnly(shSample, 'white') + '</div><div><p>ลายของทุกคนจะถูกวางบนเสื้อตัวนี้</p><p class="muted">กรอบเส้นประคือตำแหน่งที่ลายถูกพิมพ์ เลือกรูปที่ออกแบบให้อยู่ในกรอบนี้</p></div></div></div><div id="shSubmit"></div><div id="shVote"></div>';
  renderShirtSubmit(); renderShirtVote();
}
function renderShirtSubmit() {
  const host = $('shSubmit'), x = shirtX, my = x.myDesign; if (!host) return;
  const editable = x.submit === 'open' && x.vote !== 'open';
  let h = '<div class="card shsec"><h2>ผลงานของฉัน</h2>';
  if (!editable) {
    h += my ? '<div class="shmine"><button type="button" class="shimg shthumb" id="shMineBig" aria-label="ขยายรูป">' + shMock(my.image, 'white') + '</button><div><b>' + esc(shName(my)) + '</b>' + shWho(my) + (my.description ? '<p class="muted">' + esc(my.description) + '</p>' : '') + (my.hidden ? '<p class="warn">แอดมินซ่อนผลงานนี้</p>' : '') + '</div></div>'
      : '<p class="muted">' + (x.submit === 'before' ? 'ยังไม่ถึงเวลารับผลงาน เปิดรับ ' + esc(shWhen(x.schedule.submitFrom)) : x.submit === 'unset' ? 'ยังไม่กำหนดวันรับผลงาน' : 'ปิดรับผลงานแล้ว คุณไม่ได้ส่งผลงาน') + '</p>';
    host.innerHTML = h + '</div>'; if ($('shMineBig')) $('shMineBig').onclick = () => shLightbox(my.image, shName(my), shWho(my)); return;
  }
  h += '<p class="muted">ส่งได้ 1 ผลงาน แก้ไขหรือเปลี่ยนรูปได้จนถึง ' + esc(shWhen(x.schedule.submitTo)) + ' · <em class="req">*</em> = ต้องกรอก</p><div class="shup"><form id="shForm" class="form" novalidate autocomplete="off">'
    + '<label><span>ชื่อผู้ออกแบบ <em class="req">*</em></span><input id="shDesigner" maxlength="80" required></label><label><span>หมู่เรียน <em class="req">*</em></span><input id="shGroup" maxlength="40" required placeholder="เช่น ปี 2 หมู่ 1"></label>'
    + '<label><span>ชื่อแบบ (ไม่บังคับ)</span><input id="shTitle" maxlength="60"></label><label><span>คำอธิบาย (ไม่บังคับ)</span><textarea id="shDesc" rows="3" maxlength="300"></textarea></label>'
    + '<label><span>รูปลายเสื้อ ' + (my ? '(เลือกใหม่เมื่อต้องการเปลี่ยนรูป)' : '<em class="req">*</em>') + '</span><input id="shFile" type="file" accept="image/png,image/jpeg,image/webp"></label>'
    + '<div class="filerow"><button class="btn primary" type="submit" id="shSave">' + (my ? 'บันทึกการแก้ไข' : 'ส่งผลงาน') + '</button>' + (my ? '<button class="btn danger" type="button" id="shDel">ลบผลงาน</button>' : '') + '</div></form>'
    + '<div class="shlive" id="shLive" aria-live="polite"></div></div>';
  host.innerHTML = h + '</div>';
  $('shDesigner').value = my ? my.designer : (x.student && x.student.name) || ''; $('shGroup').value = my ? my.classGroup : ''; $('shTitle').value = my ? my.title : ''; $('shDesc').value = my ? my.description : '';
  let blob = null, blobUrl = null;
  const live = () => { $('shLive').innerHTML = shLive(blobUrl || (my && my.image) || '', $('shDesigner').value.trim(), $('shGroup').value.trim(), $('shTitle').value.trim()); };
  ['shDesigner', 'shGroup', 'shTitle'].forEach((id) => { $(id).oninput = live; }); live();
  $('shFile').onchange = async (e) => {
    const f = e.target.files[0]; blob = null; if (blobUrl) { URL.revokeObjectURL(blobUrl); blobUrl = null; } if (!f) return live();
    if (!/^image\/(png|jpeg|webp)$/.test(f.type)) { e.target.value = ''; live(); return toast('ใช้ไฟล์ PNG, JPG หรือ WebP เท่านั้น', true); }
    try { blob = await shResize(f); blobUrl = URL.createObjectURL(blob); live(); } catch (err) { e.target.value = ''; live(); toast('เปิดไฟล์รูปไม่ได้', true); }
  };
  $('shForm').onsubmit = async (e) => {
    e.preventDefault();
    const designer = $('shDesigner').value.trim(), group = $('shGroup').value.trim();
    if (!designer) { $('shDesigner').focus(); return toast('กรอกชื่อผู้ออกแบบ', true); }
    if (!group) { $('shGroup').focus(); return toast('กรอกหมู่เรียน', true); }
    if (!my && !blob) { $('shFile').focus(); return toast('เลือกรูปลายเสื้อ', true); }
    $('shSave').disabled = true;
    try {
      const q = new URLSearchParams({ designer, group, title: $('shTitle').value.trim(), description: $('shDesc').value.trim() });
      const r = await api('/camps/shirt/design?' + q, { method: 'POST', headers: blob ? { 'Content-Type': blob.type } : {}, body: blob || undefined });
      if (!r.ok) { toast(await shErr(r), true); await loadShirt(); return; }
      toast('บันทึกผลงานแล้ว'); await loadShirt();
    } catch (err) { toast(sessionGone(err) ? 'เข้าสู่ระบบหมดอายุ ลองเข้าใหม่' : 'เชื่อมต่อไม่ได้ ลองใหม่อีกครั้ง', true); const b = $('shSave'); if (b) b.disabled = false; }
  };
  if ($('shDel')) $('shDel').onclick = async () => {
    if (!(await confirmDlg('ลบผลงาน?', 'ผลงาน “' + shName(my) + '” จะถูกลบ ส่งใหม่ได้จนกว่าจะปิดรับ', 'ลบ'))) return;
    const r = await post('/camps/shirt/design/delete'); if (!r.ok) return toast(await shErr(r), true); toast('ลบผลงานแล้ว'); loadShirt();
  };
}
function renderShirtVote() {
  const host = $('shVote'), x = shirtX; if (!host) return;
  let h = '<div class="card shsec"><h2>โหวตเสื้อค่าย</h2>';
  if (!x.designs) {
    host.innerHTML = h + '<p class="muted">' + (x.vote === 'unset' ? 'ยังไม่กำหนดวันโหวต' : 'ผลงานทั้งหมดจะเปิดให้ดูและโหวตเมื่อถึงเวลาโหวต ' + esc(shWhen(x.schedule.voteFrom))) + '</p></div>'; return;
  }
  const open = x.vote === 'open';
  h += '<p class="muted">' + (open ? 'โหวตได้คนละ 1 แบบ (ไม่ใช่ของตัวเอง) เปลี่ยนใจได้จนถึง ' + esc(shWhen(x.schedule.voteTo)) : x.vote === 'before' ? 'ดูแบบที่ส่งมาได้ก่อน โหวตได้เมื่อถึงเวลาโหวต ' + esc(shWhen(x.schedule.voteFrom)) : x.vote === 'unset' ? 'ยังไม่กำหนดวันโหวต' : 'ปิดโหวตแล้ว' + (x.resultsPublic ? '' : ' · รอแอดมินประกาศผล')) + ' · <a href="/shirt/">หน้าสาธารณะ (ดูได้โดยไม่ต้องเข้าสู่ระบบ)</a></p>';
  let list = x.designs.slice();
  if (x.resultsPublic) list.sort((a, b) => (b.votes || 0) - (a.votes || 0));
  if (!list.length) h += '<p class="muted">ยังไม่มีผลงาน</p>';
  h += '<div class="shgrid">' + list.map((d, i) => {
    const voted = x.myVote === d.id;
    const btn = !open ? '' : d.mine ? '<span class="tag">ผลงานของคุณ</span>' : '<button class="btn sm ' + (voted ? '' : 'primary') + '" data-vote="' + d.id + '" aria-pressed="' + voted + '">' + (voted ? '✓ โหวตแล้ว (กดเพื่อยกเลิก)' : 'โหวตแบบนี้') + '</button>';
    return '<figure class="shcard' + (voted ? ' voted' : '') + '"><button type="button" class="shimg" data-big="' + d.id + '" aria-label="ขยายรูป ' + esc(shName(d)) + '">' + shMock(d.image, 'white') + '</button>'
      + '<figcaption><b>' + (x.resultsPublic ? '<span class="shrank">#' + (i + 1) + '</span> ' : '') + esc(shName(d)) + '</b>' + shWho(d) + (d.description ? '<p class="muted">' + esc(d.description) + '</p>' : '')
      + (x.resultsPublic ? '<p class="shvotes"><b>' + (d.votes || 0) + '</b> โหวต</p>' : '') + '<div class="shact">' + (!open && d.mine ? '<span class="tag">ผลงานของคุณ</span>' : '') + (!open && voted ? '<span class="tag ok">คุณโหวตแบบนี้</span>' : '') + btn + '</div></figcaption></figure>';
  }).join('') + '</div></div>';
  host.innerHTML = h;
  host.onclick = async (e) => {
    const big = e.target.closest('[data-big]'); if (big) { const d = x.designs.find((z) => z.id === big.dataset.big); if (d) shLightbox(d.image, shName(d), shWho(d)); return; }
    const v = e.target.closest('[data-vote]'); if (!v) return;
    v.disabled = true;
    const id = v.dataset.vote, already = x.myVote === id;
    try {
      const r = already ? await post('/camps/shirt/unvote') : await post('/camps/shirt/vote', { designId: id });
      if (!r.ok) { toast(await shErr(r), true); await loadShirt(); return; }
      toast(already ? 'ยกเลิกโหวตแล้ว' : 'โหวตแล้ว'); x.myVote = already ? null : id; renderShirtVote();
    } catch (err) { toast(sessionGone(err) ? 'เข้าสู่ระบบหมดอายุ ลองเข้าใหม่' : 'เชื่อมต่อไม่ได้ ลองใหม่อีกครั้ง', true); v.disabled = false; }
  };
}

// ---------- admin page ----------
let shirtA = null;
async function loadShirtAdmin() {
  const body = $('adminBody');
  try { const r = await api('/camps/shirt/admin/overview'); if (!r.ok) throw new Error(await shErr(r)); shirtA = await r.json(); }
  catch (e) { if (sessionGone(e)) { me = null; renderAdmin(); renderUserChip(); return; } body.innerHTML = failBox(e.message || 'เชื่อมต่อไม่ได้', 'loadShirtAdmin()'); return; }
  shSample = shirtA.sample || shSample;
  renderShirtAdmin();
}
// a stand-in design (a red badge) for the sample-shirt preview when no real design exists yet
const SH_DEMO = 'data:image/svg+xml;utf8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" fill="none"/><circle cx="50" cy="50" r="44" fill="#c62828"/><circle cx="50" cy="50" r="36" fill="none" stroke="#fff" stroke-width="4"/><text x="50" y="58" font-size="22" text-anchor="middle" fill="#fff" font-family="sans-serif" font-weight="700">DESIGN</text></svg>');
function renderShirtAdmin() {
  const body = $('adminBody'), a = shirtA, s = a.settings, smp = a.sample, area = { ...smp.area };
  const win = (idp, label, hint, from, to) => '<div class="shwin"><h4>' + label + ' ' + shChip(idp === 'sub' ? a.submit : a.vote) + '</h4><p class="muted">' + hint + '</p><div class="form cols"><label>เริ่ม<input type="datetime-local" id="' + idp + 'From" value="' + toLocalInput(from) + '"></label><label>สิ้นสุด<input type="datetime-local" id="' + idp + 'To" value="' + toLocalInput(to) + '"></label></div></div>';
  const sl = (k, label, max) => '<label class="shsl"><span>' + label + ' <b id="shv' + k + '">' + area[k] + '</b>%</span><input type="range" id="sh' + k + '" min="0" max="' + max + '" step="0.5" value="' + area[k] + '"></label>';
  body.innerHTML = '<div class="panel" id="shSampleP"><h3>เสื้อตัวอย่าง</h3><p class="muted">แอดมินอัปโหลดรูปเสื้อเปล่า (ด้านหน้า) เอง นักศึกษาจะเห็นลายของตัวเองวางบนเสื้อตัวนี้ ปรับกรอบพิมพ์ให้ตรงตำแหน่งอก ถ้าไม่อัปโหลดจะใช้เสื้อภาพวาดพื้นฐาน</p>'
    + '<div class="shup"><div class="form"><label><span>รูปเสื้อตัวอย่าง (PNG / JPG / WebP ไม่เกิน 3 MB)</span><input id="shSampleFile" type="file" accept="image/png,image/jpeg,image/webp"></label>'
    + '<div id="shAreaBox" class="' + (smp.image ? '' : 'hidden') + '">' + sl('x', 'ซ้าย', 95) + sl('y', 'บน', 95) + sl('w', 'กว้าง', 100) + sl('h', 'สูง', 100) + '<p class="muted">กรอบพิมพ์ = ส่วนที่ลายจะถูกวาง คิดเป็น % ของรูปเสื้อ</p></div>'
    + '<div class="filerow"><button class="btn primary" type="button" id="shUpSample">' + (smp.image ? 'เปลี่ยนรูปเสื้อ' : 'อัปโหลดรูปเสื้อ') + '</button><button class="btn" type="button" id="shSaveArea" ' + (smp.image ? '' : 'disabled') + '>บันทึกกรอบพิมพ์</button>' + (smp.image ? '<button class="btn danger" type="button" id="shResetSample">ใช้เสื้อพื้นฐาน</button>' : '') + '</div></div>'
    + '<div class="shlive" id="shSampleLive" aria-live="polite"></div></div></div>'
    + '<div class="panel"><h3>ผลงานทั้งหมด <span class="muted">(' + a.totals.designs + ' ผลงาน · ' + a.totals.votes + ' โหวต)</span></h3>'
    + (a.designs.length ? '<div class="shgrid">' + a.designs.map((d) => '<figure class="shcard' + (d.hidden ? ' off' : '') + '"><button type="button" class="shimg" data-big="' + d.id + '" aria-label="ขยายรูป">' + shMock(d.image, 'white') + '</button><figcaption><b>' + esc(shName(d)) + '</b>' + shWho(d)
      + '<p class="muted">ส่งโดย ' + esc(d.studentName) + ' · ' + esc(d.studentId) + '</p><p class="shvotes"><b>' + d.votes + '</b> โหวต' + (d.hidden ? ' · <span class="tag">ซ่อนอยู่</span>' : '') + '</p><div class="shact"><button class="btn sm" data-hide="' + d.id + '" data-to="' + (d.hidden ? 0 : 1) + '">' + (d.hidden ? 'แสดง' : 'ซ่อน') + '</button><button class="btn sm danger" data-del="' + d.id + '">ลบ</button></div></figcaption></figure>').join('') + '</div>' : '<p class="muted">ยังไม่มีใครส่งผลงาน</p>') + '</div>'
    + '<div class="panel"><h3>กำหนดวัน</h3><p class="muted">นักศึกษาส่งผลงานได้ในช่วง “รับผลงาน” และโหวตได้ในช่วง “โหวต” ช่วงโหวตต้องเริ่มหลังปิดรับผลงาน เว้นว่างทั้งสองช่องถ้ายังไม่กำหนด (ใช้เวลาตามเครื่องของคุณ)</p>'
    + win('sub', 'รับผลงาน', 'ช่วงที่นักศึกษาอัปโหลดและแก้ไขผลงาน', s.submitFrom, s.submitTo) + win('vote', 'โหวต', 'ช่วงที่นักศึกษาดูผลงานทั้งหมดและโหวต', s.voteFrom, s.voteTo)
    + '<label class="chk"><input type="checkbox" id="shGal"' + (s.galleryPublic !== false ? ' checked' : '') + '> แสดงผลงานที่ส่งมาแล้วในหน้าสาธารณะ <a href="/shirt/" target="_blank" rel="noopener">/shirt/</a> (ทุกคนดูได้โดยไม่ต้องเข้าสู่ระบบ เห็นชื่อผู้ออกแบบและหมู่เรียน)</label>'
    + '<label class="chk"><input type="checkbox" id="shPub"' + (s.resultsPublic ? ' checked' : '') + '> ประกาศผลให้เห็นคะแนนโหวต (ปิดไว้ = เห็นเฉพาะแอดมิน)</label>'
    + '<div class="filerow"><button class="btn primary" type="button" id="shSaveSet">บันทึกวันที่</button><button class="btn sm" type="button" id="shClear">ล้างวันที่ทั้งหมด</button></div></div>';
  // sample shirt: live preview with a real design (the first one) or the stand-in badge; sliders move the print area
  let pending = null, pendingUrl = null;
  const demo = (a.designs[0] && a.designs[0].image) || SH_DEMO;
  const drawSample = () => {
    const saved = shSample; if (pendingUrl) shSample = { image: pendingUrl, area }; else shSample = { ...saved, area };
    const hasImg = !!shSample.image;
    $('shSampleLive').innerHTML = '<div class="shlivecard">' + shMock(demo, 'white', area) + '<p class="muted">' + (hasImg ? 'ตัวอย่างลายบนเสื้อตัวอย่าง' : 'ยังไม่ได้อัปโหลด: ใช้เสื้อพื้นฐาน') + '</p></div>';
    shSample = saved;
  };
  drawSample();
  ['x', 'y', 'w', 'h'].forEach((k) => { $('sh' + k).oninput = (e) => { area[k] = Number(e.target.value); $('shv' + k).textContent = area[k]; if (area.x + area.w > 100) { if (k === 'x') area.w = Math.round((100 - area.x) * 2) / 2; else area.x = Math.round((100 - area.w) * 2) / 2; ['x', 'w'].forEach((q) => { $('sh' + q).value = area[q]; $('shv' + q).textContent = area[q]; }); } if (area.y + area.h > 100) { if (k === 'y') area.h = Math.round((100 - area.y) * 2) / 2; else area.y = Math.round((100 - area.h) * 2) / 2; ['y', 'h'].forEach((q) => { $('sh' + q).value = area[q]; $('shv' + q).textContent = area[q]; }); } drawSample(); }; });
  $('shSampleFile').onchange = async (e) => {
    const f = e.target.files[0]; pending = null; if (pendingUrl) { URL.revokeObjectURL(pendingUrl); pendingUrl = null; } if (!f) return drawSample();
    if (!/^image\/(png|jpeg|webp)$/.test(f.type)) { e.target.value = ''; drawSample(); return toast('ใช้ไฟล์ PNG, JPG หรือ WebP เท่านั้น', true); }
    try { pending = await shResize(f); pendingUrl = URL.createObjectURL(pending); $('shAreaBox').classList.remove('hidden'); drawSample(); } catch (err) { e.target.value = ''; toast('เปิดไฟล์รูปไม่ได้', true); }
  };
  $('shUpSample').onclick = async () => {
    if (!pending) { $('shSampleFile').focus(); return toast('เลือกรูปเสื้อตัวอย่างก่อน', true); }
    $('shUpSample').disabled = true;
    try {
      const r = await api('/camps/shirt/admin/sample?area=' + [area.x, area.y, area.w, area.h].join(','), { method: 'POST', headers: { 'Content-Type': pending.type }, body: pending });
      if (!r.ok) { toast(await shErr(r), true); $('shUpSample').disabled = false; return; }
      toast('อัปโหลดเสื้อตัวอย่างแล้ว'); loadShirtAdmin();
    } catch (err) { toast(sessionGone(err) ? 'เข้าสู่ระบบหมดอายุ ลองเข้าใหม่' : 'เชื่อมต่อไม่ได้ ลองใหม่อีกครั้ง', true); $('shUpSample').disabled = false; }
  };
  $('shSaveArea').onclick = async () => { const r = await post('/camps/shirt/admin/sample/area', area); if (!r.ok) return toast(await shErr(r), true); toast('บันทึกกรอบพิมพ์แล้ว'); loadShirtAdmin(); };
  if ($('shResetSample')) $('shResetSample').onclick = async () => { if (!(await confirmDlg('ใช้เสื้อพื้นฐาน?', 'รูปเสื้อตัวอย่างที่อัปโหลดจะถูกลบ แล้วกลับไปใช้เสื้อภาพวาดพื้นฐาน', 'ตกลง'))) return; const r = await post('/camps/shirt/admin/sample/reset'); if (!r.ok) return toast(await shErr(r), true); toast('กลับไปใช้เสื้อพื้นฐานแล้ว'); loadShirtAdmin(); };
  const save = async (clear) => {
    const v = (id) => (clear ? null : fromLocalInput($(id).value));
    const r = await post('/camps/shirt/admin/settings', { submitFrom: v('subFrom'), submitTo: v('subTo'), voteFrom: v('voteFrom'), voteTo: v('voteTo'), resultsPublic: clear ? false : $('shPub').checked, galleryPublic: clear ? true : $('shGal').checked });
    if (!r.ok) return toast(await shErr(r), true); toast(clear ? 'ล้างวันที่แล้ว' : 'บันทึกแล้ว'); loadShirtAdmin();
  };
  $('shSaveSet').onclick = () => save(false);
  $('shClear').onclick = async () => { if (await confirmDlg('ล้างวันที่ทั้งหมด?', 'ทั้งช่วงรับผลงานและช่วงโหวตจะกลับไปเป็น “ยังไม่กำหนด”', 'ล้าง')) save(true); };
  body.onclick = async (ev) => {
    const big = ev.target.closest('[data-big]'); if (big) { const d = a.designs.find((z) => z.id === big.dataset.big); if (d) shLightbox(d.image, shName(d), shWho(d)); return; }
    const h = ev.target.closest('[data-hide]'); if (h) { const r = await post('/camps/shirt/admin/design/hide', { id: h.dataset.hide, hidden: h.dataset.to === '1' }); if (!r.ok) return toast(await shErr(r), true); toast(h.dataset.to === '1' ? 'ซ่อนแล้ว (โหวตของผลงานนี้ถูกคืน)' : 'แสดงแล้ว'); return loadShirtAdmin(); }
    const x = ev.target.closest('[data-del]'); if (x) { const d = a.designs.find((z) => z.id === x.dataset.del); if (!(await confirmDlg('ลบผลงาน?', '“' + (d ? shName(d) : '') + '” พร้อมโหวตทั้งหมดจะถูกลบถาวร', 'ลบ'))) return; const r = await post('/camps/shirt/admin/design/delete', { id: x.dataset.del }); if (!r.ok) return toast(await shErr(r), true); toast('ลบแล้ว'); loadShirtAdmin(); }
  };
}
