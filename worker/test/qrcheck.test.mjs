// ระบบเช็ค QR API: lookup against the HR registration data, admin-defined checks, one result per student per check.
import { makeEnv, installFetch } from './env.mjs';
const { qrcheck } = await import('../src/handlers/qrcheck.js');
installFetch(); const { db, env } = makeEnv();
let pass = 0, fl = 0; const ok = (c, m) => { if (c) pass++; else { fl++; console.log('  FAIL:', m); } };
async function call(who, method, path, body) {
  const url = new URL('https://api.x' + path); const h = { Origin: 'https://enged.sorasukt.com' }; if (who) h.Authorization = 'Bearer ' + who; if (body) h['Content-Type'] = 'application/json';
  const r = await qrcheck(new Request(url, { method, headers: h, body: body ? JSON.stringify(body) : undefined }), env, url);
  return { s: r.status, d: await r.json().catch(() => null) };
}
// HR data (what the registration / department system already holds)
db.exec(`INSERT INTO camp_students (student_id,name,year,gender) VALUES ('6740102220','นายสมชาย ใจดี',3,'M'),('6740102221','นางสาวสมหญิง รักเรียน',2,'F'),('6840100001','นางสาวมือใหม่ ไม่ได้เลือก',1,'F');
 INSERT INTO camp_selections (student_id,department_code,year,gender) VALUES ('6740102220','teaching',3,'M'),('6740102221','welfare',2,'F');`);
let r = await call(null, 'GET', '/camps/qrcheck/me'); ok(r.s === 401, 'anonymous 401');
r = await call('gmail', 'GET', '/camps/qrcheck/me'); ok(r.s === 403, 'unassigned account refused');
r = await call('admin', 'GET', '/camps/qrcheck/me'); ok(r.s === 200 && r.d.isAdmin, 'admin allowed');
r = await call('admin', 'GET', '/camps/qrcheck/checks'); ok(r.d.checks.length === 2 && r.d.checks[0].name === 'ตรวจครั้งที่ 1' && r.d.checks[1].kind === 'aka', 'seed checks: ตรวจครั้งที่ 1 and ตรวจสอบป้ายกับ AKA');
const C1 = r.d.checks[0].id, CAKA = r.d.checks[1].id;
// officers
r = await call('s1', 'POST', '/camps/qrcheck/admin/officers', { email: 'sb6740102220@lru.ac.th' }); ok(r.s === 403, 'student cannot add officers');
r = await call('admin', 'POST', '/camps/qrcheck/admin/officers', { email: 'sb6740102220@lru.ac.th' }); ok(r.s === 200, 'admin adds an officer');
await call('admin', 'POST', '/camps/qrcheck/admin/officers', { email: 'sb6740102221@lru.ac.th' });
r = await call('admin', 'POST', '/camps/qrcheck/admin/officers', { email: 'nope' }); ok(r.s === 400, 'bad email rejected');
r = await call('s1', 'GET', '/camps/qrcheck/me'); ok(r.s === 200 && !r.d.isAdmin, 'assigned officer allowed (not admin)');
r = await call('unverified', 'GET', '/camps/qrcheck/me'); ok(r.s === 403, 'unverified email refused');
// lookup reads HR data
r = await call('s1', 'POST', '/camps/qrcheck/lookup', { studentId: '6740102220', checkId: C1 });
ok(r.s === 200 && r.d.student.name === 'นายสมชาย ใจดี' && r.d.student.year === 3 && r.d.student.departmentName === 'ฝ่ายการสอน' && r.d.registered === true && r.d.result === null && !r.d.blocked, 'lookup returns the HR data: name, year, department; not checked yet');
ok(r.d.picture === 'https://lh3.googleusercontent.com/a/s1', 'lookup includes the Auth0 photo when there is one');
r = await call('s1', 'POST', '/camps/qrcheck/lookup', { studentId: '๖๗๔๐๑๐๒๒๒๑', checkId: C1 }); ok(r.s === 200 && r.d.student.departmentName === 'ฝ่ายสวัสดิการ', 'Thai digits accepted');
r = await call('s1', 'POST', '/camps/qrcheck/lookup', { studentId: 'sb6740102220@lru.ac.th', checkId: C1 }); ok(r.s === 200, 'email form accepted');
r = await call('s1', 'POST', '/camps/qrcheck/lookup', { studentId: '9999999999', checkId: C1 }); ok(r.s === 404 && r.d.code === 'NOT_FOUND', 'QR not in the registration database -> 404');
r = await call('s1', 'POST', '/camps/qrcheck/lookup', { studentId: 'hello', checkId: C1 }); ok(r.s === 400 && r.d.code === 'BAD_QR', 'not a student QR -> 400');
r = await call('s1', 'POST', '/camps/qrcheck/lookup', { studentId: '6740102220' }); ok(r.s === 400 && r.d.code === 'NO_CHECK', 'a check must be selected');
r = await call('s1', 'POST', '/camps/qrcheck/lookup', { studentId: '6840100001', checkId: C1 }); ok(r.s === 200 && r.d.registered === false && r.d.blocked, 'student with no department: lookup works but the check is blocked');
// record
r = await call('s1', 'POST', '/camps/qrcheck/record', { studentId: '6840100001', checkId: C1, result: 'pass' }); ok(r.s === 409 && r.d.code === 'NOT_REGISTERED', 'cannot record for a student who has not registered a department');
r = await call('s1', 'POST', '/camps/qrcheck/record', { studentId: '6740102220', checkId: C1, result: 'maybe' }); ok(r.s === 400, 'result must be pass or fail');
r = await call('s1', 'POST', '/camps/qrcheck/record', { studentId: '6740102220', checkId: C1, result: 'fail' }); ok(r.s === 400 && r.d.code === 'NOTE_REQUIRED', 'a failed check needs a reason');
r = await call('s1', 'POST', '/camps/qrcheck/record', { studentId: '6740102220', checkId: C1, result: 'pass' }); ok(r.s === 200 && r.d.result.result === 'pass' && r.d.result.checked_by === 'sb6740102220@lru.ac.th', 'officer records "ตรวจครั้งที่ 1: ผ่าน"');
r = await call('s1', 'POST', '/camps/qrcheck/record', { studentId: '6740102220', checkId: C1, result: 'fail', note: 'x' }); ok(r.s === 409 && r.d.code === 'ALREADY_CHECKED' && r.d.result.result === 'pass', 'second record for the same check is refused, the first one stays');
r = await call('s2', 'POST', '/camps/qrcheck/record', { studentId: '6740102220', checkId: C1, result: 'fail', note: 'x', overwrite: true }); ok(r.s === 403, 'a different officer cannot overwrite');
r = await call('s1', 'POST', '/camps/qrcheck/record', { studentId: '6740102220', checkId: C1, result: 'pass', note: 'เพิ่มหมายเหตุ', overwrite: true }); ok(r.s === 200 && r.d.result.note === 'เพิ่มหมายเหตุ', 'the officer who recorded it can refine their own record');
r = await call('s1', 'POST', '/camps/qrcheck/lookup', { studentId: '6740102220', checkId: C1 }); ok(r.d.result.result === 'pass' && r.d.history.length === 1, 'lookup now shows the recorded result and the history');
r = await call('s1', 'POST', '/camps/qrcheck/record', { studentId: '6740102220', checkId: CAKA, result: 'pass', reference: 'AKA-0042' }); ok(r.s === 200 && r.d.result.reference === 'AKA-0042', 'a different check (ป้ายกับ AKA) is independent and keeps the badge reference');
r = await call('s1', 'POST', '/camps/qrcheck/lookup', { studentId: '6740102220', checkId: CAKA }); ok(r.d.history.length === 2, 'history lists both checks');
r = await call('admin', 'POST', '/camps/qrcheck/record', { studentId: '6740102220', checkId: C1, result: 'fail', note: 'แก้ไขโดยผู้ดูแล', overwrite: true }); ok(r.s === 200 && r.d.result.result === 'fail' && r.d.result.updated_by === 'info@sorasukt.com', 'admin can correct a recorded result (who/when kept)');
r = await call('s1', 'POST', '/camps/qrcheck/record', { studentId: '6740102221', checkId: C1, result: 'fail', note: 'ข้อมูลไม่ตรง' }); ok(r.s === 200, 'record a failed check with a reason');
// admin: checks
r = await call('s1', 'GET', '/camps/qrcheck/admin/checks'); ok(r.s === 403, 'officer cannot open the admin list');
r = await call('admin', 'POST', '/camps/qrcheck/admin/checks', { name: 'ตรวจครั้งที่ 2', description: 'ตรวจก่อนปิดค่าย', kind: 'manual', requireRegistered: false }); ok(r.s === 200 && r.d.id, 'admin adds "ตรวจครั้งที่ 2"');
const C2 = r.d.id;
r = await call('admin', 'POST', '/camps/qrcheck/admin/checks', { name: 'ตรวจครั้งที่ 2' }); ok(r.s === 409, 'duplicate name refused');
r = await call('admin', 'POST', '/camps/qrcheck/admin/checks', { name: '' }); ok(r.s === 400, 'empty name refused');
r = await call('s1', 'POST', '/camps/qrcheck/admin/checks', { name: 'x' }); ok(r.s === 403, 'officer cannot add checks');
r = await call('s1', 'POST', '/camps/qrcheck/record', { studentId: '6840100001', checkId: C2, result: 'pass' }); ok(r.s === 200, 'a check that does not require registration works for an unregistered student');
r = await call('admin', 'GET', '/camps/qrcheck/admin/checks'); const c1 = r.d.checks.find((c) => c.id === C1);
ok(r.d.checks.length === 3 && c1.results === 2 && c1.passed === 0 && c1.failed === 2 && r.d.roster === 3 && r.d.registered === 2, 'admin list: counts per check + roster/registered totals');
r = await call('admin', 'PATCH', '/camps/qrcheck/admin/checks/' + C2, { active: false }); ok(r.s === 200, 'deactivate a check');
r = await call('s1', 'GET', '/camps/qrcheck/checks'); ok(r.d.checks.length === 2 && !r.d.checks.some((c) => c.id === C2), 'officers only see active checks');
r = await call('s1', 'POST', '/camps/qrcheck/lookup', { studentId: '6740102220', checkId: C2 }); ok(r.s === 400 && r.d.code === 'NO_CHECK', 'an inactive check cannot be used');
r = await call('admin', 'GET', '/camps/qrcheck/checks?all=1'); ok(r.d.checks.length === 3, 'admin can list inactive checks too');
r = await call('admin', 'PATCH', '/camps/qrcheck/admin/checks/' + C2, { name: 'ตรวจครั้งที่ 3', sortOrder: 9 }); ok(r.s === 200, 'rename + reorder');
r = await call('admin', 'DELETE', '/camps/qrcheck/admin/checks/' + C1); ok(r.s === 409 && r.d.code === 'HAS_RESULTS', 'a check with results cannot be deleted');
await call('admin', 'POST', '/camps/qrcheck/admin/checks', { name: 'ชั่วคราว' }); r = await call('admin', 'GET', '/camps/qrcheck/admin/checks'); const tmp = r.d.checks.find((c) => c.name === 'ชั่วคราว');
r = await call('admin', 'DELETE', '/camps/qrcheck/admin/checks/' + tmp.id); ok(r.s === 200, 'an unused check can be deleted');
// admin: results
r = await call('admin', 'GET', '/camps/qrcheck/admin/results'); ok(r.d.results.length === 4 && r.d.results[0].check_name && r.d.results.some((x) => x.department_name === 'ฝ่ายการสอน' && x.name === 'นายสมชาย ใจดี'), 'results list joins the HR data: ' + r.d.results.length);
r = await call('admin', 'GET', '/camps/qrcheck/admin/results?checkId=' + C1 + '&result=fail'); ok(r.d.results.length === 2, 'filter by check and result');
r = await call('admin', 'GET', '/camps/qrcheck/admin/results?q=AKA-0042'); ok(r.d.results.length === 1 && r.d.results[0].reference === 'AKA-0042', 'search by badge reference');
r = await call('s1', 'GET', '/camps/qrcheck/admin/results'); ok(r.s === 403, 'officer cannot list all results');
// scan = look up AND record "ตรวจแล้ว" in one step
r = await call('s2', 'POST', '/camps/qrcheck/scan', { studentId: '6740102221', checkId: CAKA });
ok(r.s === 200 && r.d.justRecorded === true && r.d.result.result === 'pass' && r.d.result.checked_by === 'sb6740102221@lru.ac.th' && r.d.student.departmentName === 'ฝ่ายสวัสดิการ', 'scan: found in the HR data and recorded as checked at once');
r = await call('s2', 'POST', '/camps/qrcheck/scan', { studentId: '6740102221', checkId: CAKA });
ok(r.s === 200 && r.d.justRecorded === false && r.d.result.checked_by === 'sb6740102221@lru.ac.th', 'scanning the same QR again changes nothing (already checked, who/when kept)');
r = await call('s1', 'POST', '/camps/qrcheck/scan', { studentId: '6740102221', checkId: CAKA });
ok(r.d.justRecorded === false && r.d.result.checked_by === 'sb6740102221@lru.ac.th', 'another officer scanning it does not overwrite the first check');
r = await call('s2', 'POST', '/camps/qrcheck/scan', { studentId: '6840100001', checkId: CAKA });
ok(r.s === 200 && r.d.justRecorded === false && r.d.blocked && r.d.result === null, 'scan of a student with no department: shown but NOT recorded when the check requires a department');
r = await call('s2', 'POST', '/camps/qrcheck/scan', { studentId: '9999999999', checkId: CAKA }); ok(r.s === 404 && r.d.code === 'NOT_FOUND', 'scan: QR not in the registration database -> 404, nothing recorded');
ok(db.prepare("select count(*) c from camp_qr_results where student_id in ('9999999999')").get().c === 0, 'nothing is stored for an unknown QR');
r = await call('s2', 'POST', '/camps/qrcheck/scan', { studentId: 'hello', checkId: CAKA }); ok(r.s === 400, 'scan: not a student QR -> 400');
r = await call('s2', 'POST', '/camps/qrcheck/scan', { studentId: '6740102221' }); ok(r.s === 400 && r.d.code === 'NO_CHECK', 'scan: a check must be chosen');
r = await call('gmail', 'POST', '/camps/qrcheck/scan', { studentId: '6740102221', checkId: CAKA }); ok(r.s === 403, 'scan: unassigned account refused');
r = await call('s2', 'POST', '/camps/qrcheck/scan', { studentId: '6840100001', checkId: C2 });
ok(r.s === 400, 'scan: an inactive check cannot be used');
r = await call('admin', 'DELETE', '/camps/qrcheck/admin/officers/sb6740102220%40lru.ac.th'); ok(r.s === 200, 'remove officer');
r = await call('s1', 'GET', '/camps/qrcheck/me'); ok(r.s === 403, 'removed officer is blocked');
ok(db.prepare("select count(*) c from budget_audit_logs where entity_type='qrcheck'").get().c >= 8, 'actions are audited');
console.log(fl ? fl + ' FAILED' : `all ${pass} qrcheck checks passed`);
process.exit(fl ? 1 : 0);
