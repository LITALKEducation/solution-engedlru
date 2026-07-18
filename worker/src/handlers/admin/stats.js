import { json } from "../../lib/cors.js";

// GET /admin/stats — ตัวเลขจริงสำหรับหน้า Dashboard
export async function getStats(request, env) {
  const one = q => env.DB.prepare(q).first();

  const [students, logsTotal, logsToday, tokenRecords, activities, admins, activeNow] = await Promise.all([
    one("SELECT COUNT(*) c FROM checkup_students"),
    one("SELECT COUNT(*) c FROM checkup_logs"),
    one("SELECT COUNT(*) c FROM checkup_logs WHERE date(created_at) = date('now')"),
    one("SELECT COUNT(*) c FROM token_records"),
    one("SELECT COUNT(*) c FROM token_activities"),
    one("SELECT COUNT(*) c FROM admin_users"),
    one("SELECT COUNT(*) c FROM checkup_schedule WHERE datetime('now') >= datetime(open_at) AND datetime('now') < datetime(close_at)")
  ]);

  return json(request, env, {
    students: students.c,
    logsTotal: logsTotal.c,
    logsToday: logsToday.c,
    tokenRecords: tokenRecords.c,
    activities: activities.c,
    admins: admins.c,
    activeNow: activeNow.c
  });
}
