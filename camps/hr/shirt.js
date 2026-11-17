// เสื้อค่าย: the ADMINS upload the shirt designs (picture + designer's name + class group); students look at them on a T-shirt mock-up and vote for one
// design while voting is open. Admins (/admin/hr/shirt) also set both date windows, hide / delete designs and announce the results.
// Runs after hr.js (shares api(), toast(), esc() ...).
let shirtX = null;
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
// a T-shirt mock-up with the design printed on the chest (SVG, so it scales and needs no extra files)
const SH_COLORS = [['white', 'ขาว', '#ffffff', '#cfcfd6'], ['black', 'ดำ', '#202023', '#000000'], ['red', 'แดง', '#c62828', '#8f1b1b'], ['navy', 'กรมท่า', '#1e2f5a', '#12204a'], ['grey', 'เทา', '#a3a2a8', '#7c7b81']];
function shMock(src, color) {
  const c = SH_COLORS.find((x) => x[0] === color) || SH_COLORS[0];
  return '<svg class="shmock" viewBox="0 0 300 300" role="img" aria-label="ตัวอย่างลายบนเสื้อสี' + c[1] + '"><path d="M96 22 L18 58 L44 120 L76 104 L76 282 L224 282 L224 104 L256 120 L282 58 L204 22 Q150 66 96 22 Z" fill="' + c[2] + '" stroke="' + c[3] + '" stroke-width="3" stroke-linejoin="round"/>'
    + '<path d="M96 22 Q150 66 204 22" fill="none" stroke="' + c[3] + '" stroke-width="5" stroke-linecap="round"/><path d="M76 104 L76 282 M224 104 L224 282" stroke="' + c[3] + '" stroke-opacity=".18" stroke-width="2"/>'
    + '<image href="' + esc(src) + '" x="98" y="86" width="104" height="118" preserveAspectRatio="xMidYMid meet"/></svg>';
}
function shLightbox(src, title, whoHtml) {
  const d = openDlg('<h3>' + esc(title) + '</h3>' + (whoHtml || '') + '<div class="shtabs seg" role="tablist"><button type="button" role="tab" class="on" data-v="mock">บนเสื้อ</button><button type="button" role="tab" data-v="img">รูปต้นฉบับ</button></div>'
    + '<div class="shbig" id="shBig"></div><div class="shdots" id="shDots" role="group" aria-label="สีเสื้อ">' + SH_COLORS.map((c, i) => '<button type="button" class="shdot' + (i === 0 ? ' on' : '') + '" data-c="' + c[0] + '" aria-label="เสื้อสี' + c[1] + '" aria-pressed="' + (i === 0) + '" style="background:' + c[2] + '"></button>').join('') + '</div><div class="btns"><button class="btn primary" data-x>ปิด</button></div>');
  let view = 'mock', color = 'white';
  const draw = () => {
    $('shBig').innerHTML = view === 'mock' ? shMock(src, color) : '<img src="' + esc(src) + '" alt="' + esc(title) + '">';
    $('shDots').classList.toggle('hidden', view !== 'mock');
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
  box.innerHTML = time + '<div id="shVote"></div>';
  renderShirtVote();
}
function renderShirtVote() {
  const host = $('shVote'), x = shirtX; if (!host) return;
  let h = '<div class="card shsec"><h2>โหวตเสื้อค่าย</h2>';
  if (!x.designs) {
    host.innerHTML = h + '<p class="muted">' + (x.vote === 'unset' ? 'ยังไม่กำหนดวันโหวต' : 'ผลงานทั้งหมดจะเปิดให้ดูและโหวตเมื่อถึงเวลาโหวต ' + esc(shWhen(x.schedule.voteFrom))) + '</p></div>'; return;
  }
  const open = x.vote === 'open';
  h += '<p class="muted">' + (open ? 'โหวตได้คนละ 1 แบบ เปลี่ยนใจได้จนถึง ' + esc(shWhen(x.schedule.voteTo)) : 'ปิดโหวตแล้ว' + (x.resultsPublic ? '' : ' · รอแอดมินประกาศผล')) + '</p>';
  let list = x.designs.slice();
  if (x.resultsPublic) list.sort((a, b) => (b.votes || 0) - (a.votes || 0));
  if (!list.length) h += '<p class="muted">ยังไม่มีผลงาน</p>';
  h += '<div class="shgrid">' + list.map((d, i) => {
    const voted = x.myVote === d.id;
    const btn = !open ? '' : '<button class="btn sm ' + (voted ? '' : 'primary') + '" data-vote="' + d.id + '" aria-pressed="' + voted + '">' + (voted ? '✓ โหวตแล้ว (กดเพื่อยกเลิก)' : 'โหวตแบบนี้') + '</button>';
    return '<figure class="shcard' + (voted ? ' voted' : '') + '"><button type="button" class="shimg" data-big="' + d.id + '" aria-label="ขยายรูป ' + esc(shName(d)) + '">' + shMock(d.image, 'white') + '</button>'
      + '<figcaption><b>' + (x.resultsPublic ? '<span class="shrank">#' + (i + 1) + '</span> ' : '') + esc(shName(d)) + '</b>' + shWho(d) + (d.description ? '<p class="muted">' + esc(d.description) + '</p>' : '')
      + (x.resultsPublic ? '<p class="shvotes"><b>' + (d.votes || 0) + '</b> โหวต</p>' : '') + '<div class="shact">' + (!open && voted ? '<span class="tag ok">คุณโหวตแบบนี้</span>' : '') + btn + '</div></figcaption></figure>';
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
let shirtA = null, shEdit = null;   // shEdit: the design being edited (null = adding a new one)
async function loadShirtAdmin() {
  const body = $('adminBody');
  try { const r = await api('/camps/shirt/admin/overview'); if (!r.ok) throw new Error(await shErr(r)); shirtA = await r.json(); }
  catch (e) { if (sessionGone(e)) { me = null; renderAdmin(); renderUserChip(); return; } body.innerHTML = failBox(e.message || 'เชื่อมต่อไม่ได้', 'loadShirtAdmin()'); return; }
  renderShirtAdmin();
}
// what the upload form shows while you fill it in: the shirt, the designer and the class group
function shLive(src, designer, group, title) {
  return '<div class="shlivecard">' + (src ? shMock(src, 'white') : '<div class="shnoimg">ยังไม่ได้เลือกรูปแบบเสื้อ</div>')
    + '<p class="shliveT">' + esc(title || 'ชื่อแบบ (ถ้ามี)') + '</p><p class="shwho">ออกแบบโดย <b>' + (designer ? esc(designer) : '<i>ชื่อผู้ออกแบบ</i>') + '</b> · ' + (group ? esc(group) : '<i>หมู่เรียน</i>') + '</p></div>';
}
function renderShirtAdmin() {
  const body = $('adminBody'), a = shirtA, s = a.settings, e = shEdit;
  const win = (idp, label, hint, from, to) => '<div class="shwin"><h4>' + label + ' ' + shChip(idp === 'sub' ? a.submit : a.vote) + '</h4><p class="muted">' + hint + '</p><div class="form cols"><label>เริ่ม<input type="datetime-local" id="' + idp + 'From" value="' + toLocalInput(from) + '"></label><label>สิ้นสุด<input type="datetime-local" id="' + idp + 'To" value="' + toLocalInput(to) + '"></label></div></div>';
  body.innerHTML = '<div class="panel" id="shUp"><h3>' + (e ? 'แก้ไขแบบเสื้อ' : 'เพิ่มแบบเสื้อ') + '</h3><p class="muted">แอดมินอัปโหลดแบบเสื้อเอง ใส่ชื่อผู้ออกแบบและหมู่เรียน (นักศึกษาจะเห็นสองอย่างนี้คู่กับแบบ) <em class="req">*</em> = ต้องกรอก</p>'
    + '<div class="shup"><form id="shAdd" class="form" novalidate autocomplete="off">'
    + '<label><span>ชื่อผู้ออกแบบ <em class="req">*</em></span><input id="shDesigner" maxlength="80" required></label>'
    + '<label><span>หมู่เรียน <em class="req">*</em></span><input id="shGroup" maxlength="40" required placeholder="เช่น ปี 2 หมู่ 1"></label>'
    + '<label>ชื่อแบบ (ไม่บังคับ)<input id="shTitle2" maxlength="60"></label><label>คำอธิบาย (ไม่บังคับ)<textarea id="shDesc2" rows="2" maxlength="300"></textarea></label>'
    + '<label><span>รูปแบบเสื้อ ' + (e ? '(เลือกใหม่เมื่อต้องการเปลี่ยนรูป)' : '<em class="req">*</em>') + '</span><input id="shFile2" type="file" accept="image/png,image/jpeg,image/webp"></label>'
    + '<div class="filerow"><button class="btn primary" type="submit" id="shSaveD">' + (e ? 'บันทึกการแก้ไข' : 'เพิ่มแบบเสื้อ') + '</button>' + (e ? '<button class="btn" type="button" id="shCancelEdit">ยกเลิกการแก้ไข</button>' : '') + '</div></form>'
    + '<div class="shlive" id="shLive" aria-live="polite"></div></div></div>'
    + '<div class="panel"><h3>แบบเสื้อทั้งหมด <span class="muted">(' + a.totals.designs + ' แบบ · ' + a.totals.votes + ' โหวต)</span></h3>'
    + (a.designs.length ? '<div class="shgrid">' + a.designs.map((d) => '<figure class="shcard' + (d.hidden ? ' off' : '') + '"><button type="button" class="shimg" data-big="' + d.id + '" aria-label="ขยายรูป">' + shMock(d.image, 'white') + '</button><figcaption><b>' + esc(shName(d)) + '</b>' + shWho(d)
      + '<p class="shvotes"><b>' + d.votes + '</b> โหวต' + (d.hidden ? ' · <span class="tag">ซ่อนอยู่</span>' : '') + '</p><div class="shact"><button class="btn sm" data-edit="' + d.id + '">แก้ไข</button><button class="btn sm" data-hide="' + d.id + '" data-to="' + (d.hidden ? 0 : 1) + '">' + (d.hidden ? 'แสดง' : 'ซ่อน') + '</button><button class="btn sm danger" data-del="' + d.id + '">ลบ</button></div></figcaption></figure>').join('') + '</div>' : '<p class="muted">ยังไม่ได้อัปโหลดแบบเสื้อ</p>') + '</div>'
    + '<div class="panel"><h3>กำหนดวัน</h3><p class="muted">ช่วงโหวตต้องเริ่มหลังปิดช่วงรับผลงาน เว้นว่างทั้งสองช่องถ้ายังไม่กำหนด (ใช้เวลาตามเครื่องของคุณ) นักศึกษาเห็นแบบเสื้อและโหวตได้เมื่อถึงช่วงโหวต</p>'
    + win('sub', 'รับผลงาน', 'ช่วงที่รับแบบจากผู้ออกแบบ (แสดงให้นักศึกษาเห็นเป็นกำหนดการ)', s.submitFrom, s.submitTo) + win('vote', 'โหวต', 'ช่วงที่นักศึกษาดูแบบและโหวต', s.voteFrom, s.voteTo)
    + '<label class="chk"><input type="checkbox" id="shPub"' + (s.resultsPublic ? ' checked' : '') + '> ประกาศผลให้นักศึกษาเห็นคะแนน (ปิดไว้ = เห็นเฉพาะแอดมิน)</label>'
    + '<div class="filerow"><button class="btn primary" type="button" id="shSaveSet">บันทึกวันที่</button><button class="btn sm" type="button" id="shClear">ล้างวันที่ทั้งหมด</button></div></div>';
  // the form: values, live preview, save
  $('shDesigner').value = e ? e.designer : ''; $('shGroup').value = e ? e.classGroup : ''; $('shTitle2').value = e ? e.title : ''; $('shDesc2').value = e ? e.description : '';
  let blob = null, blobUrl = null;
  const live = () => { $('shLive').innerHTML = shLive(blobUrl || (e && e.image) || '', $('shDesigner').value.trim(), $('shGroup').value.trim(), $('shTitle2').value.trim()); };
  ['shDesigner', 'shGroup', 'shTitle2'].forEach((id) => { $(id).oninput = live; }); live();
  $('shFile2').onchange = async (ev) => {
    const f = ev.target.files[0]; blob = null; if (blobUrl) { URL.revokeObjectURL(blobUrl); blobUrl = null; } if (!f) return live();
    if (!/^image\/(png|jpeg|webp)$/.test(f.type)) { ev.target.value = ''; live(); return toast('ใช้ไฟล์ PNG, JPG หรือ WebP เท่านั้น', true); }
    try { blob = await shResize(f); blobUrl = URL.createObjectURL(blob); live(); } catch (err) { ev.target.value = ''; live(); toast('เปิดไฟล์รูปไม่ได้', true); }
  };
  if ($('shCancelEdit')) $('shCancelEdit').onclick = () => { shEdit = null; renderShirtAdmin(); };
  $('shAdd').onsubmit = async (ev) => {
    ev.preventDefault();
    const designer = $('shDesigner').value.trim(), group = $('shGroup').value.trim();
    if (!designer) { $('shDesigner').focus(); return toast('กรอกชื่อผู้ออกแบบ', true); }
    if (!group) { $('shGroup').focus(); return toast('กรอกหมู่เรียน', true); }
    if (!e && !blob) { $('shFile2').focus(); return toast('เลือกรูปแบบเสื้อ', true); }
    $('shSaveD').disabled = true;
    try {
      const q = new URLSearchParams({ designer, group, title: $('shTitle2').value.trim(), description: $('shDesc2').value.trim() }); if (e) q.set('id', e.id);
      const r = await api('/camps/shirt/admin/design?' + q, { method: 'POST', headers: blob ? { 'Content-Type': blob.type } : {}, body: blob || undefined });
      if (!r.ok) { toast(await shErr(r), true); $('shSaveD').disabled = false; return; }
      toast(e ? 'บันทึกการแก้ไขแล้ว' : 'เพิ่มแบบเสื้อแล้ว'); shEdit = null; loadShirtAdmin();
    } catch (err) { toast(sessionGone(err) ? 'เข้าสู่ระบบหมดอายุ ลองเข้าใหม่' : 'เชื่อมต่อไม่ได้ ลองใหม่อีกครั้ง', true); const b = $('shSaveD'); if (b) b.disabled = false; }
  };
  const save = async (clear) => {
    const v = (id) => (clear ? null : fromLocalInput($(id).value));
    const r = await post('/camps/shirt/admin/settings', { submitFrom: v('subFrom'), submitTo: v('subTo'), voteFrom: v('voteFrom'), voteTo: v('voteTo'), resultsPublic: clear ? false : $('shPub').checked });
    if (!r.ok) return toast(await shErr(r), true); toast(clear ? 'ล้างวันที่แล้ว' : 'บันทึกแล้ว'); loadShirtAdmin();
  };
  $('shSaveSet').onclick = () => save(false);
  $('shClear').onclick = async () => { if (await confirmDlg('ล้างวันที่ทั้งหมด?', 'ทั้งช่วงรับผลงานและช่วงโหวตจะกลับไปเป็น “ยังไม่กำหนด”', 'ล้าง')) save(true); };
  body.onclick = async (ev) => {
    const big = ev.target.closest('[data-big]'); if (big) { const d = a.designs.find((z) => z.id === big.dataset.big); if (d) shLightbox(d.image, shName(d), shWho(d)); return; }
    const ed = ev.target.closest('[data-edit]'); if (ed) { shEdit = a.designs.find((z) => z.id === ed.dataset.edit) || null; renderShirtAdmin(); const up = $('shUp'); if (up && up.scrollIntoView) up.scrollIntoView({ behavior: 'smooth', block: 'start' }); return; }
    const h = ev.target.closest('[data-hide]'); if (h) { const r = await post('/camps/shirt/admin/design/hide', { id: h.dataset.hide, hidden: h.dataset.to === '1' }); if (!r.ok) return toast(await shErr(r), true); toast(h.dataset.to === '1' ? 'ซ่อนแล้ว (โหวตของแบบนี้ถูกคืน)' : 'แสดงแล้ว'); return loadShirtAdmin(); }
    const x = ev.target.closest('[data-del]'); if (x) { const d = a.designs.find((z) => z.id === x.dataset.del); if (!(await confirmDlg('ลบแบบเสื้อ?', '“' + (d ? shName(d) : '') + '” พร้อมโหวตทั้งหมดจะถูกลบถาวร', 'ลบ'))) return; const r = await post('/camps/shirt/admin/design/delete', { id: x.dataset.del }); if (!r.ok) return toast(await shErr(r), true); if (shEdit && shEdit.id === x.dataset.del) shEdit = null; toast('ลบแล้ว'); loadShirtAdmin(); }
  };
}
