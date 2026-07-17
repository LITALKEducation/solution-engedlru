import { getAuth0User } from "./auth0.js";
import { json } from "./cors.js";

// ตรวจสถานะแอดมินแบบไม่ throw error กลับ ใช้กับ /admin/me เพื่อให้หน้าเว็บกั้น UI เองได้
export async function checkAdminStatus(request, env) {
  const authHeader = request.headers.get("Authorization") || "";
  const accessToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!accessToken) return { isAdmin: false, email: null };

  const user = await getAuth0User(env, accessToken);
  if (!user || !user.email) return { isAdmin: false, email: null };

  const row = await env.DB.prepare(
    "SELECT email FROM admin_users WHERE email = ?"
  ).bind(user.email.toLowerCase()).first();

  return { isAdmin: !!row, email: user.email };
}

// ตรวจว่า request มาจากผู้ใช้ที่ล็อกอินด้วย Auth0 และอีเมลอยู่ในตาราง admin_users
// คืนค่า { ok: true, email } หรือ { ok: false, response } (response = Response พร้อมส่งกลับได้ทันที)
export async function requireAdmin(request, env) {
  const status = await checkAdminStatus(request, env);
  if (!status.email) {
    return { ok: false, response: json(request, env, { error: "Missing or invalid Authorization" }, 401) };
  }
  if (!status.isAdmin) {
    return { ok: false, response: json(request, env, { error: "Forbidden: not an admin" }, 403) };
  }
  return { ok: true, email: status.email };
}
