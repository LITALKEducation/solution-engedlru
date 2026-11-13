// ระบบ AKA API: students set a nickname + camp name (AKA) until an admin closes naming; people/departments come from the HR tables.
import { makeEnv, installFetch } from './env.mjs';
const { aka, parseStudentEmail, effectiveState } = await import('../src/handlers/aka.js');
installFetch(); const { db, env } = makeEnv();
let pass = 0, fl = 0; const ok = (c, m) => { if (c) pass++; else { fl++; console.log('  FAIL:', m); } };
async function call(who, method, path, body) {
  const url = new URL('https://api.x' + path); const h = { Origin: 'https://enged.sorasukt.com' }; if (who) h.Authorization = 'Bearer ' + who; if (body) h['Content-Type'] = 'application/json';
  const r = await aka(new Request(url, { method, headers: h, body: body ? JSON.stringify(body) : undefined }), env, url);
  return { s: r.status, d: await r.json().catch(() => null) };
}
db.exec(`INSERT INTO camp_students (student_id,name,year,gender) VALUES
 ('6740102220','นายสมชาย ใจดี',3,'M'),('6740102221','นางสาวสมหญิง รักเรียน',2,'F'),('6840100001','นางสาวมือใหม่ ไม่ได้เลือก',1,'F'),
 ('6640100001','นายอาวุโส สี่ปี',4,'M'),('6640100002','นางสาวอาวุโส สองปี',4,'F'),('6740100009','นายเด็กปีสอง',2,'M');
 INSERT INTO camp_selections (student_id,department_code,year,gender) VALUES ('6740102220','teaching',3,'M'),('6740102221','welfare',2,'F'),('6640100001','teaching',4,'M'),('6640100002','direction',4,'F'),('6740100009','teaching',2,'M');`);
ok(parseStudentEmail('sb6740102220@lru.ac.th') === '6740102220' && parseStudentEmail('x@gmail.com') === null, 'student id comes from the university email');
let r = await call(null, 'GET', '/camps/aka/status'); ok(r.s === 200 && r.d.state === 'open', 'public status: naming is open by default');
r = await call(null, 'GET', '/camps/aka/me'); ok(r.s === 401, 'me: anonymous 401');
r = await call('gmail', 'GET', '/camps/aka/me'); ok(r.d.reason === 'not_university_email' && !r.d.student, 'me: gmail -> not a university email');
r = await call('unverified', 'GET', '/camps/aka/me'); ok(r.d.reason === 'email_not_verified', 'me: unverified email');
r = await call('other', 'GET', '/camps/aka/me'); ok(r.d.reason === 'not_in_roster', 'me: not in the roster');
r = await call('s1', 'GET', '/camps/aka/me'); ok(r.d.student.name === 'นายสมชาย ใจดี' && r.d.student.year === 3 && r.d.student.departmentName === 'ฝ่ายการสอน' && r.d.student.aka === '' && r.d.state === 'open', 'me: name, year and department from the HR data, no names yet');
r = await call('admin', 'GET', '/camps/aka/me'); ok(r.d.isAdmin === true, 'me: admin recognised');
// student saves
r = await call('gmail', 'POST', '/camps/aka/save', { nickname: 'a', aka: 'b' }); ok(r.s === 403, 'save: non-university account refused');
r = await call('other', 'POST', '/camps/aka/save', { nickname: 'a', aka: 'b' }); ok(r.s === 403 && r.d.code === 'NOT_IN_ROSTER', 'save: student not in the roster refused');
r = await call('s1', 'POST', '/camps/aka/save', { nickname: '', aka: 'หมีขาว' }); ok(r.s === 400, 'save: nickname required');
r = await call('s1', 'POST', '/camps/aka/save', { nickname: 'ชาย', aka: '' }); ok(r.s === 400, 'save: AKA required');
r = await call('s1', 'POST', '/camps/aka/save', { nickname: 'ก'.repeat(31), aka: 'x' }); ok(r.s === 400, 'save: nickname max 30');
r = await call('s1', 'POST', '/camps/aka/save', { nickname: 'ชาย', aka: 'ข'.repeat(41) }); ok(r.s === 400, 'save: AKA max 40');
r = await call('s1', 'POST', '/camps/aka/save', { nickname: '  ชาย  ', aka: ' หมีขาว​ ' }); ok(r.s === 200 && r.d.student.nickname === 'ชาย' && r.d.student.aka === 'หมีขาว', 'save: Thai names, whitespace and zero-width characters cleaned');
r = await call('s1', 'POST', '/camps/aka/save', { nickname: 'ชาย', aka: 'หมีใหญ่' }); ok(r.s === 200 && r.d.student.aka === 'หมีใหญ่', 'a student can change their names again (naming is open)');
r = await call('s1', 'GET', '/camps/aka/me'); ok(r.d.student.aka === 'หมีใหญ่' && r.d.student.nickname === 'ชาย' && r.d.student.updatedAt, 'me returns the saved names');
ok(db.prepare('select count(*) c from camp_aka').get().c === 1, 'one row per student');
await call('s2', 'POST', '/camps/aka/save', { nickname: 'หญิง', aka: 'แมวน้อย' });
// admin
r = await call('s1', 'GET', '/camps/aka/admin/overview'); ok(r.s === 403, 'admin overview: student refused');
r = await call('admin', 'GET', '/camps/aka/admin/overview'); ok(r.d.total === 6 && r.d.named === 2 && r.d.state === 'open' && r.d.departments.length === 5, 'overview: 6 in the roster, 2 named');
r = await call('s1', 'POST', '/camps/aka/admin/state', { state: 'closed' }); ok(r.s === 403, 'only admins close naming');
r = await call('admin', 'POST', '/camps/aka/admin/state', { state: 'bogus' }); ok(r.s === 400, 'bad state rejected');
r = await call('admin', 'POST', '/camps/aka/admin/state', { state: 'closed' }); ok(r.s === 200, 'admin closes naming');
r = await call(null, 'GET', '/camps/aka/status'); ok(r.d.state === 'closed', 'public status follows');
r = await call('s1', 'POST', '/camps/aka/save', { nickname: 'ชาย', aka: 'เปลี่ยนไม่ได้' }); ok(r.s === 403 && r.d.code === 'CLOSED', 'after closing, students cannot change their names');
r = await call('s1', 'GET', '/camps/aka/me'); ok(r.d.state === 'closed' && r.d.student.aka === 'หมีใหญ่', 'the saved name is kept and shown read-only');
r = await call('admin', 'POST', '/camps/aka/admin/set', { studentId: '6840100001', nickname: 'ใหม่', aka: 'ปลาทอง' }); ok(r.s === 200 && r.d.student.aka === 'ปลาทอง', 'admin can set a name even when closed');
r = await call('admin', 'POST', '/camps/aka/admin/set', { studentId: '9999999999', nickname: 'x', aka: 'y' }); ok(r.s === 404, 'admin set: unknown student');
r = await call('s1', 'POST', '/camps/aka/admin/set', { studentId: '6840100001', nickname: 'x', aka: 'y' }); ok(r.s === 403, 'admin set: student refused');
// ordering used by the export: department order, then year high -> low, then student id; students with no department last
await call('admin', 'POST', '/camps/aka/admin/set', { studentId: '6640100001', nickname: 'สี่', aka: 'พี่ใหญ่' });
await call('admin', 'POST', '/camps/aka/admin/set', { studentId: '6740100009', nickname: 'สอง', aka: 'น้องเล็ก' });
r = await call('admin', 'GET', '/camps/aka/admin/list');
const order = r.d.students.map((x) => x.studentId + ':' + (x.departmentCode || 'none'));
ok(order.join() === '6640100002:direction,6640100001:teaching,6740102220:teaching,6740100009:teaching,6740102221:welfare,6840100001:none', 'list order = ฝ่าย, ชั้นปี สูง→ต่ำ, รหัส; no department last: ' + order.join());
r = await call('admin', 'GET', '/camps/aka/admin/list?department=teaching'); ok(r.d.students.length === 3 && r.d.students.every((x) => x.departmentCode === 'teaching'), 'filter by department');
r = await call('admin', 'GET', '/camps/aka/admin/list?department=none'); ok(r.d.students.length === 1 && r.d.students[0].studentId === '6840100001', 'filter: no department');
r = await call('admin', 'GET', '/camps/aka/admin/list?year=4'); ok(r.d.students.length === 2, 'filter by year');
r = await call('admin', 'GET', '/camps/aka/admin/list?named=0'); ok(r.d.students.map((x) => x.studentId).join() === '6640100002', 'filter: not named yet');
r = await call('admin', 'GET', '/camps/aka/admin/list?q=' + encodeURIComponent('หมีใหญ่')); ok(r.d.students.length === 1 && r.d.students[0].studentId === '6740102220', 'search by AKA');
r = await call('s1', 'GET', '/camps/aka/admin/list'); ok(r.s === 403, 'list: student refused');
r = await call('admin', 'POST', '/camps/aka/admin/set', { studentId: '6740100009', clear: true }); ok(r.s === 200, 'admin clears a name');
r = await call('admin', 'GET', '/camps/aka/admin/list?named=1'); ok(r.d.students.length === 4 && !r.d.students.some((x) => x.studentId === '6740100009'), 'cleared name is gone');
// schedule / countdown
{const base = { manual: 'closed', schedule: { enabled: true, mode: 'datetime', openAt: 1000, closeAt: 2000 } };
 ok(effectiveState(base, 500) === 'pending' && effectiveState(base, 1500) === 'open' && effectiveState(base, 2000) === 'closed', 'effectiveState follows the clock');
 ok(effectiveState({ ...base, schedule: { ...base.schedule, enabled: false } }, 1500) === 'closed', 'schedule off -> manual state');
 ok(effectiveState({ manual: 'open', schedule: { enabled: true, mode: 'datetime', openAt: null, closeAt: null } }, 1500) === 'open', 'schedule without times -> manual state');}
const NOW = Date.now();
r = await call('s1', 'POST', '/camps/aka/admin/schedule', { enabled: true, mode: 'datetime', openAt: NOW + 1000 }); ok(r.s === 403, 'schedule: student refused');
await call('admin', 'POST', '/camps/aka/admin/state', { state: 'open' });
r = await call('admin', 'POST', '/camps/aka/admin/schedule', { enabled: true, mode: 'datetime', openAt: NOW + 3600e3, closeAt: NOW + 7200e3 }); ok(r.s === 200 && r.d.state === 'pending', 'schedule: opens in 1 h -> pending even though the manual state is open');
r = await call(null, 'GET', '/camps/aka/status'); ok(r.d.state === 'pending' && r.d.schedule.openAt === NOW + 3600e3 && Math.abs(r.d.now - Date.now()) < 5000, 'public status carries the schedule and the server time');
r = await call('s1', 'GET', '/camps/aka/me'); ok(r.d.state === 'pending' && r.d.schedule.enabled, 'me carries the schedule');
r = await call('s1', 'POST', '/camps/aka/save', { nickname: 'ชาย', aka: 'ยังไม่เปิด' }); ok(r.s === 403 && r.d.code === 'NOT_OPEN', 'before the open time students cannot save');
r = await call('admin', 'POST', '/camps/aka/admin/schedule', { enabled: true, mode: 'datetime', openAt: NOW - 3600e3, closeAt: NOW + 3600e3 }); r = await call('s1', 'POST', '/camps/aka/save', { nickname: 'ชาย', aka: 'หมีใหญ่' }); ok(r.s === 200, 'inside the window students can save');
r = await call('admin', 'POST', '/camps/aka/admin/schedule', { enabled: true, mode: 'datetime', openAt: NOW - 7200e3, closeAt: NOW - 3600e3 }); r = await call('s1', 'POST', '/camps/aka/save', { nickname: 'ชาย', aka: 'เลยเวลา' }); ok(r.s === 403 && r.d.code === 'CLOSED', 'after the close time students cannot save');
r = await call('admin', 'POST', '/camps/aka/admin/schedule', { enabled: true, mode: 'datetime', openAt: NOW + 1000, closeAt: NOW + 500 }); ok(r.s === 400, 'close before open rejected');
r = await call('admin', 'POST', '/camps/aka/admin/schedule', { enabled: true, mode: 'datetime' }); ok(r.s === 400, 'enabled without any time rejected');
r = await call('admin', 'POST', '/camps/aka/admin/schedule', { enabled: true, mode: 'countdown', startInSec: -1 }); ok(r.s === 400, 'negative countdown rejected');
r = await call('admin', 'POST', '/camps/aka/admin/schedule', { enabled: true, mode: 'countdown', startInSec: 0, durationSec: 3 }); ok(r.s === 400, 'duration under 10 s rejected');
r = await call('admin', 'POST', '/camps/aka/admin/schedule', { enabled: true, mode: 'countdown', startInSec: 600, durationSec: 1800 }); ok(r.s === 200 && r.d.schedule.mode === 'countdown' && r.d.schedule.closeAt - r.d.schedule.openAt === 1800e3 && Math.abs(r.d.schedule.openAt - (Date.now() + 600e3)) < 5000 && r.d.state === 'pending', 'countdown: opens in 10 min for 30 min (stored as real times)');
r = await call('admin', 'POST', '/camps/aka/admin/schedule', { enabled: true, mode: 'countdown', startInSec: 0, durationSec: 3600 }); ok(r.d.state === 'open', 'countdown with 0 s start: open now');
r = await call('admin', 'GET', '/camps/aka/admin/overview'); ok(r.d.schedule.enabled && r.d.manual === 'open' && r.d.state === 'open', 'overview: manual state, schedule and the state in force');
r = await call('admin', 'POST', '/camps/aka/admin/schedule', { enabled: false }); ok(r.s === 200 && r.d.state === 'open' && r.d.schedule.enabled === false, 'schedule off: back to the manual state');
ok(db.prepare("select count(*) c from budget_audit_logs where entity_type='aka'").get().c >= 5, 'admin actions are audited');
console.log(fl ? fl + ' FAILED' : `all ${pass} aka checks passed`);
process.exit(fl ? 1 : 0);
