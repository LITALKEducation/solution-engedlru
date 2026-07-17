import { json, corsHeaders } from "../../lib/cors.js";
import { parseCsv, toCsv } from "../../lib/csv.js";

const HEADER = ["activity_name", "student_id", "student_name", "student_group", "code", "token"];

// GET /admin/tokens/template.csv
export async function getTemplateCsv(request, env) {
  const example = ["ชื่อกิจกรรมตัวอย่าง", "6740102101", "ชื่อ-สกุลตัวอย่าง", "ค.6702", "69ED19501", "819163580742"];
  const csv = toCsv([HEADER, example]);
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="token-template.csv"',
      ...corsHeaders(request, env)
    }
  });
}

// POST /admin/tokens/import { csv: string, mode: "append" | "replace" }
export async function importCsv(request, env) {
  const body = await request.json().catch(() => null);
  if (!body || !body.csv) return json(request, env, { error: "ต้องระบุ csv" }, 400);
  const mode = body.mode === "replace" ? "replace" : "append";

  const rows = parseCsv(body.csv);
  if (!rows.length) return json(request, env, { error: "ไฟล์ CSV ว่างเปล่า" }, 400);

  // ตัดแถวหัวตารางออกถ้าตรงกับ HEADER (ไม่สนตัวพิมพ์เล็ก/ใหญ่)
  const first = rows[0].map(v => v.trim().toLowerCase());
  const dataRows = first.join(",") === HEADER.join(",") ? rows.slice(1) : rows;

  if (mode === "replace") {
    await env.DB.prepare("DELETE FROM token_records").run();
    await env.DB.prepare("DELETE FROM token_activities").run();
  }

  const activitiesSeen = new Set();
  let insertedRecords = 0;
  let skipped = 0;
  const errors = [];

  for (let i = 0; i < dataRows.length; i++) {
    const r = dataRows[i];
    const [activityName, studentId, studentName, studentGroup, code, token] = r.map(v => (v ?? "").trim());

    if (!activityName || !studentId) {
      skipped++;
      errors.push(`แถวที่ ${i + 1}: ต้องมี activity_name และ student_id`);
      continue;
    }

    if (!activitiesSeen.has(activityName)) {
      activitiesSeen.add(activityName);
      await env.DB.prepare("INSERT OR IGNORE INTO token_activities (name) VALUES (?)").bind(activityName).run();
    }

    await env.DB.prepare(
      `INSERT INTO token_records (activity_name, student_id, student_name, student_group, code, token)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).bind(activityName, studentId, studentName || null, studentGroup || null, code || null, token || null).run();
    insertedRecords++;
  }

  return json(request, env, {
    status: "success",
    mode,
    insertedActivities: activitiesSeen.size,
    insertedRecords,
    skipped,
    errors
  });
}
