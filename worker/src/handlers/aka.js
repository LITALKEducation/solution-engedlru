// ระบบ AKA (/aka/): every student gives themselves a nickname (ชื่อเล่น) and a camp name (AKA). Students and departments come from the
// HR tables (camp_students / camp_selections / camp_departments). Students can change their names at any time until an admin closes naming.
import { json } from "../lib/cors.js";
import { getAuth0UserFromRequest, getAuth0Roles } from "../lib/auth0.js";

const fail = (req, env, error, status = 400, extra = {}) => json(req, env, { error, ...extra }, status);
const tidy = (s) => String(s ?? "").normalize("NFC").replace(/[​-‍⁠﻿]/g, "").replace(/[   　]/g, " ").replace(/[ \t]+/g, " ").trim();
const ADMIN_ROLES = ["camp_admin", "budget_admin"];
export const NICK_MAX = 30, AKA_MAX = 40;

export function parseStudentEmail(email) {
  const m = /^([a-z]{2})(\d{6,12})@lru\.ac\.th$/i.exec(String(email || "").trim());
  return m ? m[2] : null;
}
async function who(req, env) {
  const a = await getAuth0UserFromRequest(req, env);
  if (!a.user) return { response: fail(req, env, a.unavailable ? "ระบบยืนยันตัวตนไม่พร้อมใช้งาน" : "กรุณาเข้าสู่ระบบ", a.unavailable ? 503 : 401) };
  const email = tidy(a.user.email || "").toLowerCase();
  return { user: a.user, email, verified: a.user.email_verified === true, studentId: parseStudentEmail(email) };
}
async function isAdmin(env, user) {
  try { return (await getAuth0Roles(env, user.sub)).some((r) => ADMIN_ROLES.includes(r)); } catch (e) { console.error("[aka] role lookup:", e?.message || e); return false; }
}
async function requireAdmin(req, env) {
  const w = await who(req, env); if (w.response) return w;
  let ok = false;
  try { ok = (await getAuth0Roles(env, w.user.sub)).some((r) => ADMIN_ROLES.includes(r)); }
  catch (e) { return { response: fail(req, env, "ตรวจสอบสิทธิ์ผู้ดูแลไม่ได้", 503) }; }
  if (!ok) return { response: fail(req, env, "ต้องเป็นผู้ดูแลระบบ", 403) };
  return w;
}
async function state(env) {
  const r = await env.DB.prepare("SELECT value FROM camp_settings WHERE key='aka_state'").first();
  return r?.value === "closed" ? "closed" : "open";
}
const STUDENT_SQL = `SELECT s.student_id,s.name,s.year,s.gender,sel.department_code,d.name department_name,
    a.nickname,a.aka,a.updated_at,a.updated_by
  FROM camp_students s LEFT JOIN camp_selections sel ON sel.student_id=s.student_id LEFT JOIN camp_departments d ON d.code=sel.department_code
  LEFT JOIN camp_aka a ON a.student_id=s.student_id WHERE s.student_id=?`;
const shape = (r) => ({ studentId: r.student_id, name: r.name, year: r.year, gender: r.gender, departmentCode: r.department_code || null, departmentName: r.department_name || null, nickname: r.nickname || "", aka: r.aka || "", updatedAt: r.updated_at || null, updatedBy: r.updated_by || null });
function readNames(b) {
  const nickname = tidy(b?.nickname), aka = tidy(b?.aka);
  if (!nickname) return { error: "กรอกชื่อเล่น" };
  if (!aka) return { error: "กรอกชื่อ AKA" };
  if ([...nickname].length > NICK_MAX) return { error: `ชื่อเล่นยาวเกินไป (ไม่เกิน ${NICK_MAX} ตัวอักษร)` };
  if ([...aka].length > AKA_MAX) return { error: `AKA ยาวเกินไป (ไม่เกิน ${AKA_MAX} ตัวอักษร)` };
  return { nickname, aka };
}
const upsert = (env, id, nickname, aka, by) => env.DB.prepare(
  `INSERT INTO camp_aka (student_id,nickname,aka,updated_by,updated_at) VALUES (?,?,?,?,datetime('now'))
   ON CONFLICT(student_id) DO UPDATE SET nickname=excluded.nickname,aka=excluded.aka,updated_by=excluded.updated_by,updated_at=excluded.updated_at`).bind(id, nickname, aka, by);
async function audit(env, w, action, entityId, metadata = {}) {
  await env.DB.prepare("INSERT INTO budget_audit_logs (uuid,actor_auth0_id,actor_email,action,entity_type,entity_uuid,metadata) VALUES (?,?,?,?,?,?,?)")
    .bind(crypto.randomUUID(), w.user.sub, w.email || "unknown", action, "aka", entityId == null ? null : String(entityId), JSON.stringify(metadata)).run();
}

// public: is naming open? (for the home page)
async function status(req, env) { return json(req, env, { state: await state(env) }); }

async function me(req, env) {
  const w = await who(req, env); if (w.response) return w.response;
  const [admin, st] = await Promise.all([isAdmin(env, w.user), state(env)]);
  let reason = null, student = null;
  if (!w.studentId) reason = "not_university_email";
  else if (!w.verified) reason = "email_not_verified";
  else {
    const r = await env.DB.prepare(STUDENT_SQL).bind(w.studentId).first();
    if (!r) reason = "not_in_roster"; else student = shape(r);
  }
  return json(req, env, { ok: true, email: w.email, studentId: w.studentId, isAdmin: admin, state: st, reason, student });
}
async function save(req, env) {
  const w = await who(req, env); if (w.response) return w.response;
  if (!w.studentId || !w.verified) return fail(req, env, "ต้องใช้บัญชีอีเมลมหาวิทยาลัย (@lru.ac.th) ที่ยืนยันแล้ว", 403, { code: "NOT_STUDENT" });
  const st = await env.DB.prepare("SELECT student_id FROM camp_students WHERE student_id=?").bind(w.studentId).first();
  if (!st) return fail(req, env, `ไม่พบรหัสนักศึกษา ${w.studentId} ในรายชื่อ กรุณาติดต่อผู้ดูแล`, 403, { code: "NOT_IN_ROSTER" });
  if ((await state(env)) !== "open") return fail(req, env, "ปิดรับการตั้งชื่อแล้ว", 403, { code: "CLOSED" });
  const r = readNames(await req.json().catch(() => null)); if (r.error) return fail(req, env, r.error);
  await upsert(env, w.studentId, r.nickname, r.aka, w.email).run();
  return json(req, env, { ok: true, student: shape(await env.DB.prepare(STUDENT_SQL).bind(w.studentId).first()) });
}

// ---------- admin ----------
async function adminOverview(req, env) {
  const a = await requireAdmin(req, env); if (a.response) return a.response;
  const t = await env.DB.prepare("SELECT COUNT(*) total, (SELECT COUNT(*) FROM camp_aka x JOIN camp_students y ON y.student_id=x.student_id WHERE x.aka<>'') named FROM camp_students").first();
  const deps = (await env.DB.prepare("SELECT code,name FROM camp_departments ORDER BY sort_order").all()).results || [];
  return json(req, env, { state: await state(env), total: t?.total || 0, named: t?.named || 0, departments: deps });
}
async function adminState(req, env) {
  const a = await requireAdmin(req, env); if (a.response) return a.response;
  const b = await req.json().catch(() => null);
  if (!["open", "closed"].includes(b?.state)) return fail(req, env, "สถานะไม่ถูกต้อง");
  await env.DB.prepare("INSERT INTO camp_settings (key,value) VALUES ('aka_state',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(b.state).run();
  await audit(env, a, "AKA_STATE", null, { state: b.state });
  return json(req, env, { ok: true, state: b.state });
}
// everyone in the roster with their names + department, ordered like the export: department, year high -> low, student id
async function adminList(req, env, url) {
  const a = await requireAdmin(req, env); if (a.response) return a.response;
  const dep = tidy(url.searchParams.get("department")), year = Number(url.searchParams.get("year")), q = tidy(url.searchParams.get("q")).slice(0, 100), named = url.searchParams.get("named");
  const where = [], p = [];
  if (dep === "none") where.push("sel.department_code IS NULL"); else if (dep) { where.push("sel.department_code=?"); p.push(dep); }
  if ([1, 2, 3, 4].includes(year)) { where.push("s.year=?"); p.push(year); }
  if (named === "1") where.push("COALESCE(a.aka,'')<>''"); else if (named === "0") where.push("COALESCE(a.aka,'')=''");
  if (q) { where.push("(s.student_id LIKE ? OR s.name LIKE ? OR a.nickname LIKE ? OR a.aka LIKE ?)"); p.push(`%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`); }
  const rows = (await env.DB.prepare(
    `SELECT s.student_id,s.name,s.year,s.gender,sel.department_code,d.name department_name,d.sort_order,a.nickname,a.aka,a.updated_at,a.updated_by
     FROM camp_students s LEFT JOIN camp_selections sel ON sel.student_id=s.student_id LEFT JOIN camp_departments d ON d.code=sel.department_code
     LEFT JOIN camp_aka a ON a.student_id=s.student_id ${where.length ? "WHERE " + where.join(" AND ") : ""}
     ORDER BY CASE WHEN sel.department_code IS NULL THEN 1 ELSE 0 END, d.sort_order, s.year DESC, s.student_id LIMIT 3000`).bind(...p).all()).results || [];
  return json(req, env, { students: rows.map(shape) });
}
// admins can always set / clear a student's names (even when naming is closed)
async function adminSet(req, env) {
  const a = await requireAdmin(req, env); if (a.response) return a.response;
  const b = await req.json().catch(() => null);
  const id = String(b?.studentId ?? "").replace(/[๐-๙]/g, (c) => String(c.charCodeAt(0) - 0x0e50)).trim();
  const st = await env.DB.prepare("SELECT student_id FROM camp_students WHERE student_id=?").bind(id).first();
  if (!st) return fail(req, env, "ไม่พบรหัสนักศึกษานี้ในรายชื่อ", 404);
  if (b?.clear === true) {
    await env.DB.prepare("DELETE FROM camp_aka WHERE student_id=?").bind(id).run();
    await audit(env, a, "AKA_CLEAR", id);
    return json(req, env, { ok: true });
  }
  const r = readNames(b); if (r.error) return fail(req, env, r.error);
  await upsert(env, id, r.nickname, r.aka, a.email).run();
  await audit(env, a, "AKA_SET", id, { nickname: r.nickname, aka: r.aka });
  return json(req, env, { ok: true, student: shape(await env.DB.prepare(STUDENT_SQL).bind(id).first()) });
}

export async function aka(req, env, url) {
  try {
    const p = url.pathname, m = req.method;
    if (m === "GET" && p === "/camps/aka/status") return await status(req, env);
    if (m === "GET" && p === "/camps/aka/me") return await me(req, env);
    if (m === "POST" && p === "/camps/aka/save") return await save(req, env);
    if (m === "GET" && p === "/camps/aka/admin/overview") return await adminOverview(req, env);
    if (m === "POST" && p === "/camps/aka/admin/state") return await adminState(req, env);
    if (m === "GET" && p === "/camps/aka/admin/list") return await adminList(req, env, url);
    if (m === "POST" && p === "/camps/aka/admin/set") return await adminSet(req, env);
    return fail(req, env, "Not Found", 404);
  } catch (e) {
    console.error("[aka] error:", e?.message || e);
    if (/no such (table|column)/i.test(String(e?.message))) return fail(req, env, "ฐานข้อมูลยังไม่ได้ติดตั้ง migration ของระบบ AKA", 503, { code: "MIGRATION_REQUIRED" });
    return fail(req, env, "ระบบขัดข้อง กรุณาลองใหม่", 500);
  }
}
