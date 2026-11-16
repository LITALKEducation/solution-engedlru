// แบบสำรวจโรงเรียน API: an admin picks a student by id and fills in the school-survey form of that student's ฝ่าย.
import { makeEnv, installFetch } from './env.mjs';
const { survey } = await import('../src/handlers/survey.js');
const { SURVEY_FORMS } = await import('../src/lib/survey-forms.js');
installFetch(); const { db, env } = makeEnv();
let pass = 0, fl = 0; const ok = (c, m) => { if (c) pass++; else { fl++; console.log('  FAIL:', m); } };
async function call(who, method, path, body) {
  const url = new URL('https://api.x' + path); const h = { Origin: 'https://enged.sorasukt.com' }; if (who) h.Authorization = 'Bearer ' + who; if (body) h['Content-Type'] = 'application/json';
  const r = await survey(new Request(url, { method, headers: h, body: body ? JSON.stringify(body) : undefined }), env, url);
  return { s: r.status, d: await r.json().catch(() => null) };
}
db.exec(`INSERT INTO camp_students (student_id,name,year,gender) VALUES ('6740102220','นายสมชาย ใจดี',3,'M'),('6740102221','นางสาวสมหญิง รักเรียน',2,'F'),('6840100001','นางสาวมือใหม่ ไม่มีฝ่าย',1,'F');
 INSERT INTO camp_selections (student_id,department_code,year,gender) VALUES ('6740102220','teaching',3,'M'),('6740102221','welfare',2,'F');`);
const form = (n, over = {}) => ({ studentId: '6740102220', schoolName: 'โรงเรียนบ้านทดสอบ', surveyDate: '2026-12-05', coordinator: 'ครูสมศรี', phone: '081-234-5678', checks: Array.from({ length: n }, (_, i) => i < 3), notes: Array.from({ length: n }, (_, i) => (i === 1 ? 'มีห้องประชุมใหญ่' : '')), summary: 'ต้องกลับไปสำรวจเพิ่ม', surveyor: 'นายสมชาย ใจดี', ...over });

// the five printed forms
ok(Object.keys(SURVEY_FORMS).join() === 'direction,structure,community,teaching,welfare', 'one form per ฝ่าย code');
ok(Object.values(SURVEY_FORMS).map((f) => f.items.length).join() === '15,16,16,16,18', 'item counts match the printed forms');
ok(Object.values(SURVEY_FORMS).every((f) => f.name.startsWith('ฝ่าย') && f.en && f.blurb && f.items.every((t) => t.length > 5)), 'every form has names, a blurb and non-empty items');

// admin only
let r = await call(null, 'GET', '/camps/survey/admin/templates'); ok(r.s === 401, 'templates: anonymous 401');
r = await call('s1', 'GET', '/camps/survey/admin/templates'); ok(r.s === 403, 'templates: student refused');
r = await call('admin', 'GET', '/camps/survey/admin/templates'); ok(r.s === 200 && r.d.forms.teaching.items.length === 16 && r.d.title === 'แบบสำรวจโรงเรียน', 'admin gets the templates');
r = await call('s1', 'GET', '/camps/survey/admin/student?id=6740102220'); ok(r.s === 403, 'student lookup: student refused');
r = await call('s1', 'POST', '/camps/survey/admin/save', form(16)); ok(r.s === 403, 'save: student refused');
r = await call('s1', 'POST', '/camps/survey/admin/delete', { studentId: '6740102220' }); ok(r.s === 403, 'delete: student refused');
r = await call('s1', 'GET', '/camps/survey/admin/list'); ok(r.s === 403, 'list: student refused');

// pick a student by id
r = await call('admin', 'GET', '/camps/survey/admin/student?id=12'); ok(r.s === 400, 'short id rejected');
r = await call('admin', 'GET', '/camps/survey/admin/student?id=9999999999'); ok(r.s === 404 && r.d.code === 'NOT_IN_ROSTER', 'unknown student id');
r = await call('admin', 'GET', '/camps/survey/admin/student?id=' + encodeURIComponent('๖๗๔๐๑๐๒๒๒๐')); ok(r.s === 200 && r.d.student.name === 'นายสมชาย ใจดี', 'Thai digits are accepted');
r = await call('admin', 'GET', '/camps/survey/admin/student?id=6740102220');
ok(r.d.student.departmentCode === 'teaching' && r.d.template.name === 'ฝ่ายการสอน' && r.d.template.items.length === 16 && r.d.form === null && r.d.saved === false, 'student with a ฝ่าย gets that ฝ่าย\'s empty form');
r = await call('admin', 'GET', '/camps/survey/admin/student?id=6740102221'); ok(r.d.template.name === 'ฝ่ายสวัสดิการ' && r.d.template.items.length === 18, 'a different ฝ่าย gets a different form');
r = await call('admin', 'GET', '/camps/survey/admin/student?id=6840100001'); ok(r.s === 200 && r.d.code === 'NO_DEPARTMENT' && r.d.template === null, 'student without a ฝ่าย: no form');

// save
r = await call('admin', 'POST', '/camps/survey/admin/save', form(16, { studentId: '9999999999' })); ok(r.s === 404, 'save: unknown student');
r = await call('admin', 'POST', '/camps/survey/admin/save', form(16, { studentId: '6840100001' })); ok(r.s === 409 && r.d.code === 'NO_DEPARTMENT', 'save: student without a ฝ่าย refused');
r = await call('admin', 'POST', '/camps/survey/admin/save', form(15)); ok(r.s === 400, 'save: wrong number of ticks refused');
r = await call('admin', 'POST', '/camps/survey/admin/save', form(16, { notes: ['x'] })); ok(r.s === 400, 'save: wrong number of notes refused');
r = await call('admin', 'POST', '/camps/survey/admin/save', form(16, { surveyDate: '05/12/2026' })); ok(r.s === 400, 'save: bad date refused');
r = await call('admin', 'POST', '/camps/survey/admin/save', form(16, { schoolName: 'ก'.repeat(151) })); ok(r.s === 400, 'save: school name max 150');
r = await call('admin', 'POST', '/camps/survey/admin/save', form(16, { summary: 'ก'.repeat(2001) })); ok(r.s === 400, 'save: summary max 2000');
r = await call('admin', 'POST', '/camps/survey/admin/save', form(16, { notes: Array(16).fill('ก'.repeat(301)) })); ok(r.s === 400, 'save: note max 300');
r = await call('admin', 'POST', '/camps/survey/admin/save', form(16, { schoolName: '  โรงเรียนบ้านทดสอบ  ' }));
ok(r.s === 200 && r.d.form.schoolName === 'โรงเรียนบ้านทดสอบ' && r.d.form.checks.filter(Boolean).length === 3 && r.d.form.notes[1] === 'มีห้องประชุมใหญ่' && r.d.form.surveyDate === '2026-12-05', 'save: stored and trimmed');
ok(db.prepare('select department_code d from camp_school_survey').get().d === 'teaching', 'the form is stored under the student\'s ฝ่าย');
r = await call('admin', 'GET', '/camps/survey/admin/student?id=6740102220'); ok(r.d.saved === true && r.d.form.coordinator === 'ครูสมศรี' && r.d.form.phone === '081-234-5678' && r.d.form.summary === 'ต้องกลับไปสำรวจเพิ่ม' && r.d.form.surveyor === 'นายสมชาย ใจดี', 'reload returns every saved field');
r = await call('admin', 'POST', '/camps/survey/admin/save', form(16, { checks: Array(16).fill(true), summary: 'เสร็จแล้ว' })); ok(r.s === 200 && r.d.form.checks.every(Boolean) && r.d.form.summary === 'เสร็จแล้ว', 'save again updates the same form');
ok(db.prepare('select count(*) c from camp_school_survey').get().c === 1, 'one form per student');
ok(db.prepare("select count(*) c from budget_audit_logs where entity_type='survey' and action='SURVEY_SAVE'").get().c === 2, 'saves are audited');

// the student moves ฝ่าย: the saved ticks no longer fit, the page gets the new ฝ่าย's form padded to its length
db.exec("UPDATE camp_selections SET department_code='direction' WHERE student_id='6740102220'");
r = await call('admin', 'GET', '/camps/survey/admin/student?id=6740102220'); ok(r.d.template.name === 'ฝ่ายอำนวยการ' && r.d.form.checks.length === 15, 'after a ฝ่าย change the form follows the new ฝ่าย');
db.exec("UPDATE camp_selections SET department_code='teaching' WHERE student_id='6740102220'");

// list + delete
await call('admin', 'POST', '/camps/survey/admin/save', form(18, { studentId: '6740102221', schoolName: 'โรงเรียนสอง' }));
r = await call('admin', 'GET', '/camps/survey/admin/list'); ok(r.d.forms.length === 2 && r.d.forms[0].departmentCode === 'teaching' && r.d.forms[1].departmentCode === 'welfare', 'list: ฝ่าย order');
ok(r.d.forms[0].done === 16 && r.d.forms[0].total === 16 && r.d.forms[1].done === 3 && r.d.forms[1].total === 18 && r.d.forms[1].schoolName === 'โรงเรียนสอง', 'list: progress counts');
r = await call('admin', 'GET', '/camps/survey/admin/list?department=welfare'); ok(r.d.forms.length === 1 && r.d.forms[0].studentId === '6740102221', 'list: filter by ฝ่าย');
r = await call('admin', 'POST', '/camps/survey/admin/delete', { studentId: '9999999999' }); ok(r.s === 404, 'delete: nothing to delete');
r = await call('admin', 'POST', '/camps/survey/admin/delete', { studentId: '6740102221' }); ok(r.s === 200, 'admin deletes a form');
r = await call('admin', 'GET', '/camps/survey/admin/list'); ok(r.d.forms.length === 1, 'deleted form is gone');
r = await call('admin', 'GET', '/camps/survey/nope'); ok(r.s === 404, 'unknown route 404');


// ---------- assigned students fill in their own form (public page /hr/survey) ----------
const { parseStudentEmail } = await import('../src/handlers/survey.js');
ok(parseStudentEmail('sb6740102220@lru.ac.th') === '6740102220' && parseStudentEmail('x@gmail.com') === null, 'student id comes from the university email');
r = await call(null, 'GET', '/camps/survey/me'); ok(r.s === 401, 'me: anonymous 401');
r = await call('gmail', 'GET', '/camps/survey/me'); ok(r.d.reason === 'not_university_email', 'me: gmail is not a university email');
r = await call('unverified', 'GET', '/camps/survey/me'); ok(r.d.reason === 'email_not_verified', 'me: unverified email');
r = await call('other', 'GET', '/camps/survey/me'); ok(r.d.reason === 'not_in_roster', 'me: not in the roster');
r = await call('s1', 'GET', '/camps/survey/me'); ok(r.s === 200 && r.d.assigned === false && r.d.student.name === 'นายสมชาย ใจดี' && !r.d.template, 'me: a student who is not assigned gets no form');
r = await call('s1', 'POST', '/camps/survey/save', form(16)); ok(r.s === 403 && r.d.code === 'NOT_ASSIGNED', 'save: not assigned -> refused');
r = await call('gmail', 'POST', '/camps/survey/save', form(16)); ok(r.s === 403 && r.d.code === 'NOT_STUDENT', 'save: non-university account refused');
r = await call('other', 'POST', '/camps/survey/save', form(16)); ok(r.s === 403 && r.d.code === 'NOT_IN_ROSTER', 'save: student not in the roster refused');
// admin assigns
r = await call('s1', 'POST', '/camps/survey/admin/assign', { studentId: '6740102220' }); ok(r.s === 403, 'assign: student refused');
r = await call('admin', 'POST', '/camps/survey/admin/assign', { studentId: '9999999999' }); ok(r.s === 404, 'assign: unknown student');
r = await call('admin', 'GET', '/camps/survey/admin/student?id=6740102220'); ok(r.d.assigned === false, 'admin lookup: not assigned yet');
r = await call('admin', 'POST', '/camps/survey/admin/assign', { studentId: '6740102220' }); ok(r.s === 200 && r.d.assigned === true, 'admin assigns a student');
r = await call('admin', 'POST', '/camps/survey/admin/assign', { studentId: '6740102220' }); ok(r.s === 200, 'assigning twice is harmless');
ok(db.prepare('select count(*) c from camp_survey_assignees').get().c === 1, 'one assignment row per student');
r = await call('admin', 'GET', '/camps/survey/admin/student?id=6740102220'); ok(r.d.assigned === true, 'admin lookup: assigned');
// the assigned student sees their own ฝ่าย's form with the saved answers
r = await call('s1', 'GET', '/camps/survey/me');
ok(r.d.assigned === true && r.d.template.name === 'ฝ่ายการสอน' && r.d.template.items.length === 16 && r.d.texts.title === 'แบบสำรวจโรงเรียน' && r.d.saved === true && r.d.form.schoolName === 'โรงเรียนบ้านทดสอบ', 'me: assigned student gets the form (with what an admin saved)');
r = await call('s1', 'POST', '/camps/survey/save', form(16, { schoolName: 'โรงเรียนที่นักศึกษากรอก', studentId: '6740102221', checks: Array(16).fill(false) }));
ok(r.s === 200 && r.d.form.studentId === '6740102220' && r.d.form.schoolName === 'โรงเรียนที่นักศึกษากรอก', 'a student can only save their own form (studentId in the body is ignored)');
ok(db.prepare("select updated_by u from camp_school_survey where student_id='6740102220'").get().u === 'sb6740102220@lru.ac.th', 'updated_by records the student');
r = await call('s1', 'POST', '/camps/survey/save', form(15)); ok(r.s === 400, 'student save: wrong number of ticks refused');
r = await call('s1', 'POST', '/camps/survey/save', form(16, { surveyDate: 'x' })); ok(r.s === 400, 'student save: bad date refused');
r = await call('s2', 'POST', '/camps/survey/save', form(18)); ok(r.s === 403 && r.d.code === 'NOT_ASSIGNED', 'another student is still refused');
r = await call('admin', 'GET', '/camps/survey/admin/list'); ok(r.d.assignees.length === 1 && r.d.assignees[0].studentId === '6740102220' && r.d.assignees[0].hasForm === true && r.d.assignees[0].departmentName === 'ฝ่ายการสอน', 'admin list shows the assignees');
// assigned but no ฝ่าย yet
await call('admin', 'POST', '/camps/survey/admin/assign', { studentId: '6840100001' });
r = await call('admin', 'POST', '/camps/survey/admin/assign', { studentId: '6840100001', assigned: false }); ok(r.s === 200 && r.d.assigned === false, 'admin takes the assignment away');
r = await call('admin', 'POST', '/camps/survey/admin/assign', { studentId: '6840100001' });
// a student without a ฝ่าย who is assigned: told to pick a ฝ่าย first
r = await call('y1', 'GET', '/camps/survey/me'); ok(r.d.assigned === true && r.d.code === 'NO_DEPARTMENT' && r.d.template === null, 'assigned student without a ฝ่าย gets NO_DEPARTMENT');
r = await call('y1', 'POST', '/camps/survey/save', form(16)); ok(r.s === 409 && r.d.code === 'NO_DEPARTMENT', 'student save without a ฝ่าย refused');
r = await call('admin', 'POST', '/camps/survey/admin/assign', { studentId: '6740102220', assigned: false }); ok(r.s === 200, 'admin removes the assignment');
r = await call('s1', 'POST', '/camps/survey/save', form(16)); ok(r.s === 403 && r.d.code === 'NOT_ASSIGNED', 'after removal the student can no longer save');
r = await call('s1', 'GET', '/camps/survey/me'); ok(r.d.assigned === false, 'after removal the student sees no form');
ok(db.prepare("select count(*) c from budget_audit_logs where action in ('SURVEY_ASSIGN','SURVEY_UNASSIGN')").get().c >= 4, 'assignments are audited');

console.log(`survey: ${pass} passed, ${fl} failed`); process.exit(fl ? 1 : 0);
