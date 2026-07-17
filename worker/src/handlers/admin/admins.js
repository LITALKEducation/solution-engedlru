import { json } from "../../lib/cors.js";
import { checkAdminStatus } from "../../lib/admin.js";

// GET /admin/me — endpoint เดียวใน /admin/* ที่ไม่ต้องเป็นแอดมินก็เรียกได้ (ใช้เช็คสถานะตัวเอง)
export async function me(request, env) {
  const status = await checkAdminStatus(request, env);
  return json(request, env, status);
}

// GET /admin/admins — ผ่าน requireAdmin จาก router แล้ว
export async function listAdmins(request, env) {
  const { results } = await env.DB.prepare(
    "SELECT email, created_at FROM admin_users ORDER BY created_at"
  ).all();
  return json(request, env, results);
}

// POST /admin/admins { email }
export async function addAdmin(request, env) {
  const body = await request.json().catch(() => null);
  const email = body?.email ? String(body.email).trim().toLowerCase() : null;
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return json(request, env, { error: "อีเมลไม่ถูกต้อง" }, 400);
  }

  await env.DB.prepare("INSERT OR IGNORE INTO admin_users (email) VALUES (?)").bind(email).run();
  return json(request, env, { status: "success" });
}

// DELETE /admin/admins/:email
export async function removeAdmin(request, env, email, adminEmail) {
  const target = decodeURIComponent(email).toLowerCase();
  if (target === adminEmail.toLowerCase()) {
    return json(request, env, { error: "ไม่สามารถลบสิทธิ์ของตัวเองได้" }, 400);
  }

  await env.DB.prepare("DELETE FROM admin_users WHERE email = ?").bind(target).run();
  return json(request, env, { status: "success" });
}
