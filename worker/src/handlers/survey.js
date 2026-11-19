// แบบสำรวจโรงเรียน: an admin picks a student by student id and fills in the school-survey form of that student's ฝ่าย.
// Admins can also assign a student, who then signs in with their @lru.ac.th account on the public page /hr/survey and fills in their own form.
// Students and departments come from the HR tables (camp_students / camp_selections / camp_departments).
import { json } from "../lib/cors.js";
import { permDenied } from "./camps.js";
import { getAuth0UserFromRequest, getAuth0Roles } from "../lib/auth0.js";
import { SURVEY_FORMS, SURVEY_TITLE, SURVEY_SUBTITLE, SURVEY_INSTRUCTION } from "../lib/survey-forms.js";

const fail = (req, env, error, status = 400, extra = {}) => json(req, env, { error, ...extra }, status);
const tidy = (s) => String(s ?? "").normalize("NFC").replace(/[​-‍⁠﻿]/g, "").replace(/[   　]/g, " ").replace(/[ \t]+/g, " ").trim();
const ADMIN_ROLES = ["camp_admin", "budget_admin"];
export const LIMITS = { school: 150, coordinator: 120, phone: 30, surveyor: 120, note: 300, summary: 2000 };

async function requireAdmin(req, env, perm = "survey") {
  const a = await getAuth0UserFromRequest(req, env);
  if (!a.user) return { response: fail(req, env, a.unavailable ? "ยังเข้าสู่ระบบไม่ได้ในขณะนี้ ลองใหม่อีกครั้ง" : "กรุณาเข้าสู่ระบบ", a.unavailable ? 503 : 401) };
  let ok = false;
  try { ok = (await getAuth0Roles(env, a.user.sub)).some((r) => ADMIN_ROLES.includes(r)); }
  catch (e) { return { response: fail(req, env, "ตรวจสอบสิทธิ์แอดมินไม่ได้ ลองใหม่อีกครั้ง", 503) }; }
  if (!ok) return { response: fail(req, env, "ต้องเป็นแอดมิน", 403) };
  const w = { user: a.user, email: tidy(a.user.email || "").toLowerCase() };
  const d = await permDenied(req, env, w, perm); if (d) return { response: d };
  return w;
}
export function parseStudentEmail(email) {
  const m = /^([a-z]{2})(\d{6,12})@lru\.ac\.th$/i.exec(String(email || "").trim());
  return m ? m[2] : null;
}
async function whoStudent(req, env) {
  const a = await getAuth0UserFromRequest(req, env);
  if (!a.user) return { response: fail(req, env, a.unavailable ? "ยังเข้าสู่ระบบไม่ได้ในขณะนี้ ลองใหม่อีกครั้ง" : "กรุณาเข้าสู่ระบบ", a.unavailable ? 503 : 401) };
  const email = tidy(a.user.email || "").toLowerCase();
  return { user: a.user, email, verified: a.user.email_verified === true, studentId: parseStudentEmail(email) };
}
async function audit(env, w, action, entityId, metadata = {}) {
  await env.DB.prepare("INSERT INTO budget_audit_logs (uuid,actor_auth0_id,actor_email,action,entity_type,entity_uuid,metadata) VALUES (?,?,?,?,?,?,?)")
    .bind(crypto.randomUUID(), w.user.sub, w.email || "unknown", action, "survey", entityId == null ? null : String(entityId), JSON.stringify(metadata)).run();
}
const digits = (s) => String(s ?? "").replace(/[๐-๙]/g, (c) => String(c.charCodeAt(0) - 0x0e50)).replace(/\D/g, "");
const STUDENT_SQL = `SELECT s.student_id,s.name,s.year,s.gender,sel.department_code,d.name department_name
  FROM camp_students s LEFT JOIN camp_selections sel ON sel.student_id=s.student_id LEFT JOIN camp_departments d ON d.code=sel.department_code WHERE s.student_id=?`;
const parseArr = (s) => { try { const a = JSON.parse(s); return Array.isArray(a) ? a : []; } catch (e) { return []; } };
function shapeForm(r, total) {
  const checks = parseArr(r.checks), notes = parseArr(r.notes);
  return { studentId: r.student_id, departmentCode: r.department_code, schoolName: r.school_name, surveyDate: r.survey_date, coordinator: r.coordinator, phone: r.phone,
    checks: Array.from({ length: total }, (_, i) => checks[i] === 1 || checks[i] === true), notes: Array.from({ length: total }, (_, i) => String(notes[i] ?? "")),
    summary: r.summary, surveyor: r.surveyor, updatedAt: r.updated_at, updatedBy: r.updated_by };
}
const shapeStudent = (r) => ({ studentId: r.student_id, name: r.name, year: r.year, gender: r.gender, departmentCode: r.department_code || null, departmentName: r.department_name || null });

// the printed form text (same for everyone) -> the page renders it
async function adminTemplates(req, env) {
  const a = await requireAdmin(req, env); if (a.response) return a.response;
  return json(req, env, { title: SURVEY_TITLE, subtitle: SURVEY_SUBTITLE, instruction: SURVEY_INSTRUCTION, forms: SURVEY_FORMS });
}
// one student + the form of their ฝ่าย (saved answers, or an empty form)
async function adminStudent(req, env, url) {
  const a = await requireAdmin(req, env); if (a.response) return a.response;
  const id = digits(url.searchParams.get("id"));
  if (id.length < 6) return fail(req, env, "กรอกรหัสนักศึกษาให้ครบ");
  const st = await env.DB.prepare(STUDENT_SQL).bind(id).first();
  if (!st) return fail(req, env, "ไม่พบรหัสนักศึกษานี้ในรายชื่อ", 404, { code: "NOT_IN_ROSTER" });
  const student = shapeStudent(st);
  const assigned = !!(await env.DB.prepare("SELECT student_id FROM camp_survey_assignees WHERE student_id=?").bind(id).first());
  if (!st.department_code) return json(req, env, { student, assigned, form: null, template: null, code: "NO_DEPARTMENT" });
  const tpl = SURVEY_FORMS[st.department_code];
  if (!tpl) return json(req, env, { student, assigned, form: null, template: null, code: "NO_TEMPLATE" });
  const row = await env.DB.prepare("SELECT * FROM camp_school_survey WHERE student_id=?").bind(id).first();
  return json(req, env, { student, assigned, template: tpl, form: row ? shapeForm(row, tpl.items.length) : null, saved: !!row });
}
function readForm(b, tpl) {
  const text = (v, max, label) => { const s = tidy(v); if ([...s].length > max) return { error: `${label} ยาวเกินไป (ไม่เกิน ${max} ตัวอักษร)` }; return { v: s }; };
  const out = {};
  for (const [k, max, label] of [["schoolName", LIMITS.school, "ชื่อโรงเรียน"], ["coordinator", LIMITS.coordinator, "ผู้ประสานงาน"], ["phone", LIMITS.phone, "เบอร์โทรศัพท์"], ["surveyor", LIMITS.surveyor, "ผู้สำรวจ"]]) {
    const r = text(b?.[k], max, label); if (r.error) return r; out[k] = r.v;
  }
  const date = tidy(b?.surveyDate);
  if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) return { error: "วันที่สำรวจไม่ถูกต้อง" };
  out.surveyDate = date;
  const sum = String(b?.summary ?? "").normalize("NFC").replace(/\r\n/g, "\n").trim();
  if ([...sum].length > LIMITS.summary) return { error: `สรุปผลยาวเกินไป (ไม่เกิน ${LIMITS.summary} ตัวอักษร)` };
  out.summary = sum;
  const n = tpl.items.length;
  if (!Array.isArray(b?.checks) || b.checks.length !== n) return { error: "จำนวนรายการสำรวจไม่ตรงกับแบบฟอร์ม โหลดหน้าใหม่แล้วลองอีกครั้ง" };
  if (!Array.isArray(b?.notes) || b.notes.length !== n) return { error: "จำนวนหมายเหตุไม่ตรงกับแบบฟอร์ม โหลดหน้าใหม่แล้วลองอีกครั้ง" };
  out.checks = b.checks.map((c) => (c === true || c === 1 ? 1 : 0));
  out.notes = [];
  for (const x of b.notes) { const r = text(x, LIMITS.note, "หมายเหตุ"); if (r.error) return r; out.notes.push(r.v); }
  return out;
}
const UPSERT = `INSERT INTO camp_school_survey (student_id,department_code,school_name,survey_date,coordinator,phone,checks,notes,summary,surveyor,updated_by,updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,datetime('now'))
     ON CONFLICT(student_id) DO UPDATE SET department_code=excluded.department_code,school_name=excluded.school_name,survey_date=excluded.survey_date,coordinator=excluded.coordinator,
       phone=excluded.phone,checks=excluded.checks,notes=excluded.notes,summary=excluded.summary,surveyor=excluded.surveyor,updated_by=excluded.updated_by,updated_at=excluded.updated_at`;
// validate + store the form of student `st` (a STUDENT_SQL row); returns a Response on a problem, otherwise the saved form
async function writeForm(req, env, st, body, actor, action) {
  if (!st.department_code) return { response: fail(req, env, "นักศึกษาคนนี้ยังไม่มีฝ่าย จึงยังไม่มีแบบสำรวจ", 409, { code: "NO_DEPARTMENT" }) };
  const tpl = SURVEY_FORMS[st.department_code];
  if (!tpl) return { response: fail(req, env, "ฝ่ายนี้ยังไม่มีแบบสำรวจ", 409, { code: "NO_TEMPLATE" }) };
  const f = readForm(body, tpl); if (f.error) return { response: fail(req, env, f.error) };
  await env.DB.prepare(UPSERT).bind(st.student_id, st.department_code, f.schoolName, f.surveyDate, f.coordinator, f.phone, JSON.stringify(f.checks), JSON.stringify(f.notes), f.summary, f.surveyor, actor.email).run();
  await audit(env, actor, action, st.student_id, { department: st.department_code, school: f.schoolName, done: f.checks.filter(Boolean).length });
  return { form: shapeForm(await env.DB.prepare("SELECT * FROM camp_school_survey WHERE student_id=?").bind(st.student_id).first(), tpl.items.length) };
}
async function adminSave(req, env) {
  const a = await requireAdmin(req, env); if (a.response) return a.response;
  const b = await req.json().catch(() => null);
  const id = digits(b?.studentId);
  const st = id ? await env.DB.prepare(STUDENT_SQL).bind(id).first() : null;
  if (!st) return fail(req, env, "ไม่พบรหัสนักศึกษานี้ในรายชื่อ", 404, { code: "NOT_IN_ROSTER" });
  const w = await writeForm(req, env, st, b, a, "SURVEY_SAVE"); if (w.response) return w.response;
  return json(req, env, { ok: true, form: w.form });
}
// admin: let a student fill in their own form on /hr/survey (assigned: true) or take that away again (assigned: false)
async function adminAssign(req, env) {
  const a = await requireAdmin(req, env); if (a.response) return a.response;
  const b = await req.json().catch(() => null), id = digits(b?.studentId);
  const st = id ? await env.DB.prepare(STUDENT_SQL).bind(id).first() : null;
  if (!st) return fail(req, env, "ไม่พบรหัสนักศึกษานี้ในรายชื่อ", 404, { code: "NOT_IN_ROSTER" });
  if (b?.assigned === false) await env.DB.prepare("DELETE FROM camp_survey_assignees WHERE student_id=?").bind(id).run();
  else await env.DB.prepare("INSERT INTO camp_survey_assignees (student_id,assigned_by) VALUES (?,?) ON CONFLICT(student_id) DO NOTHING").bind(id, a.email).run();
  await audit(env, a, b?.assigned === false ? "SURVEY_UNASSIGN" : "SURVEY_ASSIGN", id);
  return json(req, env, { ok: true, assigned: b?.assigned !== false });
}
// ---------- the assigned student (public page /hr/survey) ----------
const texts = () => ({ title: SURVEY_TITLE, subtitle: SURVEY_SUBTITLE, instruction: SURVEY_INSTRUCTION });
async function studentMe(req, env) {
  const w = await whoStudent(req, env); if (w.response) return w.response;
  const base = { ok: true, email: w.email, studentId: w.studentId };
  if (!w.studentId) return json(req, env, { ...base, reason: "not_university_email" });
  if (!w.verified) return json(req, env, { ...base, reason: "email_not_verified" });
  const st = await env.DB.prepare(STUDENT_SQL).bind(w.studentId).first();
  if (!st) return json(req, env, { ...base, reason: "not_in_roster" });
  const student = shapeStudent(st);
  const assigned = !!(await env.DB.prepare("SELECT student_id FROM camp_survey_assignees WHERE student_id=?").bind(w.studentId).first());
  if (!assigned) return json(req, env, { ...base, student, assigned: false });
  const tpl = st.department_code ? SURVEY_FORMS[st.department_code] : null;
  if (!tpl) return json(req, env, { ...base, student, assigned: true, template: null, code: st.department_code ? "NO_TEMPLATE" : "NO_DEPARTMENT" });
  const row = await env.DB.prepare("SELECT * FROM camp_school_survey WHERE student_id=?").bind(w.studentId).first();
  return json(req, env, { ...base, student, assigned: true, template: tpl, texts: texts(), form: row ? shapeForm(row, tpl.items.length) : null, saved: !!row });
}
async function studentSave(req, env) {
  const w = await whoStudent(req, env); if (w.response) return w.response;
  if (!w.studentId || !w.verified) return fail(req, env, "ต้องใช้บัญชีอีเมลมหาวิทยาลัย (@lru.ac.th) ที่ยืนยันแล้ว", 403, { code: "NOT_STUDENT" });
  const st = await env.DB.prepare(STUDENT_SQL).bind(w.studentId).first();
  if (!st) return fail(req, env, `ไม่พบรหัสนักศึกษา ${w.studentId} ในรายชื่อ กรุณาติดต่อแอดมิน`, 403, { code: "NOT_IN_ROSTER" });
  const assigned = await env.DB.prepare("SELECT student_id FROM camp_survey_assignees WHERE student_id=?").bind(w.studentId).first();
  if (!assigned) return fail(req, env, "แอดมินยังไม่ได้มอบหมายแบบสำรวจนี้ให้คุณ", 403, { code: "NOT_ASSIGNED" });
  const r = await writeForm(req, env, st, await req.json().catch(() => null), w, "SURVEY_SAVE"); if (r.response) return r.response;
  return json(req, env, { ok: true, form: r.form });
}
async function adminDelete(req, env) {
  const a = await requireAdmin(req, env); if (a.response) return a.response;
  const b = await req.json().catch(() => null), id = digits(b?.studentId);
  const row = id ? await env.DB.prepare("SELECT student_id FROM camp_school_survey WHERE student_id=?").bind(id).first() : null;
  if (!row) return fail(req, env, "ไม่พบแบบสำรวจของนักศึกษาคนนี้", 404);
  await env.DB.prepare("DELETE FROM camp_school_survey WHERE student_id=?").bind(id).run();
  await audit(env, a, "SURVEY_DELETE", id);
  return json(req, env, { ok: true });
}
// every saved form with progress, ordered like the other exports: ฝ่าย order, then student id
async function adminList(req, env, url) {
  const a = await requireAdmin(req, env); if (a.response) return a.response;
  const dep = tidy(url.searchParams.get("department"));
  const rows = (await env.DB.prepare(
    `SELECT v.student_id,v.department_code,v.school_name,v.survey_date,v.checks,v.updated_at,s.name,s.year,d.name department_name
     FROM camp_school_survey v LEFT JOIN camp_students s ON s.student_id=v.student_id LEFT JOIN camp_departments d ON d.code=v.department_code
     ${dep ? "WHERE v.department_code=?" : ""} ORDER BY d.sort_order, v.student_id LIMIT 1000`).bind(...(dep ? [dep] : [])).all()).results || [];
  const assignees = ((await env.DB.prepare(
    `SELECT a.student_id,a.assigned_at,s.name,s.year,sel.department_code,d.name department_name,(SELECT 1 FROM camp_school_survey v WHERE v.student_id=a.student_id) has_form
     FROM camp_survey_assignees a LEFT JOIN camp_students s ON s.student_id=a.student_id LEFT JOIN camp_selections sel ON sel.student_id=a.student_id LEFT JOIN camp_departments d ON d.code=sel.department_code
     ORDER BY d.sort_order, a.student_id LIMIT 1000`).all()).results || []).map((r) => ({ studentId: r.student_id, name: r.name || "", year: r.year || null, departmentCode: r.department_code || null, departmentName: r.department_name || "", hasForm: !!r.has_form, assignedAt: r.assigned_at }));
  return json(req, env, { assignees, forms: rows.map((r) => ({ studentId: r.student_id, name: r.name || "", year: r.year || null, departmentCode: r.department_code, departmentName: r.department_name || "",
    schoolName: r.school_name, surveyDate: r.survey_date, done: parseArr(r.checks).filter((c) => c === 1 || c === true).length, total: SURVEY_FORMS[r.department_code]?.items.length || 0, updatedAt: r.updated_at })) });
}

export async function survey(req, env, url) {
  try {
    const p = url.pathname, m = req.method;
    if (m === "GET" && p === "/camps/survey/admin/templates") return await adminTemplates(req, env);
    if (m === "GET" && p === "/camps/survey/admin/student") return await adminStudent(req, env, url);
    if (m === "POST" && p === "/camps/survey/admin/save") return await adminSave(req, env);
    if (m === "POST" && p === "/camps/survey/admin/delete") return await adminDelete(req, env);
    if (m === "POST" && p === "/camps/survey/admin/assign") return await adminAssign(req, env);
    if (m === "GET" && p === "/camps/survey/me") return await studentMe(req, env);
    if (m === "POST" && p === "/camps/survey/save") return await studentSave(req, env);
    if (m === "GET" && p === "/camps/survey/admin/list") return await adminList(req, env, url);
    return fail(req, env, "Not Found", 404);
  } catch (e) {
    console.error("[survey] error:", e?.message || e);
    if (/no such (table|column)/i.test(String(e?.message))) return fail(req, env, "ระบบแบบสำรวจยังไม่พร้อมใช้งาน กรุณาแจ้งแอดมิน", 503, { code: "MIGRATION_REQUIRED" });
    return fail(req, env, "เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง", 500);
  }
}
