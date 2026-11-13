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
  if (!a.user) return { response: fail(req, env, a.unavailable ? "ยังเข้าสู่ระบบไม่ได้ในขณะนี้ ลองใหม่อีกครั้ง" : "กรุณาเข้าสู่ระบบ", a.unavailable ? 503 : 401) };
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
  catch (e) { return { response: fail(req, env, "ตรวจสอบสิทธิ์ผู้ดูแลไม่ได้ ลองใหม่อีกครั้ง", 503) }; }
  if (!ok) return { response: fail(req, env, "ต้องเป็นผู้ดูแลระบบ", 403) };
  return w;
}
// ---------- naming state: manual open / closed, plus an optional automatic schedule ----------
// camp_settings keys: aka_state (open|closed, manual), aka_schedule_enabled (1/0), aka_schedule_mode (datetime|countdown), aka_open_at, aka_close_at (epoch ms or "")
const num = (v) => { const n = Number(v); return v !== "" && v != null && Number.isFinite(n) ? n : null; };
async function loadSettings(env) {
  const m = Object.fromEntries(((await env.DB.prepare("SELECT key,value FROM camp_settings WHERE key LIKE 'aka_%'").all()).results || []).map((r) => [r.key, r.value]));
  return {
    manual: m.aka_state === "closed" ? "closed" : "open",
    schedule: { enabled: m.aka_schedule_enabled === "1", mode: m.aka_schedule_mode === "countdown" ? "countdown" : "datetime", openAt: num(m.aka_open_at), closeAt: num(m.aka_close_at) }
  };
}
// with the schedule on the clock decides (before the open time "pending", after the close time "closed"); a schedule without times follows the manual state
export function effectiveState(st, now = Date.now()) {
  const s = st.schedule;
  if (!s.enabled || (s.openAt == null && s.closeAt == null)) return st.manual;
  if (s.openAt != null && now < s.openAt) return "pending";
  if (s.closeAt != null && now >= s.closeAt) return "closed";
  return "open";
}
async function state(env) { return effectiveState(await loadSettings(env)); }
async function info(env) { const st = await loadSettings(env), now = Date.now(); return { state: effectiveState(st, now), manual: st.manual, schedule: st.schedule, now }; }
const setSetting = (env, key, value) => env.DB.prepare("INSERT INTO camp_settings (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(key, String(value ?? ""));
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
async function status(req, env) { const i = await info(env); return json(req, env, { state: i.state, schedule: i.schedule, now: i.now }); }

async function me(req, env) {
  const w = await who(req, env); if (w.response) return w.response;
  const [admin, inf] = await Promise.all([isAdmin(env, w.user), info(env)]);
  let reason = null, student = null;
  if (!w.studentId) reason = "not_university_email";
  else if (!w.verified) reason = "email_not_verified";
  else {
    const r = await env.DB.prepare(STUDENT_SQL).bind(w.studentId).first();
    if (!r) reason = "not_in_roster"; else student = shape(r);
  }
  return json(req, env, { ok: true, email: w.email, studentId: w.studentId, isAdmin: admin, state: inf.state, schedule: inf.schedule, now: inf.now, reason, student });
}
async function save(req, env) {
  const w = await who(req, env); if (w.response) return w.response;
  if (!w.studentId || !w.verified) return fail(req, env, "ต้องใช้บัญชีอีเมลมหาวิทยาลัย (@lru.ac.th) ที่ยืนยันแล้ว", 403, { code: "NOT_STUDENT" });
  const st = await env.DB.prepare("SELECT student_id FROM camp_students WHERE student_id=?").bind(w.studentId).first();
  if (!st) return fail(req, env, `ไม่พบรหัสนักศึกษา ${w.studentId} ในรายชื่อ กรุณาติดต่อผู้ดูแล`, 403, { code: "NOT_IN_ROSTER" });
  const cur = await state(env);
  if (cur === "pending") return fail(req, env, "ยังไม่ถึงเวลาเปิดรับการตั้งชื่อ", 403, { code: "NOT_OPEN" });
  if (cur !== "open") return fail(req, env, "ปิดรับการตั้งชื่อแล้ว", 403, { code: "CLOSED" });
  const r = readNames(await req.json().catch(() => null)); if (r.error) return fail(req, env, r.error);
  await upsert(env, w.studentId, r.nickname, r.aka, w.email).run();
  return json(req, env, { ok: true, student: shape(await env.DB.prepare(STUDENT_SQL).bind(w.studentId).first()) });
}

// ---------- admin ----------
async function adminOverview(req, env) {
  const a = await requireAdmin(req, env); if (a.response) return a.response;
  const t = await env.DB.prepare("SELECT COUNT(*) total, (SELECT COUNT(*) FROM camp_aka x JOIN camp_students y ON y.student_id=x.student_id WHERE x.aka<>'') named FROM camp_students").first();
  const deps = (await env.DB.prepare("SELECT code,name FROM camp_departments ORDER BY sort_order").all()).results || [];
  return json(req, env, { ...(await info(env)), total: t?.total || 0, named: t?.named || 0, departments: deps });
}
async function adminState(req, env) {
  const a = await requireAdmin(req, env); if (a.response) return a.response;
  const b = await req.json().catch(() => null);
  if (!["open", "closed"].includes(b?.state)) return fail(req, env, "สถานะไม่ถูกต้อง");
  await env.DB.prepare("INSERT INTO camp_settings (key,value) VALUES ('aka_state',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(b.state).run();
  await audit(env, a, "AKA_STATE", null, { state: b.state });
  return json(req, env, { ok: true, state: b.state });
}
// automatic open/close. datetime: { openAt, closeAt } (epoch ms, either may be empty); countdown: { startInSec, durationSec } turned into real times now
async function adminSchedule(req, env) {
  const a = await requireAdmin(req, env); if (a.response) return a.response;
  const b = await req.json().catch(() => null), now = Date.now(), YEAR = 366 * 86400 * 1000;
  const enabled = b?.enabled === true, mode = b?.mode === "countdown" ? "countdown" : "datetime";
  const cur = (await loadSettings(env)).schedule;
  let openAt = cur.openAt, closeAt = cur.closeAt;
  if (enabled || b?.openAt !== undefined || b?.startInSec !== undefined) {
    if (mode === "countdown") {
      const startIn = Number(b?.startInSec ?? 0), dur = b?.durationSec == null || b.durationSec === "" ? null : Number(b.durationSec);
      if (!Number.isFinite(startIn) || startIn < 0 || startIn > 90 * 86400) return fail(req, env, "เวลาที่จะเริ่มเปิดต้องไม่เกิน 90 วัน");
      if (dur != null && (!Number.isFinite(dur) || dur < 10 || dur > 90 * 86400)) return fail(req, env, "ระยะเวลาที่เปิดรับต้องอยู่ระหว่าง 10 วินาที ถึง 90 วัน");
      openAt = now + Math.round(startIn) * 1000; closeAt = dur == null ? null : openAt + Math.round(dur) * 1000;
    } else {
      openAt = b?.openAt == null || b.openAt === "" ? null : Number(b.openAt); closeAt = b?.closeAt == null || b.closeAt === "" ? null : Number(b.closeAt);
      for (const t of [openAt, closeAt]) if (t != null && (!Number.isFinite(t) || t < now - YEAR || t > now + 5 * YEAR)) return fail(req, env, "วันที่หรือเวลาไม่ถูกต้อง");
      if (openAt != null && closeAt != null && closeAt <= openAt) return fail(req, env, "เวลาปิดต้องอยู่หลังเวลาเปิด");
    }
    if (enabled && openAt == null && closeAt == null) return fail(req, env, "ต้องกำหนดเวลาเปิดหรือเวลาปิดอย่างน้อยหนึ่งอย่าง");
  }
  await env.DB.batch([setSetting(env, "aka_schedule_enabled", enabled ? "1" : "0"), setSetting(env, "aka_schedule_mode", mode), setSetting(env, "aka_open_at", openAt ?? ""), setSetting(env, "aka_close_at", closeAt ?? "")]);
  await audit(env, a, "AKA_SCHEDULE", null, { enabled, mode, openAt, closeAt });
  return json(req, env, { ok: true, ...(await info(env)) });
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
    if (m === "POST" && p === "/camps/aka/admin/schedule") return await adminSchedule(req, env);
    if (m === "GET" && p === "/camps/aka/admin/list") return await adminList(req, env, url);
    if (m === "POST" && p === "/camps/aka/admin/set") return await adminSet(req, env);
    return fail(req, env, "Not Found", 404);
  } catch (e) {
    console.error("[aka] error:", e?.message || e);
    if (/no such (table|column)/i.test(String(e?.message))) return fail(req, env, "ระบบ AKA ยังไม่พร้อมใช้งาน กรุณาแจ้งผู้ดูแล", 503, { code: "MIGRATION_REQUIRED" });
    return fail(req, env, "เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง", 500);
  }
}
