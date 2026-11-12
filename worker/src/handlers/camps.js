// Camps · ฝ่ายบุคคล: students sign in with Google (university email), pick one department;
// admins manage the roster (student id → name + year + gender) and per-department / per-year / per-gender quotas.
import { json } from "../lib/cors.js";
import { getAuth0UserFromRequest, getAuth0Roles } from "../lib/auth0.js";

const fail = (request, env, message, status = 400, extra = {}) => json(request, env, { error: message, ...extra }, status);
// Thai-safe text: NFC, no zero-width marks, NBSP -> space, collapsed spaces; Thai digits (๐-๙) -> 0-9 for ids / years
const tidy = (s) => String(s ?? "").normalize("NFC").replace(/[\u200b-\u200d\u2060\ufeff]/g, "").replace(/[\u00a0\u2007\u202f\u3000]/g, " ").replace(/[ \t]+/g, " ").trim();
const asciiDigits = (s) => String(s ?? "").replace(/[๐-๙]/g, (c) => String(c.charCodeAt(0) - 0x0e50));
const clean = (s, max = 200) => tidy(s).slice(0, max);
const YEARS = [1, 2, 3, 4];
const GENDERS = ["M", "F"]; // M = ชาย, F = หญิง
const STATES = ["pending", "open", "closed"];

// sb6740102220@lru.ac.th -> { type: "sb", studentId: "6740102220" }
export function parseStudentEmail(email) {
  const m = /^([a-z]{2})(\d{6,12})@lru\.ac\.th$/i.exec(String(email || "").trim());
  return m ? { type: m[1].toLowerCase(), studentId: m[2] } : null;
}
// Accept "6740102220" or "sb6740102220@lru.ac.th" when an admin types a student.
function normalizeStudentId(v) {
  const s = asciiDigits(tidy(v));
  const p = parseStudentEmail(s);
  if (p) return p.studentId;
  return /^\d{6,12}$/.test(s) ? s : null;
}
// ชาย/หญิง/M/F/male/female ... -> "M" | "F" | null
export function normalizeGender(v) {
  const s = tidy(v).toLowerCase().replace(/\.$/, "");
  if (["m", "male", "man", "boy", "ชาย", "ช", "นาย", "เด็กชาย", "ด.ช"].includes(s)) return "M";
  if (["f", "female", "woman", "girl", "หญิง", "ญ", "นาง", "นางสาว", "น.ส", "นส", "เด็กหญิง", "ด.ญ"].includes(s)) return "F";
  return null;
}
// Fallback when a roster has no gender column: Thai titles in front of the name.
export function genderFromName(name) {
  const n = tidy(name);
  if (/^(นาย|เด็กชาย|ด\.\s?ช\.?)/.test(n)) return "M";
  if (/^(นางสาว|นาง|น\.\s?ส\.?|นส\.|เด็กหญิง|ด\.\s?ญ\.?)/.test(n)) return "F";
  return null;
}
// "ปี 3" / "3" / "Y3" -> 3 (1-4) | null
function parseYear(v) {
  const m = /^(?:ชั้นปีที่|ชั้นปี|ปีที่|ปี|year|y)?\s*([1-4])$/i.exec(asciiDigits(tidy(v)));
  return m ? Number(m[1]) : null;
}

// Small RFC-4180-ish CSV reader: quotes, "" escapes, newlines in quotes, BOM, delimiter auto-detect (, ; tab).
export function parseCsv(text) {
  const src = String(text ?? "").replace(/^﻿/, "");
  const first = src.split(/\r?\n/).find((l) => l.trim()) || "";
  const count = (c) => first.split(c).length - 1;
  const delim = count("\t") >= Math.max(count(","), count(";")) && count("\t") > 0 ? "\t" : count(";") > count(",") ? ";" : ",";
  const rows = []; let row = [], cell = "", q = false, line = 1, rowLine = 1;
  const endCell = () => { row.push(tidy(cell)); cell = ""; };
  const endRow = () => { endCell(); if (row.some((c) => c !== "")) rows.push({ line: rowLine, cells: row }); row = []; rowLine = line + 1; };
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (q) {
      if (ch === '"') { if (src[i + 1] === '"') { cell += '"'; i++; } else q = false; }
      else { if (ch === "\n") line++; cell += ch; }
    } else if (ch === '"' && cell === "") q = true;
    else if (ch === delim) endCell();
    else if (ch === "\n") { endRow(); line++; rowLine = line; }
    else if (ch === "\r") { /* ignore */ }
    else cell += ch;
  }
  if (cell !== "" || row.length) endRow();
  return rows;
}
const HEADER_KEYS = {
  id: /^(รหัส|รหัสนักศึกษา|รหัสประจำตัว|รหัสประจำตัวนักศึกษา|เลขประจำตัว|เลขประจำตัวนักศึกษา|เลขที่นักศึกษา|student[_ ]?id|studentid|id|code)$/i,
  name: /^(ชื่อ|ชื่อ\s*[-–—]?\s*(นามสกุล|สกุล)|ชื่อและนามสกุล|ชื่อสกุล|ชื่อจริง|name|fullname|full[_ ]name|first[_ ]?name)$/i,
  last: /^(นามสกุล|สกุล|last[_ ]?name|surname|family[_ ]?name)$/i,
  prefix: /^(คำนำหน้า|คำนำหน้าชื่อ|คำนำหน้านาม|title|prefix)$/i,
  year: /^(ชั้นปี|ชั้นปีที่|ชั้น|ปี|ปีที่|ปีการศึกษา|year|level)$/i,
  gender: /^(เพศ|gender|sex)$/i,
  dept: /^(ฝ่าย|department|dept)$/i
};

// "teaching" | "ฝ่ายการสอน" | "การสอน" -> department code (null when unknown)
function resolveDept(depList, v) {
  const s = String(v ?? "").trim().toLowerCase(); if (!s) return null;
  const strip = (x) => String(x).replace(/^ฝ่าย\s*/, "").trim().toLowerCase();
  const d = depList.find((d) => d.code === s || d.name.toLowerCase() === s || strip(d.name) === strip(s));
  return d ? d.code : null;
}
const upsertSelectionStmt = (env, id, code, year, gender) => env.DB.prepare(
  `INSERT INTO camp_selections (student_id,department_code,year,gender,selected_at) VALUES (?,?,?,?,datetime('now'))
   ON CONFLICT(student_id) DO UPDATE SET department_code=excluded.department_code,year=excluded.year,gender=excluded.gender,selected_at=excluded.selected_at`).bind(id, code, year, gender);

async function registrationState(env) {
  const r = await env.DB.prepare("SELECT value FROM camp_settings WHERE key='registration_state'").first();
  return STATES.includes(r?.value) ? r.value : "pending";
}

async function audit(env, w, action, entityId, metadata = {}) {
  await env.DB.prepare("INSERT INTO budget_audit_logs (uuid,actor_auth0_id,actor_email,action,entity_type,entity_uuid,metadata) VALUES (?,?,?,?,?,?,?)")
    .bind(crypto.randomUUID(), w.user.sub, w.email || "unknown", action, "camp", entityId || null, JSON.stringify(metadata)).run();
}

// Resolve the signed-in Google user.
async function who(request, env) {
  const a = await getAuth0UserFromRequest(request, env);
  if (!a.user) {
    return { response: a.unavailable
      ? fail(request, env, "ระบบยืนยันตัวตน (Auth0) ไม่ว่างชั่วคราว กรุณาลองใหม่อีกครั้ง", 503, { code: "AUTH_UNAVAILABLE" })
      : fail(request, env, "Unauthorized", 401) };
  }
  const email = String(a.user.email || "").toLowerCase();
  return { user: a.user, email, verified: a.user.email_verified === true, parsed: parseStudentEmail(email) };
}
const ADMIN_ROLES = ["camp_admin", "budget_admin"];
async function adminStatus(env, user, strict) {
  try {
    const roles = await getAuth0Roles(env, user.sub);
    return roles.some((r) => ADMIN_ROLES.includes(r));
  } catch (e) {
    console.error("[camps] role lookup failed:", e?.message || e);
    if (strict) throw e;
    return false;
  }
}
async function requireAdmin(request, env) {
  const w = await who(request, env);
  if (w.response) return w;
  let ok;
  try { ok = await adminStatus(env, w.user, true); }
  catch (e) { return { response: fail(request, env, "ตรวจสอบสิทธิ์ผู้ดูแลไม่ได้ (Auth0 Role) กรุณาลองใหม่", 503, { code: "AUTH0_ROLE_LOOKUP_FAILED" }) }; }
  if (!ok) return { response: fail(request, env, "ต้องใช้สิทธิ์ผู้ดูแล (camp_admin หรือ budget_admin)", 403) };
  return w;
}

// ---------- public ----------
async function status(request, env) {
  return json(request, env, { registration: await registrationState(env) });
}

const grid = () => ({ M: { 1: 0, 2: 0, 3: 0, 4: 0 }, F: { 1: 0, 2: 0, 3: 0, 4: 0 } });
async function departmentsWithSlots(env) {
  const [deps, quotas, filled] = await Promise.all([
    env.DB.prepare("SELECT code,name,description,sort_order,head_name,head_contact FROM camp_departments ORDER BY sort_order").all(),
    env.DB.prepare("SELECT department_code,gender,year,quota FROM camp_quotas").all(),
    env.DB.prepare("SELECT department_code,gender,year,COUNT(*) c FROM camp_selections GROUP BY department_code,gender,year").all()
  ]);
  const q = {}, f = {};
  for (const r of quotas.results || []) if (GENDERS.includes(r.gender)) (q[r.department_code] ||= grid())[r.gender][r.year] = r.quota;
  for (const r of filled.results || []) if (GENDERS.includes(r.gender)) (f[r.department_code] ||= grid())[r.gender][r.year] = r.c;
  return (deps.results || []).map((d) => {
    const quota = q[d.code] || grid(), fill = f[d.code] || grid(), remaining = grid();
    for (const g of GENDERS) for (const y of YEARS) remaining[g][y] = Math.max(0, quota[g][y] - fill[g][y]);
    return { code: d.code, name: d.name, description: d.description, head: { name: d.head_name || "", contact: d.head_contact || "" }, quota, filled: fill, remaining };
  });
}
async function departments(request, env) {
  const [list, reg] = await Promise.all([departmentsWithSlots(env), registrationState(env)]);
  return json(request, env, { registration: reg, departments: list });
}

// ---------- student ----------
async function me(request, env) {
  const w = await who(request, env); if (w.response) return w.response;
  const [admin, reg] = await Promise.all([adminStatus(env, w.user, false), registrationState(env)]);
  let reason = null, student = null, selection = null;
  if (!w.parsed) reason = "not_university_email";
  else if (!w.verified) reason = "email_not_verified";
  else {
    student = await env.DB.prepare("SELECT student_id,name,year,gender FROM camp_students WHERE student_id=?").bind(w.parsed.studentId).first();
    if (!student) reason = "not_in_roster";
    else if (!student.gender) reason = "no_gender";
    if (student) selection = await env.DB.prepare("SELECT department_code,selected_at FROM camp_selections WHERE student_id=?").bind(student.student_id).first();
  }
  return json(request, env, {
    email: w.email, googleName: w.user.name || "", isAdmin: admin, registration: reg,
    studentId: w.parsed?.studentId || null, student, selection, reason
  });
}

async function eligibleStudent(request, env) {
  const w = await who(request, env); if (w.response) return { response: w.response };
  if (!w.parsed) return { response: fail(request, env, "ต้องใช้อีเมลมหาวิทยาลัย (@lru.ac.th)", 403, { reason: "not_university_email" }) };
  if (!w.verified) return { response: fail(request, env, "อีเมลนี้ยังไม่ได้รับการยืนยัน", 403, { reason: "email_not_verified" }) };
  const student = await env.DB.prepare("SELECT student_id,name,year,gender FROM camp_students WHERE student_id=?").bind(w.parsed.studentId).first();
  if (!student) return { response: fail(request, env, `ไม่พบรหัสนักศึกษา ${w.parsed.studentId} ในรายชื่อ กรุณาติดต่อผู้ดูแล`, 403, { reason: "not_in_roster" }) };
  if (!student.gender) return { response: fail(request, env, "ผู้ดูแลยังไม่ได้ระบุเพศของคุณในรายชื่อ กรุณาติดต่อผู้ดูแล", 403, { reason: "no_gender" }) };
  return { w, student };
}

const GL = { M: "ชาย", F: "หญิง" };
async function select(request, env) {
  const r = await eligibleStudent(request, env); if (r.response) return r.response;
  const { w, student } = r;
  const state = await registrationState(env);
  if (state !== "open") return fail(request, env, state === "pending" ? "ยังไม่เปิดให้ลงทะเบียน" : "ปิดลงทะเบียนแล้ว", 403, { registration: state });
  const b = await request.json().catch(() => null);
  const code = clean(b?.departmentCode, 40);
  const dep = await env.DB.prepare("SELECT code,name FROM camp_departments WHERE code=?").bind(code).first();
  if (!dep) return fail(request, env, "ไม่พบฝ่ายนี้", 404);
  const cur = await env.DB.prepare("SELECT department_code FROM camp_selections WHERE student_id=?").bind(student.student_id).first();
  if (cur?.department_code === code) return json(request, env, { ok: true, unchanged: true });
  // One atomic statement: insert/switch only while the department still has a free slot for this year and gender.
  const res = await env.DB.prepare(
    `INSERT INTO camp_selections (student_id,department_code,year,gender,selected_at)
     SELECT ?,?,?,?,datetime('now')
     WHERE (SELECT COUNT(*) FROM camp_selections WHERE department_code=? AND year=? AND gender=?)
         < COALESCE((SELECT quota FROM camp_quotas WHERE department_code=? AND year=? AND gender=?),0)
     ON CONFLICT(student_id) DO UPDATE SET department_code=excluded.department_code,year=excluded.year,gender=excluded.gender,selected_at=excluded.selected_at`
  ).bind(student.student_id, code, student.year, student.gender, code, student.year, student.gender, code, student.year, student.gender).run();
  if (!res?.meta?.changes) return fail(request, env, `${dep.name} เต็มแล้วสำหรับ${GL[student.gender]}ชั้นปี ${student.year}`, 409, { code: "FULL" });
  await audit(env, w, "CAMP_SELECT", student.student_id, { department: code, year: student.year, gender: student.gender, from: cur?.department_code || null });
  return json(request, env, { ok: true });
}

async function unselect(request, env) {
  const r = await eligibleStudent(request, env); if (r.response) return r.response;
  const state = await registrationState(env);
  if (state !== "open") return fail(request, env, "ตอนนี้ยกเลิกการลงทะเบียนไม่ได้ (ไม่ได้เปิดลงทะเบียนอยู่)", 403, { registration: state });
  await env.DB.prepare("DELETE FROM camp_selections WHERE student_id=?").bind(r.student.student_id).run();
  await audit(env, r.w, "CAMP_UNSELECT", r.student.student_id);
  return json(request, env, { ok: true });
}

// ---------- admin ----------
async function adminOverview(request, env) {
  const a = await requireAdmin(request, env); if (a.response) return a.response;
  const [deps, reg, byYear, selected] = await Promise.all([
    departmentsWithSlots(env), registrationState(env),
    env.DB.prepare("SELECT gender,year,COUNT(*) c FROM camp_students GROUP BY gender,year").all(),
    env.DB.prepare("SELECT COUNT(*) c FROM camp_selections").first()
  ]);
  const students = grid();
  for (const r of byYear.results || []) if (students[r.gender]) students[r.gender][r.year] = r.c;
  return json(request, env, { registration: reg, departments: deps, students, selectedTotal: selected?.c || 0 });
}

async function adminSetState(request, env) {
  const a = await requireAdmin(request, env); if (a.response) return a.response;
  const b = await request.json().catch(() => null);
  if (!STATES.includes(b?.registration)) return fail(request, env, "สถานะไม่ถูกต้อง");
  await env.DB.prepare("INSERT INTO camp_settings (key,value) VALUES ('registration_state',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(b.registration).run();
  await audit(env, a, "CAMP_STATE", null, { registration: b.registration });
  return json(request, env, { ok: true });
}

// body: { departmentCode, quotas: { M: {1:n,2:n,3:n,4:n}, F: {...} } }
// department info: head (หัวหน้าฝ่าย) name + contact, and the description shown in the student preview
async function adminSetDepartment(request, env) {
  const a = await requireAdmin(request, env); if (a.response) return a.response;
  const b = await request.json().catch(() => null);
  const code = clean(b?.departmentCode, 40);
  const dep = await env.DB.prepare("SELECT code,name,description FROM camp_departments WHERE code=?").bind(code).first();
  if (!dep) return fail(request, env, "ไม่พบฝ่ายนี้", 404);
  const headName = clean(b?.headName, 120), headContact = clean(b?.headContact, 200), description = clean(b?.description ?? dep.description, 400);
  if (!description) return fail(request, env, "หน้าที่ของฝ่ายต้องไม่ว่าง");
  await env.DB.prepare("UPDATE camp_departments SET head_name=?,head_contact=?,description=? WHERE code=?").bind(headName || null, headContact || null, description, code).run();
  await audit(env, a, "CAMP_DEPARTMENT", code, { headName, headContact });
  return json(request, env, { ok: true });
}
async function adminSetQuota(request, env) {
  const a = await requireAdmin(request, env); if (a.response) return a.response;
  const b = await request.json().catch(() => null);
  const code = clean(b?.departmentCode, 40);
  const dep = await env.DB.prepare("SELECT code,name FROM camp_departments WHERE code=?").bind(code).first();
  if (!dep) return fail(request, env, "ไม่พบฝ่ายนี้", 404);
  const quotas = grid();
  for (const g of GENDERS) for (const y of YEARS) {
    const n = Number(b?.quotas?.[g]?.[y]);
    if (!Number.isInteger(n) || n < 0 || n > 9999) return fail(request, env, `จำนวนของ${GL[g]}ชั้นปี ${y} ต้องเป็นเลขจำนวนเต็ม 0–9999`);
    quotas[g][y] = n;
  }
  const filled = await env.DB.prepare("SELECT gender,year,COUNT(*) c FROM camp_selections WHERE department_code=? GROUP BY gender,year").bind(code).all();
  for (const r of filled.results || []) {
    if (quotas[r.gender]?.[r.year] < r.c) return fail(request, env, `${GL[r.gender]}ชั้นปี ${r.year} ของ${dep.name}มีผู้ลงทะเบียนแล้ว ${r.c} คน ตั้งต่ำกว่านี้ไม่ได้ (ล้างการลงทะเบียนของบางคนก่อน)`, 409);
  }
  const stmts = [];
  for (const g of GENDERS) for (const y of YEARS) stmts.push(env.DB.prepare("INSERT INTO camp_quotas (department_code,gender,year,quota) VALUES (?,?,?,?) ON CONFLICT(department_code,gender,year) DO UPDATE SET quota=excluded.quota").bind(code, g, y, quotas[g][y]));
  await env.DB.batch(stmts);
  await audit(env, a, "CAMP_QUOTA", code, { quotas });
  return json(request, env, { ok: true });
}

async function adminStudents(request, env, url) {
  const a = await requireAdmin(request, env); if (a.response) return a.response;
  const q = clean(url.searchParams.get("q"), 80).toLowerCase();
  const year = Number(url.searchParams.get("year")), gender = url.searchParams.get("gender");
  const where = ["1=1"], p = [];
  if (q) { where.push("(lower(s.name) LIKE ? OR s.student_id LIKE ?)"); p.push(`%${q}%`, `%${q}%`); }
  if (YEARS.includes(year)) { where.push("s.year=?"); p.push(year); }
  if (GENDERS.includes(gender)) { where.push("s.gender=?"); p.push(gender); }
  const rows = await env.DB.prepare(
    `SELECT s.student_id,s.name,s.year,s.gender,sel.department_code,d.name department_name
     FROM camp_students s LEFT JOIN camp_selections sel ON sel.student_id=s.student_id LEFT JOIN camp_departments d ON d.code=sel.department_code
     WHERE ${where.join(" AND ")} ORDER BY s.year,s.student_id LIMIT 2000`).bind(...p).all();
  return json(request, env, { students: rows.results || [] });
}

function upsertStudentStmt(env, id, name, year, gender) {
  return env.DB.prepare("INSERT INTO camp_students (student_id,name,year,gender) VALUES (?,?,?,?) ON CONFLICT(student_id) DO UPDATE SET name=excluded.name,year=excluded.year,gender=excluded.gender,updated_at=datetime('now')").bind(id, name, year, gender);
}
const syncSelectionStmt = (env, id, year, gender) => env.DB.prepare("UPDATE camp_selections SET year=?,gender=? WHERE student_id=?").bind(year, gender, id);

async function adminUpsertStudent(request, env) {
  const a = await requireAdmin(request, env); if (a.response) return a.response;
  const b = await request.json().catch(() => null);
  const id = normalizeStudentId(b?.studentId), name = clean(b?.name, 200), year = Number(b?.year);
  const gender = normalizeGender(b?.gender) || (b?.gender ? null : genderFromName(name));
  if (!id) return fail(request, env, "รหัสนักศึกษาต้องเป็นตัวเลข 6–12 หลัก (หรืออีเมล sb…@lru.ac.th)");
  if (!name) return fail(request, env, "กรุณาระบุชื่อ");
  if (!YEARS.includes(year)) return fail(request, env, "ชั้นปีต้องเป็น 1–4");
  if (!gender) return fail(request, env, "กรุณาเลือกเพศ (ชาย/หญิง)");
  const old = await env.DB.prepare("SELECT year FROM camp_students WHERE student_id=?").bind(id).first();
  await env.DB.batch([upsertStudentStmt(env, id, name, year, gender), syncSelectionStmt(env, id, year, gender)]);
  await audit(env, a, "CAMP_STUDENT", id, { name, year, gender, created: !old });
  return json(request, env, { ok: true, created: !old });
}

// CSV (or pasted text). Columns: รหัส, ชื่อ, ชั้นปี, เพศ — with or without a header row; header names may be Thai or English
// and in any order. Without a gender column the gender is read from the Thai title in the name (นาย / นางสาว / นาง).
async function adminBulkStudents(request, env) {
  const a = await requireAdmin(request, env); if (a.response) return a.response;
  const b = await request.json().catch(() => null);
  const rows = parseCsv(b?.text);
  if (!rows.length) return fail(request, env, "ไม่มีข้อมูล");
  if (rows.length > 3000) return fail(request, env, "นำเข้าได้ครั้งละไม่เกิน 3,000 แถว");
  let col = { id: 0, name: 1, year: 2, gender: 3, dept: 4 };
  const head = rows[0].cells;
  const keyed = {};
  head.forEach((c, i) => { for (const k of Object.keys(HEADER_KEYS)) if (HEADER_KEYS[k].test(c.replace(/\s+/g, "")) && keyed[k] === undefined) keyed[k] = i; });
  let data = rows, hasHeader = false;
  if (Object.keys(keyed).length >= 2 && !normalizeStudentId(head[keyed.id ?? 0])) { hasHeader = true; data = rows.slice(1); col = { id: keyed.id ?? -1, name: keyed.name ?? -1, last: keyed.last ?? -1, prefix: keyed.prefix ?? -1, year: keyed.year ?? -1, gender: keyed.gender ?? -1, dept: keyed.dept ?? -1 }; if (col.id < 0 || col.name < 0 || col.year < 0) return fail(request, env, "หัวตารางต้องมีคอลัมน์ รหัส, ชื่อ และชั้นปี (เพศไม่บังคับถ้าชื่อมีคำนำหน้า นาย/นางสาว)"); }
  const depList = (await env.DB.prepare("SELECT code,name FROM camp_departments").all()).results || [];
  const good = [], errors = [];
  for (const r of data) {
    const c = r.cells, text = c.join(", ");
    const pre = col.prefix >= 0 ? clean(c[col.prefix], 40) : "", last = col.last >= 0 ? clean(c[col.last], 100) : "";
    // separate คำนำหน้า / ชื่อ / นามสกุล columns are joined: "นาย" + "สมชาย" + "ใจดี" -> "นายสมชาย ใจดี"
    const name = clean(((pre && !/[.]$/.test(pre) && pre.length > 4 ? pre + " " : pre) + (c[col.name] ?? "") + (last ? " " + last : "")), 200);
    const id = normalizeStudentId(c[col.id]), year = parseYear(c[col.year]);
    const rawG = col.gender >= 0 ? c[col.gender] : "";
    const gender = rawG ? normalizeGender(rawG) : genderFromName(name);
    if (!id) { errors.push({ line: r.line, text, error: "รหัสนักศึกษาไม่ถูกต้อง" }); continue; }
    if (!name) { errors.push({ line: r.line, text, error: "ไม่มีชื่อ" }); continue; }
    if (!year) { errors.push({ line: r.line, text, error: "ชั้นปีต้องเป็น 1–4" }); continue; }
    if (!gender) { errors.push({ line: r.line, text, error: rawG ? `เพศ "${rawG}" ไม่ถูกต้อง (ใช้ ชาย/หญิง)` : "ไม่ระบุเพศ (ใส่คอลัมน์เพศ หรือใช้คำนำหน้า นาย/นางสาว)" }); continue; }
    const rawD = col.dept >= 0 ? c[col.dept] : "";
    const dept = rawD ? resolveDept(depList, rawD) : null;
    if (rawD && !dept) { errors.push({ line: r.line, text, error: `ไม่พบฝ่าย "${rawD}"` }); continue; }
    good.push({ id, name, year, gender, dept });
  }
  const dedup = new Map(); for (const g of good) dedup.set(g.id, g);
  const list = [...dedup.values()];
  const existing = new Set();
  for (let i = 0; i < list.length; i += 80) {
    const chunk = list.slice(i, i + 80);
    const r = await env.DB.prepare(`SELECT student_id FROM camp_students WHERE student_id IN (${chunk.map(() => "?").join(",")})`).bind(...chunk.map((c) => c.id)).all();
    for (const x of r.results || []) existing.add(x.student_id);
  }
  const stmts = [];
  let assigned = 0;
  for (const g of list) {
    stmts.push(upsertStudentStmt(env, g.id, g.name, g.year, g.gender));
    if (g.dept) { stmts.push(upsertSelectionStmt(env, g.id, g.dept, g.year, g.gender)); assigned++; } else stmts.push(syncSelectionStmt(env, g.id, g.year, g.gender));
  }
  for (let i = 0; i < stmts.length; i += 100) await env.DB.batch(stmts.slice(i, i + 100));
  const overQuota = assigned ? await countOverQuota(env) : 0;
  await audit(env, a, "CAMP_STUDENTS_IMPORT", null, { added: list.length - existing.size, updated: existing.size, assigned, overQuota, errors: errors.length, header: hasHeader });
  return json(request, env, { ok: true, added: list.length - existing.size, updated: existing.size, assigned, overQuota, errors, total: data.length });
}

// slots (department + gender + year) that currently hold more people than their quota
async function countOverQuota(env) {
  const r = await env.DB.prepare(
    `SELECT COUNT(*) c FROM (SELECT s.department_code,s.gender,s.year,COUNT(*) n FROM camp_selections s GROUP BY s.department_code,s.gender,s.year) x
     LEFT JOIN camp_quotas q ON q.department_code=x.department_code AND q.gender=x.gender AND q.year=x.year WHERE x.n > COALESCE(q.quota,0)`).first();
  return r?.c || 0;
}

// Admin puts students into a department by hand (also moves them from another department).
// Respects the quota unless force=true. body: { departmentCode, studentIds: [...] | studentId, force }
async function adminAssign(request, env) {
  const a = await requireAdmin(request, env); if (a.response) return a.response;
  const b = await request.json().catch(() => null);
  const code = clean(b?.departmentCode, 40), force = b?.force === true;
  const dep = await env.DB.prepare("SELECT code,name FROM camp_departments WHERE code=?").bind(code).first();
  if (!dep) return fail(request, env, "ไม่พบฝ่ายนี้", 404);
  const raw = Array.isArray(b?.studentIds) ? b.studentIds : (b?.studentId ? [b.studentId] : []);
  const ids = [...new Set(raw.map(normalizeStudentId).filter(Boolean))];
  if (!ids.length) return fail(request, env, "กรุณาเลือกนักศึกษา");
  if (ids.length > 500) return fail(request, env, "เพิ่มได้ครั้งละไม่เกิน 500 คน");
  const found = new Map();
  for (let i = 0; i < ids.length; i += 80) {
    const chunk = ids.slice(i, i + 80);
    const r = await env.DB.prepare(`SELECT student_id,name,year,gender FROM camp_students WHERE student_id IN (${chunk.map(() => "?").join(",")})`).bind(...chunk).all();
    for (const x of r.results || []) found.set(x.student_id, x);
  }
  const missing = ids.filter((id) => !found.has(id));
  const cur = new Map();
  for (let i = 0; i < ids.length; i += 80) {
    const chunk = ids.slice(i, i + 80);
    const r = await env.DB.prepare(`SELECT student_id,department_code FROM camp_selections WHERE student_id IN (${chunk.map(() => "?").join(",")})`).bind(...chunk).all();
    for (const x of r.results || []) cur.set(x.student_id, x.department_code);
  }
  let assigned = 0, unchanged = 0; const full = [], noGender = [];
  for (const id of ids) {
    const st = found.get(id); if (!st) continue;
    if (!st.gender) { noGender.push({ studentId: id, name: st.name }); continue; }
    if (cur.get(id) === code) { unchanged++; continue; }
    if (force) { await upsertSelectionStmt(env, id, code, st.year, st.gender).run(); assigned++; continue; }
    const res = await env.DB.prepare(
      `INSERT INTO camp_selections (student_id,department_code,year,gender,selected_at)
       SELECT ?,?,?,?,datetime('now')
       WHERE (SELECT COUNT(*) FROM camp_selections WHERE department_code=? AND year=? AND gender=?)
           < COALESCE((SELECT quota FROM camp_quotas WHERE department_code=? AND year=? AND gender=?),0)
       ON CONFLICT(student_id) DO UPDATE SET department_code=excluded.department_code,year=excluded.year,gender=excluded.gender,selected_at=excluded.selected_at`
    ).bind(id, code, st.year, st.gender, code, st.year, st.gender, code, st.year, st.gender).run();
    if (res?.meta?.changes) assigned++; else full.push({ studentId: id, name: st.name, year: st.year, gender: st.gender });
  }
  if (assigned) await audit(env, a, "CAMP_ASSIGN", code, { students: ids.filter((id) => found.has(id) && !full.some((f) => f.studentId === id) && !noGender.some((n) => n.studentId === id)), force });
  return json(request, env, { ok: true, assigned, unchanged, full, missing, noGender, overQuota: force && assigned ? await countOverQuota(env) : 0 });
}

async function adminDeleteStudent(request, env) {
  const a = await requireAdmin(request, env); if (a.response) return a.response;
  const b = await request.json().catch(() => null);
  const id = normalizeStudentId(b?.studentId); if (!id) return fail(request, env, "รหัสนักศึกษาไม่ถูกต้อง");
  await env.DB.batch([env.DB.prepare("DELETE FROM camp_selections WHERE student_id=?").bind(id), env.DB.prepare("DELETE FROM camp_students WHERE student_id=?").bind(id)]);
  await audit(env, a, "CAMP_STUDENT_DELETE", id);
  return json(request, env, { ok: true });
}
async function adminClearSelection(request, env) {
  const a = await requireAdmin(request, env); if (a.response) return a.response;
  const b = await request.json().catch(() => null);
  const id = normalizeStudentId(b?.studentId); if (!id) return fail(request, env, "รหัสนักศึกษาไม่ถูกต้อง");
  await env.DB.prepare("DELETE FROM camp_selections WHERE student_id=?").bind(id).run();
  await audit(env, a, "CAMP_SELECTION_CLEAR", id);
  return json(request, env, { ok: true });
}

export async function camps(request, env, url) {
  try {
    const p = url.pathname, m = request.method;
    if (m === "GET" && p === "/camps/status") return await status(request, env);
    if (m === "GET" && p === "/camps/departments") return await departments(request, env);
    if (m === "GET" && p === "/camps/me") return await me(request, env);
    if (m === "POST" && p === "/camps/select") return await select(request, env);
    if (m === "POST" && p === "/camps/unselect") return await unselect(request, env);
    if (m === "GET" && p === "/camps/admin/overview") return await adminOverview(request, env);
    if (m === "POST" && p === "/camps/admin/state") return await adminSetState(request, env);
    if (m === "POST" && p === "/camps/admin/department") return await adminSetDepartment(request, env);
    if (m === "POST" && p === "/camps/admin/quota") return await adminSetQuota(request, env);
    if (m === "GET" && p === "/camps/admin/students") return await adminStudents(request, env, url);
    if (m === "POST" && p === "/camps/admin/students") return await adminUpsertStudent(request, env);
    if (m === "POST" && p === "/camps/admin/students/bulk") return await adminBulkStudents(request, env);
    if (m === "POST" && p === "/camps/admin/students/delete") return await adminDeleteStudent(request, env);
    if (m === "POST" && p === "/camps/admin/selections/clear") return await adminClearSelection(request, env);
    if (m === "POST" && p === "/camps/admin/selections/assign") return await adminAssign(request, env);
    return fail(request, env, "Not Found", 404);
  } catch (e) {
    const msg = String(e?.message || e);
    console.error("[camps] unhandled error:", msg);
    if (/no such (table|column)/i.test(msg)) return fail(request, env, "ฐานข้อมูลยังไม่ได้อัปเดต (migration 0006)", 503, { code: "MIGRATION_REQUIRED" });
    return fail(request, env, "เซิร์ฟเวอร์ผิดพลาด กรุณาลองใหม่อีกครั้ง", 500, { code: "SERVER_ERROR" });
  }
}
