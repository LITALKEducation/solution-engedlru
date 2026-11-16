// แบบสำรวจโรงเรียน (admin page /admin/hr/survey): pick a student by student id, fill in the school-survey form of that student's ฝ่าย,
// save it, print it. Runs after hr.js (shares its sign-in, api(), toast(), esc()); hr.js calls loadSurvey() once the admin is known.
const SV_PUBLIC = PAGE === 'student';   // /hr/survey: an assigned student fills in their own form; /admin/hr/survey: an admin fills in any student's
let svTpl = null, svCur = null, svDirty = false;
const svDigits = (s) => String(s || '').replace(/[๐-๙]/g, (c) => String(c.charCodeAt(0) - 0x0e50)).replace(/\D/g, '');
const svAsk = async (path, opt) => { const r = await api(path, opt); if (!r.ok) throw Object.assign(new Error(await errMsg(r)), { status: r.status }); return r.json(); };
const svPost = (path, body) => svAsk(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const svDate = (s) => (s ? new Date(String(s).replace(' ', 'T') + 'Z').toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' }) : '');

async function loadSurvey() {
  const body = $('adminBody');
  body.innerHTML = '<div class="panel"><h3>เลือกนักศึกษา</h3>'
    + '<form id="svSearch" class="svsearch" autocomplete="off"><label for="svId">รหัสนักศึกษา</label><div class="svrow"><input id="svId" name="id" inputmode="numeric" maxlength="14" placeholder="เช่น 6740102220" aria-describedby="svHelp"><button class="btn primary" type="submit">เปิดแบบสำรวจ</button></div>'
    + '<p id="svHelp" class="muted">ระบบจะใช้แบบสำรวจของฝ่ายที่นักศึกษาคนนั้นลงทะเบียนไว้</p></form><div id="svPick" role="status" aria-live="polite"></div></div>'
    + '<div id="svSheet"></div>'
    + '<div class="panel" id="svList"><h3>แบบสำรวจที่บันทึกแล้ว</h3><div class="skeleton"></div></div>';
  $('svSearch').onsubmit = (e) => { e.preventDefault(); svOpen($('svId').value); };
  try { svTpl = await svAsk('/camps/survey/admin/templates'); } catch (e) { if (sessionGone(e)) { me = null; renderAdmin(); renderUserChip(); return; } body.innerHTML = failBox(e.message, 'loadSurvey()'); return; }
  svLoadList();
  const want = new URLSearchParams(location.search).get('id'); if (want) { $('svId').value = want; svOpen(want); }
}
async function svLoadList() {
  const box = $('svList'); if (!box) return;
  let d; try { d = await svAsk('/camps/survey/admin/list'); } catch (e) { box.innerHTML = '<h3>แบบสำรวจที่บันทึกแล้ว</h3>' + failBox(e.message, 'svLoadList()'); return; }
  box.innerHTML = '<h3>แบบสำรวจที่บันทึกแล้ว <span class="muted">' + d.forms.length + ' ฉบับ</span></h3>' + (d.forms.length
    ? '<div class="tbl-wrap" tabindex="0" role="region" aria-label="ตารางแบบสำรวจที่บันทึกแล้ว"><table><thead><tr><th>ฝ่าย</th><th>ผู้สำรวจ</th><th>โรงเรียน</th><th>ความคืบหน้า</th><th>บันทึกล่าสุด</th><th><span class="sr">เปิด</span></th></tr></thead><tbody>'
      + d.forms.map((f) => '<tr><td>' + esc(f.departmentName) + '</td><td>' + esc(f.name) + '<br><small>' + esc(f.studentId) + '</small></td><td>' + (esc(f.schoolName) || '<span class="muted">—</span>') + '</td><td>' + f.done + '/' + f.total + '</td><td>' + esc(svDate(f.updatedAt)) + '</td>'
        + '<td><button class="btn sm" type="button" onclick="svOpen(\'' + esc(f.studentId) + '\')">เปิด</button></td></tr>').join('') + '</tbody></table></div>'
    : '<p class="muted">ยังไม่มีแบบสำรวจที่บันทึกไว้</p>')
    + '<h3 style="margin-top:20px">ผู้ได้รับมอบหมายให้กรอกเอง <span class="muted">' + d.assignees.length + ' คน</span></h3>'
    + '<p class="muted">นักศึกษาที่ได้รับมอบหมายเข้าสู่ระบบด้วยอีเมล @lru.ac.th ที่ <a href="/hr/survey" id="svLink">' + esc(location.origin) + '/hr/survey</a> <button class="btn sm" type="button" id="svCopy">คัดลอกลิงก์</button></p>'
    + (d.assignees.length ? '<div class="tbl-wrap" tabindex="0" role="region" aria-label="ตารางผู้ได้รับมอบหมาย"><table><thead><tr><th>ผู้ได้รับมอบหมาย</th><th>ฝ่าย</th><th>แบบสำรวจ</th><th><span class="sr">จัดการ</span></th></tr></thead><tbody>'
      + d.assignees.map((x) => '<tr><td>' + esc(x.name) + '<br><small>' + esc(x.studentId) + '</small></td><td>' + (x.departmentName ? esc(x.departmentName) : '<span class="muted">ยังไม่มีฝ่าย</span>') + '</td><td>' + (x.hasForm ? 'บันทึกแล้ว' : 'ยังไม่ได้กรอก') + '</td>'
        + '<td><button class="btn sm" type="button" onclick="svOpen(\'' + esc(x.studentId) + '\')">เปิด</button> <button class="btn sm" type="button" onclick="svAssign(\'' + esc(x.studentId) + '\', false)">ยกเลิกการมอบหมาย</button></td></tr>').join('') + '</tbody></table></div>'
      : '<p class="muted">ยังไม่ได้มอบหมายใคร เลือกนักศึกษาด้านบนแล้วติ๊ก “ให้นักศึกษาคนนี้กรอกเอง”</p>');
  const cp = $('svCopy'); if (cp) cp.onclick = async () => { try { await navigator.clipboard.writeText(location.origin + '/hr/survey'); toast('คัดลอกลิงก์แล้ว'); } catch (e) { toast('คัดลอกไม่ได้ ให้เลือกลิงก์แล้วคัดลอกเอง', true); } };
}
async function svAssign(id, on) {
  try { await svPost('/camps/survey/admin/assign', { studentId: id, assigned: on }); toast(on ? 'มอบหมายแล้ว' : 'ยกเลิกการมอบหมายแล้ว'); svLoadList(); const c = $('svAssign'); if (c && svCur && svCur.student.studentId === id) c.checked = on; }
  catch (e) { toast(e.message, true); const c = $('svAssign'); if (c) c.checked = !on; }
}
async function svOpen(raw) {
  const id = svDigits(raw), pick = $('svPick'), sheet = $('svSheet');
  if (id.length < 6) { pick.innerHTML = '<div class="warn">กรอกรหัสนักศึกษาให้ครบ</div>'; return; }
  if (svDirty && !(await confirmDlg('ยังไม่ได้บันทึก', 'ข้อมูลที่แก้ไขยังไม่ได้บันทึก ต้องการเปิดนักศึกษาคนอื่นเลยไหม?', 'เปิดเลย'))) return;
  $('svId').value = id; pick.innerHTML = '<div class="skeleton" style="height:56px"></div>'; sheet.innerHTML = '';
  let d; try { d = await svAsk('/camps/survey/admin/student?id=' + encodeURIComponent(id)); }
  catch (e) { if (sessionGone(e)) { me = null; renderAdmin(); renderUserChip(); return; } svCur = null; svDirty = false; pick.innerHTML = '<div class="warn">' + esc(e.message) + '</div>'; return; }
  const s = d.student;
  pick.innerHTML = '<div class="svwho"><b>' + esc(s.name) + '</b><span>' + esc(s.studentId) + ' · ปี ' + s.year + ' · ' + (s.departmentName ? esc(s.departmentName) : '<em>ยังไม่มีฝ่าย</em>') + '</span></div>'
    + (d.template ? (d.saved ? '<p class="muted">มีแบบสำรวจที่บันทึกไว้แล้ว · บันทึกล่าสุด ' + esc(svDate(d.form.updatedAt)) + '</p>' : '<p class="muted">ยังไม่มีแบบสำรวจของนักศึกษาคนนี้ กรอกแล้วกดบันทึก</p>')
      : '<div class="warn">' + (d.code === 'NO_DEPARTMENT' ? 'นักศึกษาคนนี้ยังไม่มีฝ่าย จึงยังไม่มีแบบสำรวจ ให้เลือกฝ่ายให้ก่อนที่หน้า “นักศึกษา” หรือ “ภาพรวม”' : 'ฝ่ายนี้ยังไม่มีแบบสำรวจ') + '</div>');
  pick.insertAdjacentHTML('beforeend', '<label class="svassign"><input type="checkbox" id="svAssign"' + (d.assigned ? ' checked' : '') + '> ให้นักศึกษาคนนี้กรอกแบบสำรวจเองที่หน้า /hr/survey</label>');
  $('svAssign').onchange = (e) => svAssign(s.studentId, e.target.checked);
  svCur = d.template ? { student: s, tpl: d.template, form: d.form } : null; svDirty = false;
  if (svCur) svRender();
}
function svRender(v0) {
  const { student: s, tpl: t, form: f } = svCur, v = v0 || f || { schoolName: '', surveyDate: '', coordinator: '', phone: '', checks: t.items.map(() => false), notes: t.items.map(() => ''), summary: '', surveyor: s.name };
  const inp = (id, label, val, extra) => '<div class="shf"><label for="' + id + '">' + label + '</label><input id="' + id + '" value="' + esc(val) + '" ' + (extra || '') + '></div>';
  $('svSheet').innerHTML = '<article class="sheet" id="svPaper" aria-label="แบบสำรวจโรงเรียน ' + esc(t.name) + '">'
    + '<header class="sh-head"><h2>' + esc(svTpl.title) + '</h2><p>' + esc(svTpl.subtitle) + '</p></header>'
    + '<div class="sh-dept"><b>' + esc(t.name) + ' | ' + esc(t.en) + '</b><span>' + esc(t.blurb) + '</span></div>'
    + '<div class="sh-grid">' + inp('svSchool', 'ชื่อโรงเรียน', v.schoolName, 'maxlength="150" autocomplete="off"') + inp('svDate', 'วันที่สำรวจ', v.surveyDate, 'type="date"')
    + inp('svCoord', 'ผู้ประสานงาน', v.coordinator, 'maxlength="120" autocomplete="off"') + inp('svPhone', 'เบอร์โทรศัพท์', v.phone, 'type="tel" maxlength="30" autocomplete="off"') + '</div>'
    + '<p class="sh-inst">' + esc(svTpl.instruction) + '</p>'
    + '<table class="sh-table"><thead><tr><th scope="col">ลำดับ</th><th scope="col">รายการสำรวจ</th><th scope="col">หมายเหตุ</th></tr></thead><tbody>'
    + t.items.map((it, i) => '<tr><td class="sh-no"><label><input type="checkbox" id="svc' + i + '"' + (v.checks[i] ? ' checked' : '') + ' aria-label="สำรวจแล้ว ข้อ ' + (i + 1) + '"><span>' + (i + 1) + '.</span></label></td>'
      + '<td class="sh-item" id="svi' + i + '">' + esc(it) + '</td><td class="sh-nt"><textarea id="svn' + i + '" rows="1" maxlength="300" aria-label="หมายเหตุ ข้อ ' + (i + 1) + '" aria-describedby="svi' + i + '">' + esc(v.notes[i]) + '</textarea></td></tr>').join('')
    + '</tbody></table>'
    + '<div class="shf"><label for="svSum">สรุปผลการสำรวจ / สิ่งที่ต้องดำเนินการเพิ่มเติม</label><textarea id="svSum" rows="4" maxlength="2000">' + esc(v.summary) + '</textarea></div>'
    + inp('svBy', 'ผู้สำรวจ', v.surveyor, 'maxlength="120" autocomplete="off"') + '</article>'
    + '<div class="sv-actions"><button class="btn primary" type="button" id="svSave">บันทึก</button><button class="btn" type="button" id="svPrint">พิมพ์ / บันทึกเป็น PDF</button>'
    + (f && !SV_PUBLIC ? '<button class="btn danger" type="button" id="svDel">ลบแบบสำรวจ</button>' : '') + '<span id="svCount" class="muted"></span>' + (SV_PUBLIC ? '<span id="svStatus" class="svstatus" role="status" aria-live="polite"></span>' : '') + '</div>';
  const paper = $('svPaper'), grow = (el) => { el.style.height = 'auto'; el.style.height = el.scrollHeight + 'px'; };
  paper.querySelectorAll('textarea').forEach(grow);
  paper.addEventListener('input', (e) => { if (e.target.tagName === 'TEXTAREA') grow(e.target); svEdited(); });
  paper.addEventListener('change', svEdited);
  $('svSave').onclick = svSave; $('svPrint').onclick = () => { paper.querySelectorAll('textarea').forEach(grow); window.print(); };
  if ($('svDel')) $('svDel').onclick = svDelete;
  svCount(); svStatusNow();
}
function svCount() { const el = $('svCount'); if (!el || !svCur) return; const n = svCur.tpl.items.filter((_, i) => $('svc' + i).checked).length; el.textContent = 'สำรวจแล้ว ' + n + ' / ' + svCur.tpl.items.length + ' ข้อ' + (svDirty ? ' · ยังไม่ได้บันทึก' : ''); }
function svRead() {
  const n = svCur.tpl.items.length, g = (id) => $(id).value;
  return { studentId: svCur.student.studentId, schoolName: g('svSchool'), surveyDate: g('svDate'), coordinator: g('svCoord'), phone: g('svPhone'), summary: g('svSum'), surveyor: g('svBy'),
    checks: Array.from({ length: n }, (_, i) => $('svc' + i).checked), notes: Array.from({ length: n }, (_, i) => g('svn' + i)) };
}
// ---------- public page /hr/survey: the signed-in student the admin assigned ----------
const SV_REASON = { not_university_email: 'ต้องใช้อีเมลมหาวิทยาลัย (@lru.ac.th) ลองออกจากระบบแล้วเข้าใหม่ด้วยอีเมลนั้น', email_not_verified: 'อีเมลนี้ยังไม่ได้ยืนยันกับ Google', not_in_roster: 'ไม่พบรหัสของคุณในรายชื่อค่าย ลองแจ้งแอดมิน' };
const svCard = (title, msg, extra) => '<div class="card acct"><h2>' + title + '</h2><div class="warn">' + msg + '</div>' + (extra || '') + '</div>';
const svLs = { get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } }, del(k) { try { localStorage.removeItem(k); } catch (e) { /* ignore */ } } };
const svDraftKey = (id) => 'svDraft:' + id;
async function loadSurveyMe() {
  const box = $('svBox'); if (!box) return;
  box.innerHTML = '<div class="skeleton" style="height:120px"></div>';
  let d; try { d = await svAsk('/camps/survey/me'); } catch (e) { if (sessionGone(e)) { me = null; renderAcct(); renderGate(); return; } if (!e.status && svOfflineBoot()) return; box.innerHTML = failBox(e.message, 'loadSurveyMe()'); return; }
  const sw = '<button class="btn sm" type="button" onclick="switchAccount()">ใช้บัญชี Google อื่น</button>';
  if (d.reason) { box.innerHTML = svCard('ใช้งานไม่ได้', esc(SV_REASON[d.reason] || 'บัญชีนี้ใช้งานไม่ได้'), sw); return; }
  const s = d.student;
  if (!d.assigned) { box.innerHTML = svCard('ยังไม่ได้รับมอบหมาย', 'แอดมินยังไม่ได้มอบหมายแบบสำรวจนี้ให้ ' + esc(s.name) + ' (' + esc(s.studentId) + ') ถ้าคุณควรได้รับ ลองแจ้งแอดมิน', sw); return; }
  if (!d.template) { box.innerHTML = svCard('ยังไม่มีฝ่าย', 'คุณยังไม่ได้ลงทะเบียนฝ่าย จึงยังไม่มีแบบสำรวจให้กรอก ลงทะเบียนฝ่ายก่อน หรือแจ้งแอดมิน'); return; }
  svLs.set('svMe', { at: Date.now(), d });   // the form text + the last saved answers, so the page still opens with no signal
  svOffline = false; await svShow(d);
}
// show the form for the signed-in (or, offline, the remembered) assigned student, restoring an unsent draft from this device
async function svShow(d, offline) {
  const s = d.student; svTpl = d.texts; svCur = { student: s, tpl: d.template, form: d.form }; svDirty = false;
  let seed = null; const dr = svLs.get(svDraftKey(s.studentId));
  if (dr && dr.dirty && dr.data && dr.data.checks && dr.data.checks.length === d.template.items.length && dr.data.notes && dr.data.notes.length === d.template.items.length) {
    const same = (dr.base || null) === ((d.form && d.form.updatedAt) || null);
    seed = same || offline ? dr.data : ((await confirmDlg('พบฉบับร่างในเครื่องนี้', 'มีข้อมูลที่แก้ไขไว้ในเครื่องนี้แต่ยังไม่ได้ส่ง และบนระบบมีฉบับที่ใหม่กว่า (อาจแก้โดยแอดมิน) ต้องการใช้ฉบับร่างในเครื่องไหม', 'ใช้ฉบับร่างในเครื่อง', 'ใช้ฉบับบนระบบ')) ? dr.data : null);
    if (!seed) svLs.del(svDraftKey(s.studentId));
  } else if (dr) svLs.del(svDraftKey(s.studentId));
  $('svBox').innerHTML = '<div class="panel"><div class="svwho"><b>' + esc(s.name) + '</b><span>' + esc(s.studentId) + ' · ปี ' + s.year + ' · ' + esc(s.departmentName) + '</span></div>'
    + (offline ? '<div class="warn" role="status">ออฟไลน์ · เปิดจากข้อมูลที่เก็บไว้ในเครื่อง แก้ไขได้ตามปกติ ระบบจะส่งขึ้นเองเมื่อมีสัญญาณ</div>' : '')
    + '<p class="muted">' + (d.form ? 'บันทึกล่าสุดบนระบบ ' + esc(svDate(d.form.updatedAt)) : 'ยังไม่ได้บันทึก กรอกแล้วระบบจะบันทึกให้เอง') + ' · บันทึกอัตโนมัติ แก้ไขได้ตลอด</p></div><div id="svSheet"></div>';
  svRender(seed || undefined);
  if (seed) { svDirty = true; svCount(); svStatus('local', 'พบฉบับร่างในเครื่อง กำลังส่งขึ้นระบบ…'); svTimer = setTimeout(() => svSync(), 800); }
}
// opened with no signal: use the last form this device saw (hr.js start() calls this before / instead of signing in)
function svOfflineBoot() {
  const c = svLs.get('svMe'); if (!c || !c.d || !c.d.template || !c.d.student || !$('svBox')) return false;
  svOffline = true; $('svBox').innerHTML = '';
  const a = $('acct'); if (a) a.innerHTML = '<div class="meta">โหมดออฟไลน์ · ' + esc(c.d.email || c.d.student.name) + '</div>';
  svShow(c.d, true); return true;
}

// ---------- auto save: every edit goes to this device at once, and to the server a couple of seconds later (public page) ----------
const SV_AUTO_MS = 2500;
let svRev = 0, svTimer = null, svLocalTimer = null, svBusy = false, svOffline = false, svRetry = 0, svLast = { kind: '', text: '' };
const svClock = () => new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
function svStatus(kind, text) { svLast = { kind, text }; const el = $('svStatus'); if (el) { el.textContent = text; el.dataset.kind = kind; } }
function svStatusNow() { if (svLast.text) svStatus(svLast.kind, svLast.text); }
function svSaveLocal() {
  if (!svCur) return false;
  return svLs.set(svDraftKey(svCur.student.studentId), { base: svCur.form ? svCur.form.updatedAt : null, at: Date.now(), dirty: svDirty, data: svRead() });
}
const svOnline = () => !svOffline && navigator.onLine !== false;
function svEdited() {
  svDirty = true; svCount();
  if (!SV_PUBLIC) return;
  svRev++;
  clearTimeout(svLocalTimer); svLocalTimer = setTimeout(() => {
    const ok = svSaveLocal();
    svStatus('local', !ok ? 'เก็บในเครื่องไม่ได้ (พื้นที่เต็ม) กดบันทึกเพื่อส่งขึ้นระบบ' : svOnline() ? 'เก็บในเครื่องแล้ว กำลังจะบันทึกขึ้นระบบ…' : 'ออฟไลน์ · เก็บไว้ในเครื่องแล้ว จะส่งเมื่อมีสัญญาณ');
  }, 300);
  clearTimeout(svTimer); svTimer = setTimeout(() => svSync(), SV_AUTO_MS);
}
async function svSync(manual) {
  if (!svCur || !SV_PUBLIC) return;
  clearTimeout(svTimer);
  if (!svDirty && !manual) return;
  if (!svOnline()) { svSaveLocal(); svStatus('offline', 'ออฟไลน์ · เก็บไว้ในเครื่องแล้ว จะส่งเมื่อมีสัญญาณ'); if (manual) toast('ออฟไลน์ เก็บไว้ในเครื่องแล้ว จะส่งขึ้นระบบเมื่อมีสัญญาณ'); return; }
  if (svBusy) { svTimer = setTimeout(() => svSync(manual), 800); return; }
  svBusy = true; const rev = svRev; svStatus('busy', 'กำลังบันทึก…');
  try {
    const d = await svPost('/camps/survey/save', svRead());
    svCur.form = d.form; svRetry = 0;
    if (rev === svRev) { svDirty = false; svLs.del(svDraftKey(svCur.student.studentId)); } else { svSaveLocal(); svTimer = setTimeout(() => svSync(), 300); }
    svLs.set('svMe', { at: Date.now(), d: Object.assign({}, (svLs.get('svMe') || {}).d, { form: d.form }) });
    svStatus('ok', 'บันทึกแล้ว ' + svClock()); if (manual) toast('บันทึกแบบสำรวจแล้ว');
  } catch (e) {
    svSaveLocal();
    if (sessionGone(e)) svStatus('error', 'เข้าสู่ระบบหมดอายุ ข้อมูลยังเก็บไว้ในเครื่อง เข้าสู่ระบบใหม่เพื่อส่งขึ้นระบบ');
    else if (e.status && e.status < 500 && e.status !== 429) { svStatus('error', e.message + ' (ข้อมูลยังเก็บไว้ในเครื่อง)'); if (manual) toast(e.message, true); }
    else { svRetry++; svStatus('offline', 'ส่งขึ้นระบบไม่สำเร็จ เก็บไว้ในเครื่องแล้ว จะลองใหม่เอง'); svTimer = setTimeout(() => svSync(), Math.min(60000, 5000 * svRetry)); }
  } finally { svBusy = false; }
}
if (SV_PUBLIC) {
  window.addEventListener('online', () => { if (svOffline) { location.reload(); return; } if (svDirty) svSync(); });   // a reload is safe: the draft is on this device
  window.addEventListener('offline', () => { if (svCur) svStatus('offline', 'ออฟไลน์ · เก็บไว้ในเครื่องแล้ว จะส่งเมื่อมีสัญญาณ'); });
  window.addEventListener('pagehide', () => { if (svDirty) svSaveLocal(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden) { if (svDirty) svSaveLocal(); } else if (svDirty) svSync(); });
  if ('serviceWorker' in navigator) window.addEventListener('load', () => { navigator.serviceWorker.register('/hr/sw.js', { scope: '/hr/' }).catch(() => { /* works online without it */ }); });
}

async function svSave() {
  if (!svCur) return;
  if (SV_PUBLIC) return svSync(true);
  const b = $('svSave'); b.disabled = true;
  try {
    const d = await svPost(SV_PUBLIC ? '/camps/survey/save' : '/camps/survey/admin/save', svRead());
    svCur.form = d.form; svDirty = false; toast('บันทึกแบบสำรวจแล้ว'); svRender(); svLoadList();
    const pk = $('svPick'); if (pk) pk.querySelectorAll('p.muted').forEach((p) => { p.textContent = 'บันทึกล่าสุด ' + svDate(d.form.updatedAt); });
  } catch (e) { if (sessionGone(e)) { me = null; renderAdmin(); renderUserChip(); return; } toast(e.message, true); b.disabled = false; }
}
async function svDelete() {
  if (!svCur || !(await confirmDlg('ลบแบบสำรวจ?', 'ลบแบบสำรวจของ ' + svCur.student.name + ' ออกจากระบบ ย้อนกลับไม่ได้', 'ลบ'))) return;
  try { await svPost('/camps/survey/admin/delete', { studentId: svCur.student.studentId }); toast('ลบแล้ว'); svCur.form = null; svDirty = false; svRender(); svLoadList(); }
  catch (e) { toast(e.message, true); }
}
window.addEventListener('beforeunload', (e) => { if (svDirty && !SV_PUBLIC) { e.preventDefault(); e.returnValue = ''; } });
