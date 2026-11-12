// Camps · ฝ่ายบุคคล: students sign in with Google (university email), pick one department;
// admins manage the roster (student id → name + year + gender) and per-department / per-year / per-gender quotas.
import { json } from "../lib/cors.js";
import { getAuth0UserFromRequest, getAuth0Roles } from "../lib/auth0.js";

const fail = (request, env, message, status = 400, extra = {}) => json(request, env, { error: message, ...extra }, status);
const clean = (s, max = 200) => String(s ?? "").trim().slice(0, max);
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
  const s = String(v ?? "").trim();
  const p = parseStudentEmail(s);
  if (p) return p.studentId;
  return /^\d{6,12}$/.test(s) ? s : null;
}
// ชาย/หญิง/M/F/male/female ... -> "M" | "F" | null
export function normalizeGender(v) {
  const s = String(v ?? "").trim().toLowerCase().replace(/\.$/, "");
  if (["m", "male", "man", "boy", "ชาย", "ช", "นาย", "เด็กชาย"].includes(s)) return "M";
  if (["f", "female", "woman", "girl", "หญิง", "ญ", "นาง", "นางสาว", "น.ส", "เด็กหญิง"].includes(s)) return "F";
  return null;
}
// Fallback when a roster has no gender column: Thai titles in front of the name.
export function genderFromName(name) {
  const n = String(name ?? "").trim();
  if (/^(นาย|เด็กชาย|ด\.ช\.)/.test(n)) return "M";
  if (/^(นางสาว|นาง|น\.ส\.|เด็กหญิง|ด\.ญ\.)/.test(n)) return "F";
  return null;
}
// "ปี 3" / "3" / "Y3" -> 3 (1-4) | null
function parseYear(v) {
  const m = /^(?:ชั้นปีที่|ชั้นปี|ปีที่|ปี|year|y)?\s*([1-4])$/i.exec(String(v ?? "").trim());
  return m ? Number(m[1]) : null;
}

// Small RFC-4180-ish CSV reader: quotes, "" escapes, newlines in quotes, BOM, delimiter auto-detect (, ; tab).
export function parseCsv(text) {
  const src = String(text ?? "").replace(/^﻿/, "");
  const first = src.split(/\r?\n/).find((l) => l.trim()) || "";
  const count = (c) => first.split(c).length - 1;
  const delim = count("\t") >= Math.max(count(","), count(";")) && count("\t") > 0 ? "\t" : count(";") > count(",") ? ";" : ",";
  const rows = []; let row = [], cell = "", q = false, line = 1, rowLine = 1;
  const endCell = () => { row.push(cell.trim()); cell = ""; };
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
  id: /^(รหัส|รหัสนักศึกษา|student[_ ]?id|studentid|id|code)$/i,
  name: /^(ชื่อ|ชื่อ-?นามสกุล|ชื่อสกุล|name|fullname|full[_ ]name)$/i,
  year: /^(ชั้นปี|ชั้น|ปี|ปีที่|year|level)$/i,
  gender: /^(เพศ|gender|sex)$/i
};

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
    env.DB.prepare("SELECT code,name,description,sort_order FROM camp_departments ORDER BY sort_order").all(),
    env.DB.prepare("SELECT department_code,gender,year,quota FROM camp_quotas").all(),
    env.DB.prepare("SELECT department_code,gender,year,COUNT(*) c FROM camp_selections GROUP BY department_code,gender,year").all()
  ]);
  const q = {}, f = {};
  for (const r of quotas.results || []) (q[r.department_code] ||= grid())[r.gender][r.year] = r.quota;
  for (const r of filled.results || []) (f[r.department_code] ||= grid())[r.gender][r.year] = r.c;
  return (deps.results || []).map((d) => {
    const quota = q[d.code] || grid(), fill = f[d.code] || grid(), remaining = grid();
    for (const g of GENDERS) for (const y of YEARS) remaining[g][y] = Math.max(0, quota[g][y] - fill[g][y]);
    return { code: d.code, name: d.name, description: d.description, quota, filled: fill, remaining };
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
    else selection = await env.DB.prepare("SELECT department_code,selected_at FROM camp_selections WHERE student_id=?").bind(student.student_id).first();
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
  let col = { id: 0, name: 1, year: 2, gender: 3 };
  const head = rows[0].cells;
  const keyed = {};
  head.forEach((c, i) => { for (const k of Object.keys(HEADER_KEYS)) if (HEADER_KEYS[k].test(c.trim()) && keyed[k] === undefined) keyed[k] = i; });
  let data = rows, hasHeader = false;
  if (Object.keys(keyed).length >= 2 && !normalizeStudentId(head[keyed.id ?? 0])) { hasHeader = true; data = rows.slice(1); col = { id: keyed.id ?? -1, name: keyed.name ?? -1, year: keyed.year ?? -1, gender: keyed.gender ?? -1 }; if (col.id < 0 || col.name < 0 || col.year < 0) return fail(request, env, "หัวตารางต้องมีคอลัมน์ รหัส, ชื่อ และชั้นปี (เพศไม่บังคับถ้าชื่อมีคำนำหน้า นาย/นางสาว)"); }
  const good = [], errors = [];
  for (const r of data) {
    const c = r.cells, text = c.join(", ");
    const id = normalizeStudentId(c[col.id]), name = clean(c[col.name], 200), year = parseYear(c[col.year]);
    const rawG = col.gender >= 0 ? c[col.gender] : "";
    const gender = rawG ? normalizeGender(rawG) : genderFromName(name);
    if (!id) { errors.push({ line: r.line, text, error: "รหัสนักศึกษาไม่ถูกต้อง" }); continue; }
    if (!name) { errors.push({ line: r.line, text, error: "ไม่มีชื่อ" }); continue; }
    if (!year) { errors.push({ line: r.line, text, error: "ชั้นปีต้องเป็น 1–4" }); continue; }
    if (!gender) { errors.push({ line: r.line, text, error: rawG ? `เพศ "${rawG}" ไม่ถูกต้อง (ใช้ ชาย/หญิง)` : "ไม่ระบุเพศ (ใส่คอลัมน์เพศ หรือใช้คำนำหน้า นาย/นางสาว)" }); continue; }
    good.push({ id, name, year, gender });
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
  for (const g of list) { stmts.push(upsertStudentStmt(env, g.id, g.name, g.year, g.gender)); stmts.push(syncSelectionStmt(env, g.id, g.year, g.gender)); }
  for (let i = 0; i < stmts.length; i += 100) await env.DB.batch(stmts.slice(i, i + 100));
  await audit(env, a, "CAMP_STUDENTS_IMPORT", null, { added: list.length - existing.size, updated: existing.size, errors: errors.length, header: hasHeader });
  return json(request, env, { ok: true, added: list.length - existing.size, updated: existing.size, errors, total: data.length });
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
    if (m === "POST" && p === "/camps/admin/quota") return await adminSetQuota(request, env);
    if (m === "GET" && p === "/camps/admin/students") return await adminStudents(request, env, url);
    if (m === "POST" && p === "/camps/admin/students") return await adminUpsertStudent(request, env);
    if (m === "POST" && p === "/camps/admin/students/bulk") return await adminBulkStudents(request, env);
    if (m === "POST" && p === "/camps/admin/students/delete") return await adminDeleteStudent(request, env);
    if (m === "POST" && p === "/camps/admin/selections/clear") return await adminClearSelection(request, env);
    return fail(request, env, "Not Found", 404);
  } catch (e) {
    const msg = String(e?.message || e);
    console.error("[camps] unhandled error:", msg);
    if (/no such (table|column)/i.test(msg)) return fail(request, env, "ฐานข้อมูลยังไม่ได้อัปเดต (migration 0006)", 503, { code: "MIGRATION_REQUIRED" });
    return fail(request, env, "เซิร์ฟเวอร์ผิดพลาด กรุณาลองใหม่อีกครั้ง", 500, { code: "SERVER_ERROR" });
  }
}
