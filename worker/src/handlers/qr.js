import { json } from "../lib/cors.js";
import { findActiveSchedule } from "./checkup.js";

const QR_TTL_MS = 5 * 60 * 1000;

function randomCode() {
  // รหัส 6 หลัก อ่าน/พิมพ์เองได้ ใช้เป็น fallback ถ้าสแกนกล้องไม่ได้
  const n = crypto.getRandomValues(new Uint32Array(1))[0] % 1000000;
  return String(n).padStart(6, "0");
}

// POST /checkup/qr — ฝั่งนักศึกษา: ขอรหัส QR ใช้ครั้งเดียว อายุ 5 นาที
export async function generateQr(request, env) {
  const data = await request.json().catch(() => null);
  if (!data || !data.studentId || !data.name) {
    return json(request, env, { status: "error", message: "ข้อมูลไม่ครบถ้วน" }, 400);
  }
  const studentId = String(data.studentId).trim();
  const name = String(data.name).trim();

  const student = await env.DB.prepare(
    "SELECT student_id FROM checkup_students WHERE student_id = ?"
  ).bind(studentId).first();
  if (!student) {
    return json(request, env, { status: "error", message: `ถูกปฏิเสธ: ไม่พบรหัสนักศึกษา ${studentId} ในระบบ` });
  }

  const active = await findActiveSchedule(env);
  if (!active) {
    return json(request, env, { status: "error", message: "ถูกปฏิเสธ: นอกเวลาทำการ ไม่สามารถสร้างรหัสได้" });
  }

  let code;
  for (let attempt = 0; attempt < 5; attempt++) {
    code = randomCode();
    const clash = await env.DB.prepare("SELECT id FROM checkin_qr_tokens WHERE code = ?").bind(code).first();
    if (!clash) break;
    code = null;
  }
  if (!code) return json(request, env, { status: "error", message: "ไม่สามารถสร้างรหัสได้ กรุณาลองใหม่" }, 500);

  const expiresAt = new Date(Date.now() + QR_TTL_MS).toISOString();
  await env.DB.prepare(
    `INSERT INTO checkin_qr_tokens (code, student_id, student_name, schedule_id, expires_at)
     VALUES (?, ?, ?, ?, ?)`
  ).bind(code, studentId, name, active.id, expiresAt).run();

  return json(request, env, {
    status: "success",
    code,
    expiresAt,
    studentId,
    name,
    activityName: active.name
  });
}

// POST /admin/checkup/qr/scan — ฝั่งแอดมิน: แสกน/กรอกรหัสเพื่อยืนยันตัวตนแล้วบันทึกเช็คชื่อ (ผ่าน requireAdmin จาก router แล้ว)
export async function scanQr(request, env, adminEmail) {
  const data = await request.json().catch(() => null);
  const code = data?.code ? String(data.code).trim() : null;
  if (!code) return json(request, env, { status: "error", message: "ต้องระบุรหัส" }, 400);

  const token = await env.DB.prepare(
    "SELECT * FROM checkin_qr_tokens WHERE code = ?"
  ).bind(code).first();

  if (!token) return json(request, env, { status: "error", message: "ไม่พบรหัสนี้ในระบบ" }, 404);
  if (token.used_at) return json(request, env, { status: "error", message: "รหัสนี้ถูกใช้ไปแล้ว" }, 409);
  if (new Date(token.expires_at).getTime() < Date.now()) {
    return json(request, env, { status: "error", message: "รหัสหมดเวลาแล้ว กรุณาให้นักศึกษาสร้างรหัสใหม่" }, 410);
  }

  await env.DB.prepare(
    "UPDATE checkin_qr_tokens SET used_at = datetime('now'), used_by_admin = ? WHERE id = ?"
  ).bind(adminEmail, token.id).run();

  await env.DB.prepare(
    `INSERT INTO checkup_logs (student_id, name, lat, lng, distance, map_link, schedule_id, method)
     VALUES (?, ?, NULL, NULL, NULL, NULL, ?, 'qr')`
  ).bind(token.student_id, token.student_name, token.schedule_id).run();

  return json(request, env, {
    status: "success",
    studentId: token.student_id,
    name: token.student_name,
    code
  });
}
