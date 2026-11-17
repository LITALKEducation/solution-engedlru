// เสื้อค่าย: students upload ONE design (picture + designer's name + class group / หมู่เรียน) while submissions are open, then vote for one design (not
// their own) while voting is open. The ADMINS upload a sample shirt picture, shown as it is in a box of its own (/admin/hr/shirt), set both date windows, hide / delete
// designs and announce the results. Runs after hr.js (shares api(), toast(), esc() ...).
let shirtX = null;
let shSample = { image: null };   // the admin's sample shirt picture, shown as it is (null = no box)
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
// designs are shown as the pictures they are: no mock-up, no layout
const shMock = (src) => '<img class="shpic" loading="lazy" src="' + esc(src) + '" alt="">';
function shLightbox(src, title, whoHtml) {
  const d = openDlg('<h3>' + esc(title) + '</h3>' + (whoHtml || '') + '<div class="shbig"><img src="' + esc(src) + '" alt="' + esc(title) + '"></div><div class="btns"><button class="btn primary" data-x>ปิด</button></div>');
  d.addEventListener('click', (e) => { if (e.target.closest('[data-x]')) d.remove(); });
}

// what the upload form shows while it is filled in: the shirt with the design, the designer and the class group
function shLive(src, designer, group, title) {
  return '<div class="shlivecard">' + (src ? '<img class="shpic" src="' + esc(src) + '" alt="ตัวอย่างผลงาน">' : '<div class="shnoimg">เลือกรูปเพื่อดูตัวอย่าง</div>')
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
  box.innerHTML = time + (shSample.image ? '<div class="card shsec shsample"><h2>เสื้อตัวอย่าง</h2><img class="shsamplepic" src="' + esc(shSample.image) + '" alt="เสื้อตัวอย่าง"></div>' : '') + '<div id="shSubmit"></div><div id="shVote"></div>';
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
function renderShirtAdmin() {
  const body = $('adminBody'), a = shirtA, s = a.settings, smp = a.sample;
  const win = (idp, label, hint, from, to) => '<div class="shwin"><h4>' + label + ' ' + shChip(idp === 'sub' ? a.submit : a.vote) + '</h4><p class="muted">' + hint + '</p><div class="form cols"><label>เริ่ม<input type="datetime-local" id="' + idp + 'From" value="' + toLocalInput(from) + '"></label><label>สิ้นสุด<input type="datetime-local" id="' + idp + 'To" value="' + toLocalInput(to) + '"></label></div></div>';
  body.innerHTML = '<div class="panel" id="shSampleP"><h3>เสื้อตัวอย่าง</h3><p class="muted">อัปโหลดรูปเสื้อตัวอย่างเอง รูปนี้จะแสดงตามที่อัปโหลดในกล่องเสื้อตัวอย่างของหน้านักศึกษาและหน้าสาธารณะ (ไม่มีกรอบหรือเลย์เอาต์เพิ่ม)</p>'
    + (smp.image ? '<img class="shsamplepic" src="' + esc(smp.image) + '" alt="เสื้อตัวอย่าง">' : '<p class="muted">ยังไม่ได้อัปโหลด กล่องเสื้อตัวอย่างจะไม่แสดง</p>')
    + '<div class="form"><label><span>รูปเสื้อตัวอย่าง (PNG / JPG / WebP ไม่เกิน 3 MB)</span><input id="shSampleFile" type="file" accept="image/png,image/jpeg,image/webp"></label>'
    + '<div class="filerow"><button class="btn primary" type="button" id="shUpSample">' + (smp.image ? 'เปลี่ยนรูป' : 'อัปโหลดรูป') + '</button>' + (smp.image ? '<button class="btn danger" type="button" id="shResetSample">ลบรูปเสื้อตัวอย่าง</button>' : '') + '</div></div></div>'
    + '<div class="panel"><h3>ผลงานทั้งหมด <span class="muted">(' + a.totals.designs + ' ผลงาน · ' + a.totals.votes + ' โหวต)</span></h3>'
    + (a.designs.length ? '<div class="shgrid">' + a.designs.map((d) => '<figure class="shcard' + (d.hidden ? ' off' : '') + '"><button type="button" class="shimg" data-big="' + d.id + '" aria-label="ขยายรูป">' + shMock(d.image, 'white') + '</button><figcaption><b>' + esc(shName(d)) + '</b>' + shWho(d)
      + '<p class="muted">ส่งโดย ' + esc(d.studentName) + ' · ' + esc(d.studentId) + '</p><p class="shvotes"><b>' + d.votes + '</b> โหวต' + (d.hidden ? ' · <span class="tag">ซ่อนอยู่</span>' : '') + '</p><div class="shact"><button class="btn sm" data-hide="' + d.id + '" data-to="' + (d.hidden ? 0 : 1) + '">' + (d.hidden ? 'แสดง' : 'ซ่อน') + '</button><button class="btn sm danger" data-del="' + d.id + '">ลบ</button></div></figcaption></figure>').join('') + '</div>' : '<p class="muted">ยังไม่มีใครส่งผลงาน</p>') + '</div>'
    + '<div class="panel"><h3>กำหนดวัน</h3><p class="muted">นักศึกษาส่งผลงานได้ในช่วง “รับผลงาน” และโหวตได้ในช่วง “โหวต” ช่วงโหวตต้องเริ่มหลังปิดรับผลงาน เว้นว่างทั้งสองช่องถ้ายังไม่กำหนด (ใช้เวลาตามเครื่องของคุณ)</p>'
    + win('sub', 'รับผลงาน', 'ช่วงที่นักศึกษาอัปโหลดและแก้ไขผลงาน', s.submitFrom, s.submitTo) + win('vote', 'โหวต', 'ช่วงที่นักศึกษาดูผลงานทั้งหมดและโหวต', s.voteFrom, s.voteTo)
    + '<label class="chk"><input type="checkbox" id="shGal"' + (s.galleryPublic !== false ? ' checked' : '') + '> แสดงผลงานที่ส่งมาแล้วในหน้าสาธารณะ <a href="/shirt/" target="_blank" rel="noopener">/shirt/</a> (ทุกคนดูได้โดยไม่ต้องเข้าสู่ระบบ เห็นชื่อผู้ออกแบบและหมู่เรียน)</label>'
    + '<label class="chk"><input type="checkbox" id="shPub"' + (s.resultsPublic ? ' checked' : '') + '> ประกาศผลให้เห็นคะแนนโหวต (ปิดไว้ = เห็นเฉพาะแอดมิน)</label>'
    + '<div class="filerow"><button class="btn primary" type="button" id="shSaveSet">บันทึกวันที่</button><button class="btn sm" type="button" id="shClear">ล้างวันที่ทั้งหมด</button></div></div>';
  // the sample shirt picture: choose a file, then upload it (shown as it is)
  let pending = null;
  $('shSampleFile').onchange = async (e) => {
    const f = e.target.files[0]; pending = null; if (!f) return;
    if (!/^image\/(png|jpeg|webp)$/.test(f.type)) { e.target.value = ''; return toast('ใช้ไฟล์ PNG, JPG หรือ WebP เท่านั้น', true); }
    try { pending = await shResize(f); } catch (err) { e.target.value = ''; toast('เปิดไฟล์รูปไม่ได้', true); }
  };
  $('shUpSample').onclick = async () => {
    if (!pending) { $('shSampleFile').focus(); return toast('เลือกรูปเสื้อตัวอย่างก่อน', true); }
    $('shUpSample').disabled = true;
    try {
      const r = await api('/camps/shirt/admin/sample', { method: 'POST', headers: { 'Content-Type': pending.type }, body: pending });
      if (!r.ok) { toast(await shErr(r), true); $('shUpSample').disabled = false; return; }
      toast('อัปโหลดเสื้อตัวอย่างแล้ว'); loadShirtAdmin();
    } catch (err) { toast(sessionGone(err) ? 'เข้าสู่ระบบหมดอายุ ลองเข้าใหม่' : 'เชื่อมต่อไม่ได้ ลองใหม่อีกครั้ง', true); $('shUpSample').disabled = false; }
  };
  if ($('shResetSample')) $('shResetSample').onclick = async () => { if (!(await confirmDlg('ลบรูปเสื้อตัวอย่าง?', 'กล่องเสื้อตัวอย่างจะไม่แสดงในหน้านักศึกษาและหน้าสาธารณะ', 'ลบ'))) return; const r = await post('/camps/shirt/admin/sample/reset'); if (!r.ok) return toast(await shErr(r), true); toast('ลบรูปเสื้อตัวอย่างแล้ว'); loadShirtAdmin(); };
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
