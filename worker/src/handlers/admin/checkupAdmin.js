import { json, corsHeaders } from "../../lib/cors.js";
import { toCsv } from "../../lib/csv.js";

// GET /admin/checkup/schedule
export async function listSchedule(request, env) {
  const { results } = await env.DB.prepare(
    "SELECT id, name, open_at, close_at, lat, lng, radius_m FROM checkup_schedule ORDER BY id"
  ).all();
  return json(request, env, results);
}

// POST /admin/checkup/schedule { name, open_at, close_at, lat, lng, radius_m }
export async function createSchedule(request, env) {
  const body = await request.json().catch(() => null);
  if (!body || !body.name || !body.open_at || !body.close_at) {
    return json(request, env, { error: "ต้องระบุ name, open_at, close_at" }, 400);
  }
  const lat = body.lat != null ? Number(body.lat) : null;
  const lng = body.lng != null ? Number(body.lng) : null;
  const radiusM = body.radius_m != null ? Number(body.radius_m) : 100;

  const res = await env.DB.prepare(
    "INSERT INTO checkup_schedule (name, open_at, close_at, lat, lng, radius_m) VALUES (?, ?, ?, ?, ?, ?)"
  ).bind(body.name.trim(), body.open_at.trim(), body.close_at.trim(), lat, lng, radiusM).run();

  return json(request, env, { status: "success", id: res.meta.last_row_id });
}

// PUT /admin/checkup/schedule/:id
export async function updateSchedule(request, env, id) {
  const body = await request.json().catch(() => null);
  if (!body) return json(request, env, { error: "รูปแบบข้อมูลไม่ถูกต้อง" }, 400);

  const existing = await env.DB.prepare("SELECT id FROM checkup_schedule WHERE id = ?").bind(id).first();
  if (!existing) return json(request, env, { error: "ไม่พบกิจกรรม" }, 404);

  const name = body.name?.trim();
  const openAt = body.open_at?.trim();
  const closeAt = body.close_at?.trim();
  const lat = body.lat != null ? Number(body.lat) : null;
  const lng = body.lng != null ? Number(body.lng) : null;
  const radiusM = body.radius_m != null ? Number(body.radius_m) : 100;

  if (!name || !openAt || !closeAt) {
    return json(request, env, { error: "ต้องระบุ name, open_at, close_at" }, 400);
  }

  await env.DB.prepare(
    "UPDATE checkup_schedule SET name = ?, open_at = ?, close_at = ?, lat = ?, lng = ?, radius_m = ? WHERE id = ?"
  ).bind(name, openAt, closeAt, lat, lng, radiusM, id).run();

  return json(request, env, { status: "success" });
}

// DELETE /admin/checkup/schedule/:id
export async function deleteSchedule(request, env, id) {
  await env.DB.prepare("DELETE FROM checkup_schedule WHERE id = ?").bind(id).run();
  return json(request, env, { status: "success" });
}

// GET /admin/checkup/logs?scheduleId=
export async function listLogs(request, env, url) {
  const scheduleId = url.searchParams.get("scheduleId");
  let query = `SELECT l.id, l.created_at, l.student_id, l.name, l.lat, l.lng, l.distance, l.map_link, l.method, l.schedule_id, s.name AS schedule_name
               FROM checkup_logs l LEFT JOIN checkup_schedule s ON s.id = l.schedule_id`;
  const binds = [];
  if (scheduleId) {
    query += " WHERE l.schedule_id = ?";
    binds.push(scheduleId);
  }
  query += " ORDER BY l.id DESC";

  const { results } = await env.DB.prepare(query).bind(...binds).all();
  return json(request, env, results);
}

// GET /admin/checkup/logs/export.csv?scheduleId=
export async function exportLogsCsv(request, env, url) {
  const res = await listLogs(request, env, url);
  const rows = await res.json();

  const header = ["เวลา", "รหัสนักศึกษา", "ชื่อ-สกุล", "กิจกรรม", "วิธีเช็คชื่อ", "ระยะทาง (ม.)", "ลิงก์แผนที่"];
  const body = rows.map(r => [
    r.created_at, r.student_id, r.name, r.schedule_name || "",
    r.method === "qr" ? "QR" : "GPS", r.distance ?? "", r.map_link || ""
  ]);
  const csv = toCsv([header, ...body]);

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="checkin-log.csv"',
      ...corsHeaders(request, env)
    }
  });
}
