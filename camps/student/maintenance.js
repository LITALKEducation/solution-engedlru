// /admin/hr/maintenance: switch maintenance mode ("ปิดปรับปรุงระบบ") on / off, pick the systems, set an optional start / end time and the message the
// students see. Runs after hr.js (shares api(), post(), toast(), esc(), toLocalInput / fromLocalInput ...).
let mtX = null;
const MT_SYS = { hr: ['นักศึกษา', 'ข้อมูลของฉัน · เลือกฝ่าย · AKA · เสื้อค่าย · แบบสำรวจ'], lotto: ['จับสลาก', 'เจ้าหน้าที่สแกน'], qrcheck: ['เช็ก QR', 'เจ้าหน้าที่ตรวจ'] };
const MT_STATE = { off: ['ปิดอยู่ (ระบบเปิดใช้งานปกติ)', 'closed'], upcoming: ['กำหนดไว้ล่วงหน้า (ยังไม่เริ่ม)', ''], active: ['กำลังปิดปรับปรุงอยู่', 'open'] };
const mtErr = async (r) => { try { const d = await r.json(); return d.error || 'เกิดข้อผิดพลาด (' + r.status + ')'; } catch (e) { return 'เกิดข้อผิดพลาด (' + r.status + ')'; } };
async function loadMaintenanceAdmin() {
  const body = $('adminBody');
  try { const r = await api('/camps/maintenance/admin/settings'); if (!r.ok) throw new Error(await mtErr(r)); mtX = await r.json(); }
  catch (e) { if (sessionGone(e)) { me = null; renderAdmin(); renderUserChip(); return; } body.innerHTML = failBox(e.message || 'เชื่อมต่อไม่ได้', 'loadMaintenanceAdmin()'); return; }
  renderMaintenanceAdmin();
}
function renderMaintenanceAdmin() {
  const body = $('adminBody'), x = mtX, st = MT_STATE[x.state] || MT_STATE.off;
  body.innerHTML = '<div class="panel"><h3>สถานะ <span class="state-chip ' + st[1] + '">' + st[0] + '</span></h3>'
    + '<p class="muted">เมื่อเปิด นักศึกษา/เจ้าหน้าที่ของระบบที่เลือกจะเห็นหน้าประกาศปิดปรับปรุง และระบบจะปฏิเสธการบันทึกข้อมูล (ดูข้อมูลได้) หน้าแอดมินใช้งานได้ตามปกติ งบประมาณไม่รวมอยู่ในนี้</p>'
    + '<label class="chk"><input type="checkbox" id="mtOn"' + (x.enabled ? ' checked' : '') + '> เปิดโหมดปิดปรับปรุงระบบ</label>'
    + '<h4 class="mth">ระบบที่ปิด</h4><div class="mtsys">' + Object.keys(MT_SYS).map((k) => '<label class="chk"><input type="checkbox" name="mtSys" value="' + k + '"' + (x.scope.includes(k) ? ' checked' : '') + '> <span><b>' + MT_SYS[k][0] + '</b> <small class="muted">' + MT_SYS[k][1] + '</small></span></label>').join('') + '</div>'
    + '<h4 class="mth">ช่วงเวลา (ไม่บังคับ)</h4><div class="form cols"><label><span>เริ่ม</span><input type="datetime-local" id="mtFrom" value="' + toLocalInput(x.from) + '"></label><label><span>สิ้นสุด</span><input type="datetime-local" id="mtUntil" value="' + toLocalInput(x.until) + '"></label></div>'
    + '<p class="muted">เว้น “เริ่ม” = ปิดทันทีที่บันทึก · เว้น “สิ้นสุด” = ปิดจนกว่าจะมากดปิดเอง · ตั้งเริ่มล่วงหน้าได้ ระบบจะแจ้งเตือนผู้ใช้ก่อนถึงเวลา (ใช้เวลาตามเครื่องของคุณ)</p>'
    + '<label><span class="mth">ข้อความที่แสดง <span class="muted" id="mtCnt"></span></span><textarea id="mtMsg" rows="4" maxlength="500" placeholder="' + esc(x.defaultMessage) + '"></textarea></label>'
    + '<div class="filerow"><button class="btn primary" type="button" id="mtSave">บันทึก</button><button class="btn sm" type="button" id="mtNow">เปิดปิดปรับปรุงทันที (ไม่กำหนดเวลา)</button><button class="btn sm" type="button" id="mtOff">ปิดโหมดนี้ (เปิดระบบ)</button></div></div>'
    + '<div class="panel"><h3>ตัวอย่างที่ผู้ใช้เห็น</h3><div class="mtprev" id="mtPrev" aria-live="polite"></div></div>';
  $('mtMsg').value = x.message || '';
  const scope = () => [...document.querySelectorAll('input[name=mtSys]:checked')].map((i) => i.value);
  const prev = () => {
    const m = $('mtMsg').value.trim() || x.defaultMessage, u = fromLocalInput($('mtUntil').value);
    $('mtCnt').textContent = [...$('mtMsg').value].length + ' / 500';
    $('mtPrev').innerHTML = '<h2>ปิดปรับปรุงระบบ</h2><p class="mtm">' + esc(m) + '</p>' + (u ? '<p class="mtu">คาดว่าจะเปิดใช้งานอีกครั้ง ' + esc(new Date(u).toLocaleString('th-TH', { dateStyle: 'long', timeStyle: 'short' })) + '</p>' : '');
  };
  ['mtMsg', 'mtUntil'].forEach((id) => { $(id).oninput = prev; $(id).onchange = prev; }); prev();
  const save = async (over) => {
    const payload = { enabled: $('mtOn').checked, scope: scope(), from: fromLocalInput($('mtFrom').value), until: fromLocalInput($('mtUntil').value), message: $('mtMsg').value, ...over };
    const r = await post('/camps/maintenance/admin/settings', payload);
    if (!r.ok) return toast(await mtErr(r), true);
    toast(payload.enabled ? 'บันทึกแล้ว' : 'ปิดโหมดปิดปรับปรุงแล้ว'); loadMaintenanceAdmin();
  };
  $('mtSave').onclick = async () => {
    if ($('mtOn').checked && !scope().length) return toast('เลือกระบบที่จะปิดอย่างน้อย 1 ระบบ', true);
    const f = fromLocalInput($('mtFrom').value);
    if ($('mtOn').checked && (!f || f <= Date.now()) && !(await confirmDlg('ปิดปรับปรุงทันที?', 'ผู้ใช้ระบบที่เลือกจะใช้งานไม่ได้ตั้งแต่ตอนนี้ (แอดมินยังใช้ได้)', 'ปิดปรับปรุง'))) return;
    save();
  };
  $('mtNow').onclick = async () => {
    if (!scope().length) return toast('เลือกระบบที่จะปิดอย่างน้อย 1 ระบบ', true);
    if (await confirmDlg('ปิดปรับปรุงทันที?', 'ผู้ใช้ระบบที่เลือกจะใช้งานไม่ได้จนกว่าจะกดปิดโหมดนี้ (แอดมินยังใช้ได้)', 'ปิดปรับปรุง')) save({ enabled: true, from: null, until: null });
  };
  $('mtOff').onclick = () => save({ enabled: false });
}
