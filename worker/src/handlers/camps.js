// Camps · ฝ่ายบุคคล: students sign in with Google (university email), pick one department;
// admins manage the roster (student id → name + year) and per-department / per-year quotas.
import { json } from "../lib/cors.js";
import { getAuth0UserFromRequest, getAuth0Roles } from "../lib/auth0.js";

const fail = (request, env, message, status = 400, extra = {}) => json(request, env, { error: message, ...extra }, status);
const clean = (s, max = 200) => String(s ?? "").trim().slice(0, max);
const YEARS = [1, 2, 3, 4];
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

async function departmentsWithSlots(env) {
  const [deps, quotas, filled] = await Promise.all([
    env.DB.prepare("SELECT code,name,description,sort_order FROM camp_departments ORDER BY sort_order").all(),
    env.DB.prepare("SELECT department_code,year,quota FROM camp_quotas").all(),
    env.DB.prepare("SELECT department_code,year,COUNT(*) c FROM camp_selections GROUP BY department_code,year").all()
  ]);
  const q = {}, f = {};
  for (const r of quotas.results || []) (q[r.department_code] ||= {})[r.year] = r.quota;
  for (const r of filled.results || []) (f[r.department_code] ||= {})[r.year] = r.c;
  return (deps.results || []).map((d) => {
    const quota = {}, fill = {}, remaining = {};
    for (const y of YEARS) {
      quota[y] = q[d.code]?.[y] || 0; fill[y] = f[d.code]?.[y] || 0; remaining[y] = Math.max(0, quota[y] - fill[y]);
    }
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
    student = await env.DB.prepare("SELECT student_id,name,year FROM camp_students WHERE student_id=?").bind(w.parsed.studentId).first();
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
  if (!w.parsed) return { response: fail(request, env, "ต้องใช้อีเมลมหาวิทยาลัย (เช่น sb6740102220@lru.ac.th)", 403, { reason: "not_university_email" }) };
  if (!w.verified) return { response: fail(request, env, "อีเมลนี้ยังไม่ได้รับการยืนยัน", 403, { reason: "email_not_verified" }) };
  const student = await env.DB.prepare("SELECT student_id,name,year FROM camp_students WHERE student_id=?").bind(w.parsed.studentId).first();
  if (!student) return { response: fail(request, env, `ไม่พบรหัสนักศึกษา ${w.parsed.studentId} ในรายชื่อ กรุณาติดต่อผู้ดูแล`, 403, { reason: "not_in_roster" }) };
  return { w, student };
}

async function select(request, env) {
  const r = await eligibleStudent(request, env); if (r.response) return r.response;
  const { w, student } = r;
  const state = await registrationState(env);
  if (state !== "open") return fail(request, env, state === "pending" ? "ยังไม่เปิดให้เลือกฝ่าย" : "ปิดรับการเลือกฝ่ายแล้ว", 403, { registration: state });
  const b = await request.json().catch(() => null);
  const code = clean(b?.departmentCode, 40);
  const dep = await env.DB.prepare("SELECT code,name FROM camp_departments WHERE code=?").bind(code).first();
  if (!dep) return fail(request, env, "ไม่พบฝ่ายนี้", 404);
  const cur = await env.DB.prepare("SELECT department_code FROM camp_selections WHERE student_id=?").bind(student.student_id).first();
  if (cur?.department_code === code) return json(request, env, { ok: true, unchanged: true });
  // One atomic statement: insert/switch only while the department still has a free slot for this year.
  const res = await env.DB.prepare(
    `INSERT INTO camp_selections (student_id,department_code,year,selected_at)
     SELECT ?,?,?,datetime('now')
     WHERE (SELECT COUNT(*) FROM camp_selections WHERE department_code=? AND year=?)
         < COALESCE((SELECT quota FROM camp_quotas WHERE department_code=? AND year=?),0)
     ON CONFLICT(student_id) DO UPDATE SET department_code=excluded.department_code,year=excluded.year,selected_at=excluded.selected_at`
  ).bind(student.student_id, code, student.year, code, student.year, code, student.year).run();
  if (!res?.meta?.changes) return fail(request, env, `${dep.name} เต็มแล้วสำหรับชั้นปี ${student.year}`, 409, { code: "FULL" });
  await audit(env, w, "CAMP_SELECT", student.student_id, { department: code, year: student.year, from: cur?.department_code || null });
  return json(request, env, { ok: true });
}

async function unselect(request, env) {
  const r = await eligibleStudent(request, env); if (r.response) return r.response;
  const state = await registrationState(env);
  if (state !== "open") return fail(request, env, "ตอนนี้ยกเลิกการเลือกไม่ได้ (ไม่ได้เปิดรับอยู่)", 403, { registration: state });
  await env.DB.prepare("DELETE FROM camp_selections WHERE student_id=?").bind(r.student.student_id).run();
  await audit(env, r.w, "CAMP_UNSELECT", r.student.student_id);
  return json(request, env, { ok: true });
}

// ---------- admin ----------
async function adminOverview(request, env) {
  const a = await requireAdmin(request, env); if (a.response) return a.response;
  const [deps, reg, byYear, selected] = await Promise.all([
    departmentsWithSlots(env), registrationState(env),
    env.DB.prepare("SELECT year,COUNT(*) c FROM camp_students GROUP BY year").all(),
    env.DB.prepare("SELECT COUNT(*) c FROM camp_selections").first()
  ]);
  const students = {}; for (const y of YEARS) students[y] = 0;
  for (const r of byYear.results || []) students[r.year] = r.c;
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

async function adminSetQuota(request, env) {
  const a = await requireAdmin(request, env); if (a.response) return a.response;
  const b = await request.json().catch(() => null);
  const code = clean(b?.departmentCode, 40);
  const dep = await env.DB.prepare("SELECT code,name FROM camp_departments WHERE code=?").bind(code).first();
  if (!dep) return fail(request, env, "ไม่พบฝ่ายนี้", 404);
  const quotas = {};
  for (const y of YEARS) {
    const n = Number(b?.quotas?.[y]);
    if (!Number.isInteger(n) || n < 0 || n > 9999) return fail(request, env, `จำนวนของชั้นปี ${y} ต้องเป็นเลขจำนวนเต็ม 0–9999`);
    quotas[y] = n;
  }
  const filled = await env.DB.prepare("SELECT year,COUNT(*) c FROM camp_selections WHERE department_code=? GROUP BY year").bind(code).all();
  for (const r of filled.results || []) {
    if (quotas[r.year] < r.c) return fail(request, env, `ชั้นปี ${r.year} ของ${dep.name}มีผู้เลือกแล้ว ${r.c} คน ตั้งต่ำกว่านี้ไม่ได้ (ล้างการเลือกของบางคนก่อน)`, 409);
  }
  await env.DB.batch(YEARS.map((y) => env.DB.prepare("INSERT INTO camp_quotas (department_code,year,quota) VALUES (?,?,?) ON CONFLICT(department_code,year) DO UPDATE SET quota=excluded.quota").bind(code, y, quotas[y])));
  await audit(env, a, "CAMP_QUOTA", code, { quotas });
  return json(request, env, { ok: true });
}

async function adminStudents(request, env, url) {
  const a = await requireAdmin(request, env); if (a.response) return a.response;
  const q = clean(url.searchParams.get("q"), 80).toLowerCase();
  const year = Number(url.searchParams.get("year"));
  const where = ["1=1"], p = [];
  if (q) { where.push("(lower(s.name) LIKE ? OR s.student_id LIKE ?)"); p.push(`%${q}%`, `%${q}%`); }
  if (YEARS.includes(year)) { where.push("s.year=?"); p.push(year); }
  const rows = await env.DB.prepare(
    `SELECT s.student_id,s.name,s.year,sel.department_code,d.name department_name
     FROM camp_students s LEFT JOIN camp_selections sel ON sel.student_id=s.student_id LEFT JOIN camp_departments d ON d.code=sel.department_code
     WHERE ${where.join(" AND ")} ORDER BY s.year,s.student_id LIMIT 1000`).bind(...p).all();
  return json(request, env, { students: rows.results || [] });
}

function upsertStudentStmt(env, id, name, year) {
  return env.DB.prepare("INSERT INTO camp_students (student_id,name,year) VALUES (?,?,?) ON CONFLICT(student_id) DO UPDATE SET name=excluded.name,year=excluded.year,updated_at=datetime('now')").bind(id, name, year);
}
async function adminUpsertStudent(request, env) {
  const a = await requireAdmin(request, env); if (a.response) return a.response;
  const b = await request.json().catch(() => null);
  const id = normalizeStudentId(b?.studentId), name = clean(b?.name, 200), year = Number(b?.year);
  if (!id) return fail(request, env, "รหัสนักศึกษาต้องเป็นตัวเลข 6–12 หลัก (หรืออีเมล sb…@lru.ac.th)");
  if (!name) return fail(request, env, "กรุณาระบุชื่อ");
  if (!YEARS.includes(year)) return fail(request, env, "ชั้นปีต้องเป็น 1–4");
  const old = await env.DB.prepare("SELECT year FROM camp_students WHERE student_id=?").bind(id).first();
  await env.DB.batch([upsertStudentStmt(env, id, name, year), env.DB.prepare("UPDATE camp_selections SET year=? WHERE student_id=?").bind(year, id)]);
  await audit(env, a, "CAMP_STUDENT", id, { name, year, created: !old });
  return json(request, env, { ok: true, created: !old });
}

// Bulk paste: one student per line — "id,name,year" (comma, tab or semicolon separated; id may be the university email)
async function adminBulkStudents(request, env) {
  const a = await requireAdmin(request, env); if (a.response) return a.response;
  const b = await request.json().catch(() => null);
  const lines = String(b?.text ?? "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (!lines.length) return fail(request, env, "ไม่มีข้อมูล");
  if (lines.length > 1500) return fail(request, env, "นำเข้าได้ครั้งละไม่เกิน 1,500 บรรทัด");
  const good = [], errors = [];
  lines.forEach((line, i) => {
    const parts = line.split(/\t|,|;/).map((x) => x.trim());
    if (i === 0 && /รหัส|student/i.test(line) && !normalizeStudentId(parts[0])) return; // header row
    if (parts.length < 3) return errors.push({ line: i + 1, text: line, error: "ต้องมี รหัส, ชื่อ, ชั้นปี" });
    const id = normalizeStudentId(parts[0]), year = Number(parts[parts.length - 1]), name = clean(parts.slice(1, -1).join(" "), 200);
    if (!id) return errors.push({ line: i + 1, text: line, error: "รหัสนักศึกษาไม่ถูกต้อง" });
    if (!name) return errors.push({ line: i + 1, text: line, error: "ไม่มีชื่อ" });
    if (!YEARS.includes(year)) return errors.push({ line: i + 1, text: line, error: "ชั้นปีต้องเป็น 1–4" });
    good.push({ id, name, year });
  });
  const dedup = new Map(); for (const g of good) dedup.set(g.id, g);
  const list = [...dedup.values()];
  const existing = new Set();
  for (let i = 0; i < list.length; i += 80) {
    const chunk = list.slice(i, i + 80);
    const r = await env.DB.prepare(`SELECT student_id FROM camp_students WHERE student_id IN (${chunk.map(() => "?").join(",")})`).bind(...chunk.map((c) => c.id)).all();
    for (const x of r.results || []) existing.add(x.student_id);
  }
  const stmts = [];
  for (const g of list) { stmts.push(upsertStudentStmt(env, g.id, g.name, g.year)); stmts.push(env.DB.prepare("UPDATE camp_selections SET year=? WHERE student_id=?").bind(g.year, g.id)); }
  for (let i = 0; i < stmts.length; i += 100) await env.DB.batch(stmts.slice(i, i + 100));
  await audit(env, a, "CAMP_STUDENTS_IMPORT", null, { added: list.length - existing.size, updated: existing.size, errors: errors.length });
  return json(request, env, { ok: true, added: list.length - existing.size, updated: existing.size, errors });
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
