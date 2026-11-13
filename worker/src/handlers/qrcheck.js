// ระบบเช็ค QR (/qrcheck/): look the student up in the HR registration data, then record the result of an admin-defined check
// ("ตรวจครั้งที่ 1", "ตรวจสอบป้ายกับ AKA", …). The student data is read from camp_students / camp_selections / camp_departments.
import { json } from "../lib/cors.js";
import { getAuth0UserFromRequest, getAuth0Roles, getAuth0PictureByEmail } from "../lib/auth0.js";

const fail = (req, env, error, status = 400, extra = {}) => json(req, env, { error, ...extra }, status);
const clean = (v, max = 200) => String(v ?? "").normalize("NFC").replace(/[​-‍⁠﻿]/g, "").replace(/[   　]/g, " ").replace(/[ \t]+/g, " ").trim().slice(0, max);
const studentId = (v) => {
  const s = clean(v, 60).replace(/[๐-๙]/g, (c) => String(c.charCodeAt(0) - 0x0e50));
  const m = /^([a-z]{2})?(\d{6,12})(?:@lru\.ac\.th)?$/i.exec(s);
  return m ? m[2] : null;
};
const ADMIN_ROLES = ["camp_admin", "budget_admin"];
const KINDS = ["manual", "aka"];

// admin, or an officer an admin assigned (verified email). { adminOnly } restricts to admins.
async function actor(req, env, { adminOnly = false } = {}) {
  const a = await getAuth0UserFromRequest(req, env);
  if (!a.user) return { response: fail(req, env, a.unavailable ? "ระบบยืนยันตัวตนไม่พร้อมใช้งาน" : "กรุณาเข้าสู่ระบบ", a.unavailable ? 503 : 401) };
  const email = clean(a.user.email || "", 254).toLowerCase();
  let isAdmin = false;
  try { isAdmin = (await getAuth0Roles(env, a.user.sub)).some((r) => ADMIN_ROLES.includes(r)); }
  catch (e) { console.error("[qrcheck] role lookup:", e?.message || e); if (adminOnly) return { response: fail(req, env, "ตรวจสอบสิทธิ์ผู้ดูแลไม่ได้", 503) }; }
  if (isAdmin) return { user: a.user, email: email || "unknown", isAdmin: true };
  if (adminOnly) return { response: fail(req, env, "ต้องเป็นผู้ดูแลระบบ", 403) };
  if (!email || a.user.email_verified !== true) return { response: fail(req, env, "บัญชีต้องยืนยันอีเมลก่อนใช้งาน", 403) };
  const o = await env.DB.prepare("SELECT email FROM camp_qr_officers WHERE email=?").bind(email).first();
  if (!o) return { response: fail(req, env, "บัญชีนี้ยังไม่ได้รับมอบหมายให้ใช้ระบบเช็ค QR", 403) };
  return { user: a.user, email, isAdmin: false };
}
async function audit(env, a, action, entityId, metadata = {}) {
  await env.DB.prepare("INSERT INTO budget_audit_logs (uuid,actor_auth0_id,actor_email,action,entity_type,entity_uuid,metadata) VALUES (?,?,?,?,?,?,?)")
    .bind(crypto.randomUUID(), a.user.sub, a.email || "unknown", action, "qrcheck", entityId == null ? null : String(entityId), JSON.stringify(metadata)).run();
}
const CHECK_COLS = "id,name,description,kind,require_registered,active,sort_order";
const shapeCheck = (c) => ({ id: c.id, name: c.name, description: c.description, kind: c.kind, requireRegistered: !!c.require_registered, active: !!c.active, sortOrder: c.sort_order });

async function me(req, env) {
  const a = await actor(req, env); if (a.response) return a.response;
  return json(req, env, { ok: true, email: a.email, isAdmin: a.isAdmin });
}
async function listChecks(req, env, url) {
  const a = await actor(req, env); if (a.response) return a.response;
  const all = a.isAdmin && url.searchParams.get("all") === "1";
  const rows = (await env.DB.prepare(`SELECT ${CHECK_COLS} FROM camp_qr_checks ${all ? "" : "WHERE active=1"} ORDER BY sort_order,id`).all()).results || [];
  return json(req, env, { checks: rows.map(shapeCheck) });
}

const STUDENT_SQL = `SELECT s.student_id,s.name,s.year,s.gender,sel.department_code,d.name department_name
  FROM camp_students s LEFT JOIN camp_selections sel ON sel.student_id=s.student_id LEFT JOIN camp_departments d ON d.code=sel.department_code
  WHERE s.student_id=?`;
const RESULT_SQL = "SELECT result,note,reference,checked_by,checked_at,updated_by,updated_at FROM camp_qr_results WHERE check_id=? AND student_id=?";
async function pictureFor(env, id) {
  try { return await Promise.race([getAuth0PictureByEmail(env, `sb${id}@lru.ac.th`), new Promise((r) => setTimeout(() => r(null), 2500))]); }
  catch (e) { console.error("[qrcheck] picture lookup:", e?.message || e); return null; }
}
async function activeCheck(env, checkId) {
  const id = Number(checkId);
  if (!Number.isInteger(id) || id <= 0) return null;
  return await env.DB.prepare(`SELECT ${CHECK_COLS} FROM camp_qr_checks WHERE id=?`).bind(id).first();
}

// Read-only: who is this QR, and what does this check already say about them?
async function lookup(req, env) {
  const a = await actor(req, env); if (a.response) return a.response;
  const b = await req.json().catch(() => null), id = studentId(b?.studentId ?? b?.value);
  if (!id) return fail(req, env, "QR Code ไม่ใช่รหัสนักศึกษาที่ถูกต้อง", 400, { code: "BAD_QR" });
  const check = await activeCheck(env, b?.checkId);
  if (!check || !check.active) return fail(req, env, "เลือกรายการตรวจที่เปิดใช้งานก่อน", 400, { code: "NO_CHECK" });
  const st = await env.DB.prepare(STUDENT_SQL).bind(id).first();
  if (!st) return fail(req, env, "ไม่พบรหัสนักศึกษานี้ในฐานข้อมูลลงทะเบียน", 404, { code: "NOT_FOUND", studentId: id });
  const [result, hist, picture] = await Promise.all([
    env.DB.prepare(RESULT_SQL).bind(check.id, id).first(),
    env.DB.prepare("SELECT r.check_id,c.name,r.result,r.checked_at FROM camp_qr_results r JOIN camp_qr_checks c ON c.id=r.check_id WHERE r.student_id=? ORDER BY c.sort_order,c.id").bind(id).all(),
    pictureFor(env, id)
  ]);
  const registered = !!st.department_code;
  return json(req, env, {
    ok: true, check: shapeCheck(check), registered,
    blocked: check.require_registered && !registered ? "นักศึกษายังไม่ได้ลงทะเบียนเลือกฝ่าย" : null,
    student: { studentId: st.student_id, name: st.name, year: st.year, gender: st.gender, departmentCode: st.department_code, departmentName: st.department_name },
    result: result || null, history: hist.results || [], picture
  });
}

// body: { studentId, checkId, result: "pass"|"fail", note?, reference?, overwrite? }  (overwrite = admins correcting a recorded result)
async function record(req, env) {
  const a = await actor(req, env); if (a.response) return a.response;
  const b = await req.json().catch(() => null), id = studentId(b?.studentId);
  if (!id) return fail(req, env, "รหัสนักศึกษาไม่ถูกต้อง", 400, { code: "BAD_QR" });
  const check = await activeCheck(env, b?.checkId);
  if (!check || !check.active) return fail(req, env, "รายการตรวจนี้ไม่เปิดใช้งาน", 400, { code: "NO_CHECK" });
  if (!["pass", "fail"].includes(b?.result)) return fail(req, env, "ผลการตรวจต้องเป็น ผ่าน หรือ ไม่ผ่าน");
  const note = clean(b?.note, 300), reference = clean(b?.reference, 60);
  if (b.result === "fail" && !note) return fail(req, env, "ระบุเหตุผลเมื่อบันทึกว่าไม่ผ่าน", 400, { code: "NOTE_REQUIRED" });
  const st = await env.DB.prepare(STUDENT_SQL).bind(id).first();
  if (!st) return fail(req, env, "ไม่พบรหัสนักศึกษานี้ในฐานข้อมูลลงทะเบียน", 404, { code: "NOT_FOUND" });
  if (check.require_registered && !st.department_code) return fail(req, env, "นักศึกษายังไม่ได้ลงทะเบียนเลือกฝ่าย จึงบันทึกผลการตรวจนี้ไม่ได้", 409, { code: "NOT_REGISTERED" });
  const overwrite = b?.overwrite === true;
  if (overwrite && !a.isAdmin) return fail(req, env, "เฉพาะผู้ดูแลที่แก้ไขผลที่บันทึกแล้วได้", 403);
  let changed;
  if (overwrite) {
    const r = await env.DB.prepare(
      `INSERT INTO camp_qr_results (check_id,student_id,result,note,reference,checked_by) VALUES (?,?,?,?,?,?)
       ON CONFLICT(check_id,student_id) DO UPDATE SET result=excluded.result,note=excluded.note,reference=excluded.reference,updated_by=?,updated_at=datetime('now')`
    ).bind(check.id, id, b.result, note, reference, a.email, a.email).run();
    changed = r?.meta?.changes;
  } else {
    const r = await env.DB.prepare("INSERT INTO camp_qr_results (check_id,student_id,result,note,reference,checked_by) VALUES (?,?,?,?,?,?) ON CONFLICT(check_id,student_id) DO NOTHING")
      .bind(check.id, id, b.result, note, reference, a.email).run();
    changed = r?.meta?.changes;
  }
  const row = await env.DB.prepare(RESULT_SQL).bind(check.id, id).first();
  if (!changed) return fail(req, env, "ตรวจรายการนี้ไปแล้ว", 409, { code: "ALREADY_CHECKED", result: row });
  await audit(env, a, overwrite ? "QR_CHECK_EDIT" : "QR_CHECK_RECORD", id, { check: check.id, result: b.result, reference, note });
  return json(req, env, { ok: true, result: row });
}

// ---------- admin ----------
async function adminChecks(req, env) {
  const a = await actor(req, env, { adminOnly: true }); if (a.response) return a.response;
  const rows = (await env.DB.prepare(
    `SELECT c.${CHECK_COLS.split(",").join(",c.")},
       (SELECT COUNT(*) FROM camp_qr_results r WHERE r.check_id=c.id) results,
       (SELECT COUNT(*) FROM camp_qr_results r WHERE r.check_id=c.id AND r.result='pass') passed,
       (SELECT COUNT(*) FROM camp_qr_results r WHERE r.check_id=c.id AND r.result='fail') failed
     FROM camp_qr_checks c ORDER BY c.sort_order,c.id`).all()).results || [];
  const roster = (await env.DB.prepare("SELECT COUNT(*) c FROM camp_students").first())?.c || 0;
  const registered = (await env.DB.prepare("SELECT COUNT(*) c FROM camp_selections").first())?.c || 0;
  return json(req, env, { checks: rows.map((c) => ({ ...shapeCheck(c), results: c.results, passed: c.passed, failed: c.failed })), roster, registered });
}
function readCheckBody(b, partial) {
  const out = {};
  if (!partial || b?.name !== undefined) { out.name = clean(b?.name, 80); if (!out.name) return { error: "ระบุชื่อรายการตรวจ" }; }
  if (!partial || b?.description !== undefined) out.description = clean(b?.description, 300);
  if (!partial || b?.kind !== undefined) { out.kind = KINDS.includes(b?.kind) ? b.kind : "manual"; }
  if (!partial || b?.requireRegistered !== undefined) out.require_registered = b?.requireRegistered === false ? 0 : 1;
  if (!partial || b?.active !== undefined) out.active = b?.active === false ? 0 : 1;
  if (b?.sortOrder !== undefined) { const n = Number(b.sortOrder); if (!Number.isInteger(n) || n < 0 || n > 9999) return { error: "ลำดับต้องเป็นเลข 0–9999" }; out.sort_order = n; }
  return { out };
}
async function addCheck(req, env) {
  const a = await actor(req, env, { adminOnly: true }); if (a.response) return a.response;
  const b = await req.json().catch(() => null), r = readCheckBody(b, false);
  if (r.error) return fail(req, env, r.error);
  const max = (await env.DB.prepare("SELECT COALESCE(MAX(sort_order),0) m FROM camp_qr_checks").first())?.m || 0;
  try {
    await env.DB.prepare("INSERT INTO camp_qr_checks (name,description,kind,require_registered,active,sort_order,created_by) VALUES (?,?,?,?,?,?,?)")
      .bind(r.out.name, r.out.description ?? "", r.out.kind, r.out.require_registered, r.out.active, r.out.sort_order ?? max + 1, a.email).run();
    const id = (await env.DB.prepare("SELECT id FROM camp_qr_checks WHERE name=?").bind(r.out.name).first())?.id;
    await audit(env, a, "QR_CHECK_ADD", id, r.out);
    return json(req, env, { ok: true, id });
  } catch (e) {
    if (/UNIQUE|constraint/i.test(String(e?.message))) return fail(req, env, "มีรายการตรวจชื่อนี้แล้ว", 409);
    throw e;
  }
}
async function patchCheck(req, env, idValue) {
  const a = await actor(req, env, { adminOnly: true }); if (a.response) return a.response;
  const check = await activeCheck(env, idValue); if (!check) return fail(req, env, "ไม่พบรายการตรวจ", 404);
  const b = await req.json().catch(() => null), r = readCheckBody(b, true);
  if (r.error) return fail(req, env, r.error);
  const keys = Object.keys(r.out); if (!keys.length) return fail(req, env, "ไม่มีข้อมูลที่จะแก้ไข");
  try { await env.DB.prepare(`UPDATE camp_qr_checks SET ${keys.map((k) => `${k}=?`).join(",")} WHERE id=?`).bind(...keys.map((k) => r.out[k]), check.id).run(); }
  catch (e) { if (/UNIQUE|constraint/i.test(String(e?.message))) return fail(req, env, "มีรายการตรวจชื่อนี้แล้ว", 409); throw e; }
  await audit(env, a, "QR_CHECK_UPDATE", check.id, r.out);
  return json(req, env, { ok: true });
}
async function deleteCheck(req, env, idValue) {
  const a = await actor(req, env, { adminOnly: true }); if (a.response) return a.response;
  const check = await activeCheck(env, idValue); if (!check) return fail(req, env, "ไม่พบรายการตรวจ", 404);
  const n = (await env.DB.prepare("SELECT COUNT(*) c FROM camp_qr_results WHERE check_id=?").bind(check.id).first())?.c || 0;
  if (n) return fail(req, env, `รายการนี้มีผลการตรวจ ${n} รายการแล้ว ลบไม่ได้ (ปิดใช้งานแทนได้)`, 409, { code: "HAS_RESULTS" });
  await env.DB.prepare("DELETE FROM camp_qr_checks WHERE id=?").bind(check.id).run();
  await audit(env, a, "QR_CHECK_DELETE", check.id, { name: check.name });
  return json(req, env, { ok: true });
}
async function adminResults(req, env, url) {
  const a = await actor(req, env, { adminOnly: true }); if (a.response) return a.response;
  const checkId = Number(url.searchParams.get("checkId")), result = url.searchParams.get("result"), q = clean(url.searchParams.get("q"), 100);
  const where = [], p = [];
  if (Number.isInteger(checkId) && checkId > 0) { where.push("r.check_id=?"); p.push(checkId); }
  if (["pass", "fail"].includes(result)) { where.push("r.result=?"); p.push(result); }
  if (q) { where.push("(r.student_id LIKE ? OR s.name LIKE ? OR r.reference LIKE ?)"); p.push(`%${q}%`, `%${q}%`, `%${q}%`); }
  const rows = (await env.DB.prepare(
    `SELECT r.check_id,c.name check_name,r.student_id,s.name,s.year,s.gender,d.name department_name,r.result,r.note,r.reference,r.checked_by,r.checked_at,r.updated_by,r.updated_at
     FROM camp_qr_results r JOIN camp_qr_checks c ON c.id=r.check_id
     LEFT JOIN camp_students s ON s.student_id=r.student_id LEFT JOIN camp_selections sel ON sel.student_id=r.student_id LEFT JOIN camp_departments d ON d.code=sel.department_code
     ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY r.checked_at DESC,r.id DESC LIMIT 1000`).bind(...p).all()).results || [];
  return json(req, env, { results: rows });
}
async function listOfficers(req, env) {
  const a = await actor(req, env, { adminOnly: true }); if (a.response) return a.response;
  return json(req, env, { officers: (await env.DB.prepare("SELECT email,added_by,created_at FROM camp_qr_officers ORDER BY email").all()).results || [] });
}
async function addOfficer(req, env) {
  const a = await actor(req, env, { adminOnly: true }); if (a.response) return a.response;
  const b = await req.json().catch(() => null), email = clean(b?.email, 254).toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return fail(req, env, "อีเมลไม่ถูกต้อง");
  await env.DB.prepare("INSERT INTO camp_qr_officers (email,added_by) VALUES (?,?) ON CONFLICT(email) DO UPDATE SET added_by=excluded.added_by").bind(email, a.email).run();
  await audit(env, a, "QR_OFFICER_ADD", email);
  return json(req, env, { ok: true });
}
async function removeOfficer(req, env, value) {
  const a = await actor(req, env, { adminOnly: true }); if (a.response) return a.response;
  const email = clean(decodeURIComponent(value), 254).toLowerCase();
  await env.DB.prepare("DELETE FROM camp_qr_officers WHERE email=?").bind(email).run();
  await audit(env, a, "QR_OFFICER_REMOVE", email);
  return json(req, env, { ok: true });
}

export async function qrcheck(req, env, url) {
  try {
    const p = url.pathname, m = req.method;
    if (m === "GET" && p === "/camps/qrcheck/me") return await me(req, env);
    if (m === "GET" && p === "/camps/qrcheck/checks") return await listChecks(req, env, url);
    if (m === "POST" && p === "/camps/qrcheck/lookup") return await lookup(req, env);
    if (m === "POST" && p === "/camps/qrcheck/record") return await record(req, env);
    if (m === "GET" && p === "/camps/qrcheck/admin/checks") return await adminChecks(req, env);
    if (m === "POST" && p === "/camps/qrcheck/admin/checks") return await addCheck(req, env);
    const one = p.match(/^\/camps\/qrcheck\/admin\/checks\/(\d+)$/);
    if (m === "PATCH" && one) return await patchCheck(req, env, one[1]);
    if (m === "DELETE" && one) return await deleteCheck(req, env, one[1]);
    if (m === "GET" && p === "/camps/qrcheck/admin/results") return await adminResults(req, env, url);
    if (m === "GET" && p === "/camps/qrcheck/admin/officers") return await listOfficers(req, env);
    if (m === "POST" && p === "/camps/qrcheck/admin/officers") return await addOfficer(req, env);
    const off = p.match(/^\/camps\/qrcheck\/admin\/officers\/(.+)$/);
    if (m === "DELETE" && off) return await removeOfficer(req, env, off[1]);
    return fail(req, env, "Not Found", 404);
  } catch (e) {
    console.error("[qrcheck] error:", e?.message || e);
    if (/no such (table|column)/i.test(String(e?.message))) return fail(req, env, "ฐานข้อมูลยังไม่ได้ติดตั้ง migration ของระบบเช็ค QR", 503, { code: "MIGRATION_REQUIRED" });
    return fail(req, env, "ระบบขัดข้อง กรุณาลองใหม่", 500);
  }
}
