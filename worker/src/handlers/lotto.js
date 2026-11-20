import { json } from "../lib/cors.js";
import { permDenied } from "./camps.js";
import { getAuth0UserFromRequest, getAuth0Roles, getAuth0PictureByEmail } from "../lib/auth0.js";

const fail = (req, env, error, status = 400, extra = {}) => json(req, env, { error, ...extra }, status);
const clean = (v, max = 200) => String(v ?? "").normalize("NFC").replace(/[\u200b-\u200d\u2060\ufeff]/g, "").trim().slice(0, max);
const studentId = (v) => {
  const s = clean(v, 30).replace(/[๐-๙]/g, c => String(c.charCodeAt(0) - 0x0e50));
  const m = /^([a-z]{2})?(\d{6,12})(?:@lru\.ac\.th)?$/i.exec(s);
  return m ? m[2] : null;
};
const allowed = ["camp_admin", "budget_admin"];

async function actor(req, env) {
  const a = await getAuth0UserFromRequest(req, env);
  if (!a.user) return { response: fail(req, env, a.unavailable ? "ระบบยืนยันตัวตนไม่พร้อมใช้งาน" : "กรุณาเข้าสู่ระบบ", a.unavailable ? 503 : 401) };
  let roles;
  try { roles = await getAuth0Roles(env, a.user.sub); }
  catch (e) { console.error("[lotto] role lookup:", e?.message || e); return { response: fail(req, env, "ตรวจสอบสิทธิ์แอดมินไม่ได้", 503) }; }
  if (!roles.some(r => allowed.includes(r))) return { response: fail(req, env, "ไม่มีสิทธิ์ใช้งานระบบจับสลาก", 403) };
  const w = { user: a.user, email: clean(a.user.email || "unknown", 254).toLowerCase() };
  const d = await permDenied(req, env, w, "lotto"); if (d) return { response: d };
  return w;
}

async function list(req, env, url) {
  const a = await actor(req, env); if (a.response) return a.response;
  const q = clean(url.searchParams.get("q"), 100);
  const limit = Math.min(500, Math.max(1, Number(url.searchParams.get("limit")) || 200));
  const rows = await env.DB.prepare(
    `SELECT student_id, student_name, draw_number, created_at, updated_at, checked_at, checked_by, gift_opened_at, gift_opened_by
     FROM camp_lotto_students
     WHERE (? = '' OR student_id LIKE ? OR student_name LIKE ? OR draw_number LIKE ?)
     ORDER BY CAST(draw_number AS INTEGER), draw_number, student_id LIMIT ?`
  ).bind(q, `%${q}%`, `%${q}%`, `%${q}%`, limit).all();
  return json(req, env, { students: rows.results || [] });
}

async function overview(req, env) {
  const a = await actor(req, env); if (a.response) return a.response;
  const stats = await env.DB.prepare(
    `SELECT COUNT(*) total, SUM(CASE WHEN checked_at IS NOT NULL THEN 1 ELSE 0 END) checked, SUM(CASE WHEN gift_opened_at IS NOT NULL THEN 1 ELSE 0 END) gifts
     FROM camp_lotto_students`
  ).first();
  return json(req, env, { total: stats?.total || 0, checked: stats?.checked || 0, gifts: stats?.gifts || 0, remaining: (stats?.total || 0) - (stats?.checked || 0) });
}

async function upsert(req, env) {
  const a = await actor(req, env); if (a.response) return a.response;
  const b = await req.json().catch(() => null);
  const id = studentId(b?.studentId), name = clean(b?.name, 200), number = clean(b?.drawNumber, 30);
  if (!id) return fail(req, env, "รหัสนักศึกษาต้องเป็นตัวเลข 6–12 หลัก");
  if (!name) return fail(req, env, "กรุณาระบุชื่อ-นามสกุล");
  if (!number || !/^[\p{L}\p{N}-]{1,30}$/u.test(number)) return fail(req, env, "กรุณาระบุเลขจับสลาก (ตัวอักษร/ตัวเลข/ขีดกลาง)");
  const existing = await env.DB.prepare("SELECT checked_at FROM camp_lotto_students WHERE student_id=?").bind(id).first();
  try {
    await env.DB.prepare(
      `INSERT INTO camp_lotto_students (student_id,student_name,draw_number,updated_at)
       VALUES (?,?,?,datetime('now'))
       ON CONFLICT(student_id) DO UPDATE SET student_name=excluded.student_name, draw_number=excluded.draw_number, updated_at=datetime('now')`
    ).bind(id, name, number).run();
  } catch (e) {
    if (/UNIQUE|constraint/i.test(String(e?.message))) return fail(req, env, "เลขจับสลากนี้ถูกกำหนดให้ผู้อื่นแล้ว", 409);
    throw e;
  }
  return json(req, env, { ok: true, created: !existing, checked: !!existing?.checked_at });
}

async function bulk(req, env) {
  const a = await actor(req, env); if (a.response) return a.response;
  const b = await req.json().catch(() => null);
  if (!Array.isArray(b?.students) || !b.students.length) return fail(req, env, "ไม่พบรายชื่อสำหรับนำเข้า");
  if (b.students.length > 1000) return fail(req, env, "นำเข้าได้ครั้งละไม่เกิน 1,000 รายชื่อ");
  const rows = [], errors = [], ids = new Set(), nums = new Set();
  for (let i=0;i<b.students.length;i++) {
    const x=b.students[i], id=studentId(x?.studentId), name=clean(x?.name,200), number=clean(x?.drawNumber,30);
    if (!id || !name || !number || !/^[\p{L}\p{N}-]{1,30}$/u.test(number)) { errors.push({row:i+1,error:"ข้อมูลไม่ครบหรือรูปแบบไม่ถูกต้อง"}); continue; }
    if (ids.has(id) || nums.has(number)) { errors.push({row:i+1,error:"รหัสนักศึกษาหรือเลขจับสลากซ้ำในไฟล์"}); continue; }
    ids.add(id); nums.add(number); rows.push({id,name,number});
  }
  let imported=0;
  for (const x of rows) {
    try {
      await env.DB.prepare(
        `INSERT INTO camp_lotto_students (student_id,student_name,draw_number,updated_at)
         VALUES (?,?,?,datetime('now'))
         ON CONFLICT(student_id) DO UPDATE SET student_name=excluded.student_name,draw_number=excluded.draw_number,updated_at=datetime('now')`
      ).bind(x.id,x.name,x.number).run();
      imported++;
    } catch (e) { errors.push({studentId:x.id,error:/UNIQUE|constraint/i.test(String(e?.message))?"เลขจับสลากนี้ถูกใช้แล้ว":"บันทึกไม่สำเร็จ"}); }
  }
  return json(req, env, { ok: true, imported, errors });
}

async function remove(req, env, idValue) {
  const a = await actor(req, env); if (a.response) return a.response;
  const id = studentId(decodeURIComponent(idValue));
  if (!id) return fail(req, env, "รหัสนักศึกษาไม่ถูกต้อง");
  const row = await env.DB.prepare("SELECT checked_at FROM camp_lotto_students WHERE student_id=?").bind(id).first();
  if (!row) return fail(req, env, "ไม่พบรายชื่อนี้", 404);
  if (row.checked_at) return fail(req, env, "รายชื่อนี้ถูกเช็คชื่อแล้ว ไม่สามารถลบได้", 409);
  await env.DB.prepare("DELETE FROM camp_lotto_students WHERE student_id=?").bind(id).run();
  return json(req, env, { ok: true });
}

async function scanActor(req, env, { needAdmin = false } = {}) {
  const auth = await getAuth0UserFromRequest(req, env);
  if (!auth.user) return { response: fail(req, env, auth.unavailable ? "ระบบยืนยันตัวตนไม่พร้อมใช้งาน" : "กรุณาเข้าสู่ระบบ", auth.unavailable ? 503 : 401) };
  const email = clean(auth.user.email || "", 254).toLowerCase();
  if (!email || auth.user.email_verified !== true) return { response: fail(req, env, "บัญชีต้องยืนยันอีเมลก่อนสแกน", 403) };
  const assigned = await env.DB.prepare("SELECT email FROM camp_lotto_scanners WHERE email=? AND active=1").bind(email).first();
  if (assigned && !needAdmin) return { email, isAdmin: false };   // the hot path (every scan): no Auth0 role lookup
  let isAdmin = false;
  try { const roles = await getAuth0Roles(env, auth.user.sub); isAdmin = roles.some(r => allowed.includes(r)); }
  catch (e) { console.error("[lotto] scanner role lookup:", e?.message || e); }
  if (assigned || isAdmin) return { email, isAdmin };
  return { response: fail(req, env, "บัญชีนี้ยังไม่ได้รับมอบหมายให้เป็นเจ้าหน้าที่สแกน", 403) };
}

async function listScanners(req, env) {
  const a = await actor(req, env); if (a.response) return a.response;
  const r = await env.DB.prepare("SELECT email,created_at,active FROM camp_lotto_scanners ORDER BY email").all();
  return json(req, env, { scanners: r.results || [] });
}
async function addScanner(req, env) {
  const a = await actor(req, env); if (a.response) return a.response;
  const b = await req.json().catch(() => null), email = clean(b?.email,254).toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return fail(req, env, "อีเมลไม่ถูกต้อง");
  await env.DB.prepare("INSERT INTO camp_lotto_scanners (email,added_by) VALUES (?,?) ON CONFLICT(email) DO UPDATE SET active=1,added_by=excluded.added_by").bind(email,a.email).run();
  return json(req, env, { ok: true });
}
async function removeScanner(req, env, value) {
  const a = await actor(req, env); if (a.response) return a.response;
  const email = clean(decodeURIComponent(value),254).toLowerCase();
  await env.DB.prepare("DELETE FROM camp_lotto_scanners WHERE email=?").bind(email).run();
  return json(req, env, { ok: true });
}

async function scannerMe(req, env) {
  const a = await scanActor(req, env, { needAdmin: true }); if (a.response) return a.response;
  return json(req, env, { ok: true, email: a.email, isAdmin: a.isAdmin });
}
async function scannerLookup(req, env, url) {
  const a = await scanActor(req, env); if (a.response) return a.response;
  const q = clean(url.searchParams.get("q"),100);
  if (!q) return json(req,env,{students:[]});
  const r = await env.DB.prepare(
    "SELECT student_id,student_name,draw_number,created_at,updated_at,checked_at,checked_by,gift_opened_at,gift_opened_by FROM camp_lotto_students WHERE student_id LIKE ? OR student_name LIKE ? OR draw_number LIKE ? ORDER BY draw_number LIMIT 100"
  ).bind(`%${q}%`,`%${q}%`,`%${q}%`).all();
  return json(req,env,{students:r.results||[]});
}

// Student avatar from Auth0 (university emails are sb<id>@lru.ac.th). Never blocks or fails a scan.
async function studentPicture(env, id) {
  try {
    return await Promise.race([getAuth0PictureByEmail(env, `sb${id}@lru.ac.th`), new Promise((r) => setTimeout(() => r(null), 2500))]);
  } catch (e) { console.error("[lotto] picture lookup:", e?.message || e); return null; }
}

// Read-only QR check: is this student's QR already checked in? Never changes anything.
async function verify(req, env, url) {
  const a = await scanActor(req, env); if (a.response) return a.response;
  const id = studentId(url.searchParams.get("studentId") ?? url.searchParams.get("value"));
  if (!id) return fail(req, env, "QR Code ไม่ใช่รหัสนักศึกษาที่ถูกต้อง");
  const row = await env.DB.prepare("SELECT student_id,student_name,draw_number,checked_at,checked_by,gift_opened_at,gift_opened_by FROM camp_lotto_students WHERE student_id=?").bind(id).first();
  if (!row) return fail(req, env, "ไม่พบรหัสนักศึกษาในรายชื่อจับสลาก", 404, { code: "NOT_FOUND" });
  return json(req, env, { ok: true, checked: !!row.checked_at, student: row });
}

// The hot path: ONE atomic UPDATE ... RETURNING checks the student in (a second scan matches no row), then one log row. No Auth0 call, no photo.
const COLS = "student_id,student_name,draw_number,checked_at,checked_by,gift_opened_at,gift_opened_by";
async function scan(req, env) {
  const a = await scanActor(req, env); if (a.response) return a.response;
  const b = await req.json().catch(() => null), id = studentId(b?.studentId ?? b?.value);
  if (!id) return fail(req, env, "QR Code ไม่ใช่รหัสนักศึกษาที่ถูกต้อง");
  const done = await env.DB.prepare(`UPDATE camp_lotto_students SET checked_at=datetime('now'),checked_by=?,updated_at=datetime('now') WHERE student_id=? AND checked_at IS NULL RETURNING ${COLS}`).bind(a.email, id).first();
  if (done) {
    await env.DB.prepare("INSERT INTO camp_lotto_scan_logs (student_id,draw_number,actor_email,result) VALUES (?,?,?,'checked')").bind(id, done.draw_number, a.email).run();
    return json(req, env, { ok: true, student: done });
  }
  const row = await env.DB.prepare(`SELECT ${COLS} FROM camp_lotto_students WHERE student_id=?`).bind(id).first();
  if (!row) return fail(req, env, "ไม่พบรหัสนักศึกษาในรายชื่อจับสลาก", 404, { code: "NOT_FOUND" });
  return json(req, env, { ok: false, alreadyChecked: true, student: row }, 409);
}
// The photo (Auth0 Management API, can take seconds) is fetched on its own so it never slows a scan; the page fills it in when it arrives.
async function picture(req, env, url) {
  const a = await scanActor(req, env); if (a.response) return a.response;
  const id = studentId(url.searchParams.get("studentId"));
  if (!id) return fail(req, env, "รหัสนักศึกษาไม่ถูกต้อง");
  return json(req, env, { picture: await studentPicture(env, id) });
}
// Everyone on the list with their draw number and check-in state, so the scan page can show the number the instant a QR is read and keep working without a signal.
async function roster(req, env) {
  const a = await scanActor(req, env); if (a.response) return a.response;
  const r = await env.DB.prepare("SELECT student_id,student_name,draw_number,checked_at,checked_by FROM camp_lotto_students ORDER BY CAST(draw_number AS INTEGER), draw_number LIMIT 5000").all();
  return json(req, env, { students: (r.results || []).map((x) => ({ id: x.student_id, name: x.student_name, number: x.draw_number, checkedAt: x.checked_at, checkedBy: x.checked_by })) });
}
async function stats(req, env) {
  const a = await scanActor(req, env); if (a.response) return a.response;
  const [t, mine, recent] = await Promise.all([
    env.DB.prepare("SELECT COUNT(*) total, COALESCE(SUM(checked_at IS NOT NULL),0) checked FROM camp_lotto_students").first(),
    env.DB.prepare("SELECT COUNT(*) n FROM camp_lotto_students WHERE checked_at IS NOT NULL AND lower(checked_by)=?").bind(a.email).first(),
    env.DB.prepare("SELECT student_id,student_name,draw_number,checked_at,checked_by FROM camp_lotto_students WHERE checked_at IS NOT NULL ORDER BY checked_at DESC, rowid DESC LIMIT 8").all()
  ]);
  return json(req, env, { total: t?.total || 0, checked: t?.checked || 0, mine: mine?.n || 0,
    recent: (recent.results || []).map((r) => ({ id: r.student_id, name: r.student_name, number: r.draw_number, checkedAt: r.checked_at, mine: String(r.checked_by).toLowerCase() === a.email })) });
}
// Undo a wrong scan: the officer who checked the person in, or an admin. The student counts as "not checked" again.
async function undo(req, env) {
  const a = await scanActor(req, env, { needAdmin: true }); if (a.response) return a.response;
  const b = await req.json().catch(() => null), id = studentId(b?.studentId ?? b?.value);
  if (!id) return fail(req, env, "QR Code ไม่ใช่รหัสนักศึกษาที่ถูกต้อง");
  const row = await env.DB.prepare(`SELECT ${COLS} FROM camp_lotto_students WHERE student_id=?`).bind(id).first();
  if (!row) return fail(req, env, "ไม่พบรหัสนักศึกษาในรายชื่อจับสลาก", 404, { code: "NOT_FOUND" });
  if (!row.checked_at) return fail(req, env, "ยังไม่ได้เช็กชื่อ จึงไม่มีอะไรให้ยกเลิก", 409, { code: "NOT_CHECKED_IN" });
  if (!a.isAdmin && String(row.checked_by).toLowerCase() !== a.email) return fail(req, env, "ยกเลิกได้เฉพาะรายการที่คุณเช็กชื่อเอง (หรือแอดมิน)", 403);
  await env.DB.prepare("UPDATE camp_lotto_students SET checked_at=NULL,checked_by=NULL,gift_opened_at=NULL,gift_opened_by=NULL,updated_at=datetime('now') WHERE student_id=?").bind(id).run();
  await env.DB.prepare("INSERT INTO camp_lotto_scan_logs (student_id,draw_number,actor_email,result) VALUES (?,?,?,'undone')").bind(id, row.draw_number, a.email).run();
  return json(req, env, { ok: true });
}

// Open the gift (reveals the draw number): only after check-in, once. A second call just reports who opened it and when.
async function openGift(req, env) {
  const a = await scanActor(req, env); if (a.response) return a.response;
  const b = await req.json().catch(() => null), id = studentId(b?.studentId ?? b?.value);
  if (!id) return fail(req, env, "QR Code ไม่ใช่รหัสนักศึกษาที่ถูกต้อง");
  const SEL = "SELECT student_id,student_name,draw_number,checked_at,checked_by,gift_opened_at,gift_opened_by FROM camp_lotto_students WHERE student_id=?";
  const row = await env.DB.prepare(SEL).bind(id).first();
  if (!row) return fail(req, env, "ไม่พบรหัสนักศึกษาในรายชื่อจับสลาก", 404, { code: "NOT_FOUND" });
  if (!row.checked_at) return fail(req, env, "ต้องเช็คชื่อก่อนจึงจะเปิดของขวัญได้", 409, { code: "NOT_CHECKED_IN", student: { ...row, draw_number: null } });
  const res = await env.DB.prepare("UPDATE camp_lotto_students SET gift_opened_at=datetime('now'),gift_opened_by=?,updated_at=datetime('now') WHERE student_id=? AND gift_opened_at IS NULL").bind(a.email, id).run();
  const latest = await env.DB.prepare(SEL).bind(id).first();
  if (!res?.meta?.changes) return json(req, env, { ok: true, firstTime: false, student: latest });
  await env.DB.prepare("INSERT INTO camp_lotto_scan_logs (student_id,draw_number,actor_email,result) VALUES (?,?,?,'gift_opened')").bind(id, row.draw_number, a.email).run();
  return json(req, env, { ok: true, firstTime: true, student: latest });
}

export async function lotto(req, env, url) {
  try {
    const p=url.pathname, m=req.method;
    if (m==="GET" && p==="/camps/lotto/admin/scanners") return await listScanners(req,env);
    if (m==="POST" && p==="/camps/lotto/admin/scanners") return await addScanner(req,env);
    const scannerDel=p.match(/^\/camps\/lotto\/admin\/scanners\/(.+)$/);
    if (m==="DELETE" && scannerDel) return await removeScanner(req,env,scannerDel[1]);
    if (m==="GET" && p==="/camps/lotto/scanner/me") return await scannerMe(req,env);
    if (m==="GET" && p==="/camps/lotto/scanner/verify") return await verify(req,env,url);
    if (m==="GET" && p==="/camps/lotto/scanner/lookup") return await scannerLookup(req,env,url);
    if (m==="GET" && p==="/camps/lotto/scanner/roster") return await roster(req,env);
    if (m==="GET" && p==="/camps/lotto/scanner/stats") return await stats(req,env);
    if (m==="GET" && p==="/camps/lotto/scanner/picture") return await picture(req,env,url);
    if (m==="POST" && p==="/camps/lotto/scanner/undo") return await undo(req,env);
    if (m==="GET" && p==="/camps/lotto/admin/overview") return await overview(req,env);
    if (m==="GET" && p==="/camps/lotto/admin/students") return await list(req,env,url);
    if (m==="POST" && p==="/camps/lotto/admin/students") return await upsert(req,env);
    if (m==="POST" && p==="/camps/lotto/admin/students/import") return await bulk(req,env);
    if (m==="POST" && p==="/camps/lotto/admin/scan") return await scan(req,env);
    if (m==="POST" && p==="/camps/lotto/scanner/gift/open") return await openGift(req,env);
    const del=p.match(/^\/camps\/lotto\/admin\/students\/([^/]+)$/);
    if (m==="DELETE" && del) return await remove(req,env,del[1]);
    return fail(req,env,"Not Found",404);
  } catch(e) {
    console.error("[lotto] error:",e?.message||e);
    if (/no such (table|column)/i.test(String(e?.message))) return fail(req,env,"ระบบจับสลากยังไม่พร้อมใช้งาน กรุณาแจ้งแอดมิน",503,{code:"MIGRATION_REQUIRED"});
    return fail(req,env,"เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง",500);
  }
}
