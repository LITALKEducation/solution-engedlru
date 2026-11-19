// เสื้อค่าย: students upload ONE design (picture + designer's name + class group / หมู่เรียน) while submissions are open, then vote for one design (not
// their own) while voting is open. The ADMINS upload a sample shirt picture, shown as it is in a box of its own (/admin/hr/shirt), set both date windows, hide / delete
// designs and announce the results. Runs after hr.js (shares api(), toast(), esc() ...).
let shirtX = null;
let shSample = { image: null };   // the admin's sample shirt picture, shown as it is (null = no box)
const shWhen = (ms) => (ms == null ? '—' : new Date(ms).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' }));
const SH_STATE = { unset: ['ยังไม่กำหนดวัน', ''], before: ['ยังไม่ถึงเวลา', ''], open: ['เปิดอยู่', 'open'], after: ['ปิดแล้ว', 'closed'] };
const shChip = (st) => { const v = SH_STATE[st] || SH_STATE.unset; return '<span class="state-chip ' + v[1] + '">' + v[0] + '</span>'; };
const shRange = (a, b) => (a == null || b == null ? 'ยังไม่กำหนดวัน' : shWhen(a) + ' – ' + shWhen(b));
const shName = (d) => d.title || d.designer;   // the title is optional (old designs may have one): the designer's name stands in
const shWho = (d) => '<p class="shwho">ออกแบบโดย <b>' + esc(d.designer) + '</b> · ' + esc(d.classGroup) + '</p>';
const shErr = async (r) => { try { const d = await r.json(); return d.error || 'เกิดข้อผิดพลาด (' + r.status + ')'; } catch (e) { return 'เกิดข้อผิดพลาด (' + r.status + ')'; } };

// AI-generation tags embedded in the ORIGINAL file (resizing strips them): returns short keys the Worker whitelists (see worker/src/lib/aicheck.js)
async function shMeta(file) {
  try {
    const n = file.size, parts = [file.slice(0, 262144), n > 393216 ? file.slice(n - 131072) : null].filter(Boolean);
    const t = (await Promise.all(parts.map(async (p) => new TextDecoder('latin1').decode(await p.arrayBuffer())))).join('\n');
    const rules = [['iptc_ai', /trainedAlgorithmicMedia|compositeSynthetic|algorithmicMedia/], ['sd_params', /Steps: \d+, Sampler:|Negative prompt:|"class_type"\s*:/], ['midjourney', /Midjourney/i],
      ['dalle', /DALL[-\u00b7. ]?E/i], ['openai', /OpenAI|ChatGPT/], ['firefly', /Adobe Firefly/i], ['gemini', /Made with Google AI|Imagen \d|SynthID/], ['c2pa', /c2pa|jumbf/i]];
    return rules.filter((r) => r[1].test(t)).map((r) => r[0]);
  } catch (e) { return []; }
}

// downscale in the browser: longest side 1080 px; the server still checks the type and size
function shResize(file) {
  return new Promise((res, rej) => {
    const url = URL.createObjectURL(file), im = new Image();
    im.onload = () => {
      const k = Math.min(1, 1080 / Math.max(im.naturalWidth, im.naturalHeight)), c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(im.naturalWidth * k)); c.height = Math.max(1, Math.round(im.naturalHeight * k));
      const g = c.getContext('2d'), keepAlpha = file.type !== 'image/jpeg';
      if (!keepAlpha) { g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); }
      g.drawImage(im, 0, 0, c.width, c.height); URL.revokeObjectURL(url);
      const jpeg = () => c.toBlob((b) => (b ? res(b) : rej(new Error('resize'))), 'image/jpeg', 0.88);
      if (!keepAlpha) return jpeg();
      // PNG / WebP keep their transparent background (it matters on a coloured shirt); a PNG that is still too big becomes a JPEG
      c.toBlob((b) => (b && b.size <= 9.8 * 1024 * 1024 ? res(b) : jpeg()), 'image/png');
    };
    im.onerror = () => { URL.revokeObjectURL(url); rej(new Error('image')); };
    im.src = url;
  });
}
// designs are shown as the pictures they are: no mock-up, no layout
const AI_KEYS = { iptc_ai: 'แท็ก AI ในไฟล์', sd_params: 'พารามิเตอร์ Stable Diffusion', midjourney: 'Midjourney', dalle: 'DALL·E', openai: 'OpenAI', firefly: 'Adobe Firefly', gemini: 'Google AI', c2pa: 'Content Credentials' };
const shAi = (a) => !a || !a.level ? '<p class="muted">ตรวจ AI: ยังไม่ได้ตรวจ</p>' : a.level === 'none' ? '<p class="muted">ตรวจ AI: ไม่พบสัญญาณ</p>'
  : '<p><span class="tag' + (a.level === 'likely' ? ' bad' : '') + '">' + (a.level === 'likely' ? 'น่าจะสร้างด้วย AI' : 'อาจสร้างด้วย AI ควรตรวจสอบ') + '</span></p><p class="muted">'
    + (a.score != null ? 'คะแนน ' + Math.round(a.score * 100) + '%' + (a.signals.length ? ' · ' : '') : '') + a.signals.map((k) => esc(AI_KEYS[k] || k)).join(', ') + '</p>';
const shMock = (src) => '<img class="shpic" loading="lazy" src="' + esc(src) + '" alt="">';
function shLightbox(src, title, whoHtml) {
  const d = openDlg('<h3>' + esc(title) + '</h3>' + (whoHtml || '') + '<div class="shbig"><img src="' + esc(src) + '" alt="' + esc(title) + '"></div><div class="btns"><button class="btn primary" data-x>ปิด</button></div>');
  d.addEventListener('click', (e) => { if (e.target.closest('[data-x]')) d.remove(); });
}

// what the upload form shows while it is filled in: the shirt with the design, the designer and the class group
function shLive(src, designer, group) {
  return '<div class="shlivecard">' + (src ? '<img class="shpic" src="' + esc(src) + '" alt="ตัวอย่างผลงาน">' : '<div class="shnoimg">เลือกรูปเพื่อดูตัวอย่าง</div>')
    + '<p class="shwho"><b>' + (designer ? esc(designer) : '<i>ชื่อผู้ออกแบบ</i>') + '</b> · ' + (group ? esc(group) : '<i>หมู่เรียน</i>') + '</p></div>';
}
// ---------- student page ----------
async function loadShirt() {
  const box = $('shirtBox'); if (!box) return;
  try { const r = await api('/camps/shirt/me'); if (!r.ok) throw new Error(await shErr(r)); shirtX = await r.json(); }
  catch (e) { if (sessionGone(e)) { me = null; renderAcct(); renderGate(); return; } box.innerHTML = failBox(e.message || 'เชื่อมต่อไม่ได้', 'loadShirt()'); return; }
  renderShirt();
}
// icon set (stroke icons, decorative: every control that uses one has its own aria-label)
const SHI = {
  up: '<path d="M12 16V4M7 9l5-5 5 5M4 20h16"/>', vote: '<path d="M12 21s-7-4.5-9.5-9A5.5 5.5 0 0112 6a5.5 5.5 0 019.5 6c-2.5 4.5-9.5 9-9.5 9z"/>',
  img: '<rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="9" cy="9" r="2"/><path d="M21 15l-5-5L5 21"/>', user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0116 0"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2 20a7 7 0 0114 0M16 4.5a3.5 3.5 0 010 7M22 20a7 7 0 00-4-6.3"/>', pen: '<path d="M12 20h9M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4z"/>',
  noai: '<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M8 16l4-8 4 8M9.5 13h5M3 3l18 18"/>', clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>', one: '<rect x="3" y="3" width="18" height="18" rx="3"/><path d="M10 9l2-1.5V16"/>',
  lock: '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 018 0v3"/>', check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>', ban: '<circle cx="12" cy="12" r="9"/><path d="M5.6 5.6l12.8 12.8"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>', warn: '<path d="M12 3l10 18H2zM12 10v5M12 18v.01"/>', eye: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  eyeoff: '<path d="M3 3l18 18M10.6 6.1A9.7 9.7 0 0112 6c6 0 10 6 10 6a17 17 0 01-3.2 3.8M6.5 7.5A17 17 0 002 12s4 7 10 7a9.6 9.6 0 004-.9"/>', refresh: '<path d="M21 12a9 9 0 11-3-6.7L21 8M21 3v5h-5"/>',
  hat: '<path d="M2 9l10-5 10 5-10 5zM6 11.5V16c0 1.5 3 3 6 3s6-1.5 6-3v-4.5"/>', globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 010 18M12 3a14 14 0 000 18"/>', cal: '<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M3 10h18M8 3v4M16 3v4"/>',
};
const shIc = (n, c) => '<svg class="shi' + (c ? ' ' + c : '') + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + SHI[n] + '</svg>';
const shShort = (ms) => (ms == null ? '—' : new Date(ms).toLocaleString('th-TH', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }));
const shSpan = (a, b) => (a == null || b == null ? '—' : shShort(a) + '\n→ ' + shShort(b));
const shHead = (icon, label) => '<h2 class="shh">' + shIc(icon) + '<span class="vh">' + label + '</span></h2>';
// two steps, each an icon + a state dot + its dates
function shFlow(x) {
  const sc = x.schedule || {}, step = (icon, st, label, from, to) => '<div class="shstep ' + (st === 'open' ? 'on' : st === 'after' ? 'done' : '') + '" role="group" aria-label="' + label + ' ' + (SH_STATE[st] || SH_STATE.unset)[0] + '"><span class="shbub">' + shIc(icon) + '<i class="shdot ' + ((SH_STATE[st] || SH_STATE.unset)[1] || '') + '"></i></span><span class="shdates">' + esc(shSpan(from, to)) + '</span></div>';
  return '<div class="card shflow">' + step('up', x.submit, 'รับผลงาน', sc.submitFrom, sc.submitTo) + '<span class="shbar" aria-hidden="true"></span>' + step('vote', x.vote, 'โหวต', sc.voteFrom, sc.voteTo) + '</div>';
}
function renderShirt() {
  const box = $('shirtBox'), x = shirtX; if (!box || !x) return;
  if (x.reason) { box.innerHTML = shFlow(x) + '<div class="card acct"><div class="warn">' + esc(x.error || 'ใช้งานไม่ได้') + '</div><button class="btn primary sm" onclick="switchAccount()">ใช้บัญชี Google อื่น</button></div>'; return; }
  shSample = x.sample || shSample;
  box.innerHTML = shFlow(x) + (shSample.image ? '<div class="card shsec shsample"><img class="shsamplepic" src="' + esc(shSample.image) + '" alt="เสื้อตัวอย่าง"></div>' : '') + '<div id="shSubmit"></div><div id="shVote"></div>';
  renderShirtSubmit(); renderShirtVote();
}
function renderShirtSubmit() {
  const host = $('shSubmit'), x = shirtX, my = x.myDesign; if (!host) return;
  const editable = x.submit === 'open' && x.vote !== 'open';
  let h = '<div class="card shsec">' + shHead('pen', 'ผลงานของฉัน');
  if (my && my.rejected) h += '<div class="notice bad" role="alert">' + shIc('ban') + '<div><b>ผลงานนี้เข้าร่วมไม่ได้</b><br>เป็นภาพที่สร้างด้วย AI หรือมีส่วนที่สร้างด้วย AI' + (my.rejected.note ? '<br>' + esc(my.rejected.note) : '') + (editable ? '<br>ส่งรูปใหม่ที่ออกแบบเองได้จนถึง ' + esc(shShort(x.schedule.submitTo)) : '') + '</div></div>';
  if (!editable) {
    h += my ? '<div class="shmine"><button type="button" class="shimg shthumb" id="shMineBig" aria-label="ขยายรูป">' + shMock(my.image, 'white') + '</button><div><b>' + esc(shName(my)) + '</b>' + shWho(my) + (my.hidden && !my.rejected ? '<p class="warn">' + shIc('eyeoff') + ' ซ่อนโดยแอดมิน</p>' : '') + '</div></div>'
      : '<p class="shempty">' + shIc(x.submit === 'before' || x.submit === 'unset' ? 'clock' : 'lock') + '<span class="vh">' + (x.submit === 'after' ? 'ปิดรับผลงานแล้ว' : 'ยังไม่เปิดรับผลงาน') + '</span></p>';
    host.innerHTML = h + '</div>'; if ($('shMineBig')) $('shMineBig').onclick = () => shLightbox(my.image, shName(my), shWho(my)); return;
  }
  const blocked = x.blockedUntil && x.blockedUntil > Date.now();
  if (blocked) h += '<div class="notice bad" role="alert">' + shIc('lock') + '<div><b>ระงับการส่งชั่วคราว</b><br>ส่งใหม่ได้หลัง ' + esc(shShort(x.blockedUntil)) + '</div></div>';
  h += '<form id="shForm" class="shform" novalidate autocomplete="off">'
    + '<label class="shdrop" id="shDrop" for="shFile" aria-label="เลือกรูปลายเสื้อ"><span class="shdropin" id="shLive">' + shIc('img', 'big') + '</span><span class="shdropcta">' + shIc('up') + '<span class="vh">เลือกรูป</span></span></label>'
    + '<input id="shFile" class="vh" type="file" accept="image/png,image/jpeg,image/webp">'
    + '<div class="shfields"><label class="shfield">' + shIc('user') + '<input id="shDesigner" maxlength="80" required aria-label="ชื่อผู้ออกแบบ" placeholder="ชื่อผู้ออกแบบ *"></label>'
    + '<label class="shfield">' + shIc('users') + '<input id="shGroup" maxlength="40" required aria-label="หมู่เรียน" placeholder="หมู่เรียน *"></label></div>'
    + '<ul class="shrules" aria-label="ข้อควรรู้ก่อนส่ง"><li>' + shIc('pen') + '<span>ออกแบบเอง</span></li><li class="no">' + shIc('noai') + '<span>ห้ามใช้ AI</span></li><li>' + shIc('clock') + '<span>พบ AI ระงับ 24 ชม.</span></li><li>' + shIc('one') + '<span>ส่งได้ 1 ผลงาน</span></li></ul>'
    + '<label class="shok"><input type="checkbox" id="shOk"> <span>ฉันออกแบบเอง ไม่ใช้ AI ข้อมูลถูกต้อง</span></label>'
    + '<div class="shbtns"><button class="btn primary" type="submit" id="shSave">' + shIc(my ? 'check' : 'up') + '<span>' + (my ? 'บันทึก' : 'ส่งผลงาน') + '</span></button>' + (my ? '<button class="btn danger" type="button" id="shDel" aria-label="ลบผลงาน" title="ลบผลงาน">' + shIc('trash') + '</button>' : '') + '</div></form>';
  host.innerHTML = h + '</div>';
  $('shDesigner').value = my ? my.designer : (x.student && x.student.name) || ''; $('shGroup').value = my ? my.classGroup : '';
  let meta = [], blob = null, blobUrl = null;
  const live = () => { const src = blobUrl || (my && my.image) || ''; $('shLive').innerHTML = src ? '<img class="shpic" src="' + esc(src) + '" alt="ตัวอย่างผลงาน">' : shIc('img', 'big'); $('shDrop').classList.toggle('has', !!src); };
  live();
  $('shFile').onchange = async (e) => {
    const f = e.target.files[0]; blob = null; meta = []; if (blobUrl) { URL.revokeObjectURL(blobUrl); blobUrl = null; } if (!f) return live();
    if (!/^image\/(png|jpeg|webp)$/.test(f.type)) { e.target.value = ''; live(); return toast('ใช้ไฟล์ PNG, JPG หรือ WebP เท่านั้น', true); }
    try { meta = await shMeta(f); blob = await shResize(f); blobUrl = URL.createObjectURL(blob); live(); } catch (err) { e.target.value = ''; live(); toast('เปิดไฟล์รูปไม่ได้', true); }
  };
  if (blocked) { $('shSave').disabled = true; $('shFile').disabled = true; }
  $('shForm').onsubmit = async (e) => {
    e.preventDefault();
    const designer = $('shDesigner').value.trim(), group = $('shGroup').value.trim();
    if (!designer) { $('shDesigner').focus(); return toast('กรอกชื่อผู้ออกแบบ', true); }
    if (!group) { $('shGroup').focus(); return toast('กรอกหมู่เรียน', true); }
    if (!my && !blob) { $('shFile').focus(); return toast('เลือกรูปลายเสื้อ', true); }
    if (!$('shOk').checked) { $('shOk').focus(); return toast('ติ๊กยืนยันก่อนส่งผลงานว่าออกแบบเอง ไม่ได้สร้างด้วย AI', true); }
    $('shSave').disabled = true;
    try {
      const q = new URLSearchParams({ designer, group, title: my ? my.title : '', description: my ? my.description : '', meta: blob ? meta.join(',') : '' });   // no title / description fields any more: keep what an old design has
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
  let h = '<div class="card shsec">' + shHead('vote', 'โหวตเสื้อค่าย');
  if (!x.designs) { host.innerHTML = h + '<p class="shempty">' + shIc(x.vote === 'after' ? 'lock' : 'clock') + '<span class="vh">ยังไม่เปิดให้โหวต</span></p></div>'; return; }
  const open = x.vote === 'open';
  let list = x.designs.slice();
  if (x.resultsPublic) list.sort((a, b) => (b.votes || 0) - (a.votes || 0));
  if (!list.length) h += '<p class="shempty">' + shIc('img') + '<span class="vh">ยังไม่มีผลงาน</span></p>';
  h += '<div class="shgrid">' + list.map((d, i) => {
    const voted = x.myVote === d.id;
    const btn = !open ? (voted ? '<span class="shflag ok" title="คุณโหวตแบบนี้">' + shIc('vote') + '</span>' : '') : d.mine ? '<span class="shflag" title="ผลงานของคุณ">' + shIc('pen') + '</span>' : '<button class="shheart' + (voted ? ' on' : '') + '" data-vote="' + d.id + '" aria-pressed="' + voted + '" aria-label="' + (voted ? 'ยกเลิกโหวต' : 'โหวต') + ' ' + esc(shName(d)) + '">' + shIc('vote') + '</button>';
    return '<figure class="shcard' + (voted ? ' voted' : '') + '"><button type="button" class="shimg" data-big="' + d.id + '" aria-label="ขยายรูป ' + esc(shName(d)) + '">' + shMock(d.image, 'white') + '</button>'
      + (x.resultsPublic ? '<span class="shrank">#' + (i + 1) + '</span><span class="shcount">' + shIc('vote') + (d.votes || 0) + '</span>' : '') + btn
      + '<figcaption><b>' + esc(d.designer) + '</b><span class="shcls">' + esc(d.classGroup) + '</span></figcaption></figure>';
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
    + '<div class="form"><label><span>รูปเสื้อตัวอย่าง (PNG / JPG / WebP ไม่เกิน 10 MB, ย่อเป็น 1080 × 1080 px)</span><input id="shSampleFile" type="file" accept="image/png,image/jpeg,image/webp"></label>'
    + '<div class="filerow"><button class="btn primary" type="button" id="shUpSample">' + (smp.image ? 'เปลี่ยนรูป' : 'อัปโหลดรูป') + '</button>' + (smp.image ? '<button class="btn danger" type="button" id="shResetSample">ลบรูปเสื้อตัวอย่าง</button>' : '') + '</div></div></div>'
    + (a.blocks && a.blocks.length ? '<div class="panel"><h3>ถูกระงับการส่ง (ตรวจพบ AI)</h3>' + a.blocks.map((b) => '<p>' + esc(b.studentName) + ' · ' + esc(b.studentId) + ' <span class="muted">ถึง ' + esc(shWhen(b.until)) + '</span> <button class="btn sm" data-unblock="' + esc(b.studentId) + '">ปลดล็อก</button></p>').join('') + '</div>' : '')
    + '<div class="panel"><h3>ผลงานทั้งหมด <span class="muted">(' + a.totals.designs + ' ผลงาน · ' + a.totals.votes + ' โหวต)</span></h3>'
    + (a.designs.length ? '<div class="shgrid">' + a.designs.map((d) => '<figure class="shcard' + (d.hidden ? ' off' : '') + '"><button type="button" class="shimg" data-big="' + d.id + '" aria-label="ขยายรูป">' + shMock(d.image, 'white') + '</button><figcaption><b>' + esc(shName(d)) + '</b>' + shWho(d)
      + '<p class="muted">ส่งโดย ' + esc(d.studentName) + ' · ' + esc(d.studentId) + '</p><p class="shvotes"><b>' + d.votes + '</b> โหวต' + (d.hidden ? ' · <span class="tag">ซ่อนอยู่</span>' : '') + '</p>' + shAi(d.ai) + '<div class="shact"><button class="btn sm" data-hide="' + d.id + '" data-to="' + (d.hidden ? 0 : 1) + '">' + (d.hidden ? 'แสดง' : 'ซ่อน') + '</button><button class="btn sm danger" data-del="' + d.id + '">ลบ</button></div></figcaption></figure>').join('') + '</div>' : '<p class="muted">ยังไม่มีใครส่งผลงาน</p>') + '</div>'
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
    const ub = ev.target.closest('[data-unblock]'); if (ub) { const r = await post('/camps/shirt/admin/block/clear', { studentId: ub.dataset.unblock }); if (!r.ok) return toast(await shErr(r), true); toast('ปลดล็อกแล้ว'); return loadShirtAdmin(); }
    const h = ev.target.closest('[data-hide]'); if (h) { const r = await post('/camps/shirt/admin/design/hide', { id: h.dataset.hide, hidden: h.dataset.to === '1' }); if (!r.ok) return toast(await shErr(r), true); toast(h.dataset.to === '1' ? 'ซ่อนแล้ว (โหวตของผลงานนี้ถูกคืน)' : 'แสดงแล้ว'); return loadShirtAdmin(); }
    const x = ev.target.closest('[data-del]'); if (x) { const d = a.designs.find((z) => z.id === x.dataset.del); if (!(await confirmDlg('ลบผลงาน?', '“' + (d ? shName(d) : '') + '” พร้อมโหวตทั้งหมดจะถูกลบถาวร', 'ลบ'))) return; const r = await post('/camps/shirt/admin/design/delete', { id: x.dataset.del }); if (!r.ok) return toast(await shErr(r), true); toast('ลบแล้ว'); loadShirtAdmin(); }
  };
}
