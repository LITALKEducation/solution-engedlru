import { json } from "../lib/cors.js";

const TARGET_LAT = 17.5393285;
const TARGET_LNG = 101.7193514;
const MAX_DISTANCE_METERS = 100;

function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const rad = v => (v * Math.PI) / 180;
  const dLat = rad(lat2 - lat1);
  const dLon = rad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// GET /checkup/schedule — เดิมคือ checkup.gs doGet()
export async function getSchedule(request, env) {
  const { results } = await env.DB.prepare(
    "SELECT name, open_at, close_at FROM checkup_schedule ORDER BY id"
  ).all();

  const schedule = results.map(r => ({ name: r.name, open: r.open_at, close: r.close_at }));
  return json(request, env, { status: "success", data: schedule });
}

async function isSystemOpen(env) {
  const now = Date.now();
  const { results } = await env.DB.prepare(
    "SELECT open_at, close_at FROM checkup_schedule"
  ).all();

  return results.some(row => {
    const openTime = new Date(row.open_at.replace(/-/g, "/")).getTime();
    const closeTime = new Date(row.close_at.replace(/-/g, "/")).getTime();
    return now >= openTime && now < closeTime;
  });
}

// POST /checkup/checkin — เดิมคือ checkup.gs doPost()
export async function postCheckin(request, env) {
  let data;
  try {
    data = await request.json();
  } catch {
    return json(request, env, { status: "error", message: "รูปแบบข้อมูลไม่ถูกต้อง" }, 400);
  }

  const { studentId, name, lat, lng } = data;
  if (!studentId || !name || typeof lat !== "number" || typeof lng !== "number") {
    return json(request, env, { status: "error", message: "ข้อมูลไม่ครบถ้วน" }, 400);
  }

  if (!(await isSystemOpen(env))) {
    return json(request, env, { status: "error", message: "ถูกปฏิเสธ: นอกเวลาทำการ ไม่สามารถบันทึกข้อมูลได้" });
  }

  const student = await env.DB.prepare(
    "SELECT student_id FROM checkup_students WHERE student_id = ?"
  ).bind(String(studentId).trim()).first();

  if (!student) {
    return json(request, env, { status: "error", message: `ถูกปฏิเสธ: ไม่พบรหัสนักศึกษา ${studentId} ในระบบ` });
  }

  const distance = haversine(lat, lng, TARGET_LAT, TARGET_LNG);
  if (distance > MAX_DISTANCE_METERS) {
    return json(request, env, {
      status: "error",
      message: `ถูกปฏิเสธ: อยู่นอกพื้นที่กิจกรรม (ระยะห่าง ${Math.round(distance)} เมตร)`
    });
  }

  const mapLink = `https://maps.google.com/?q=${lat},${lng}`;
  await env.DB.prepare(
    "INSERT INTO checkup_logs (student_id, name, lat, lng, distance, map_link) VALUES (?, ?, ?, ?, ?, ?)"
  ).bind(String(studentId).trim(), String(name).trim(), lat, lng, Math.round(distance), mapLink).run();

  return json(request, env, { status: "success" });
}
