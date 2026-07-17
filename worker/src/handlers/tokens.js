import { json } from "../lib/cors.js";

// GET /tokens?action=getActivities — เดิมคือ GAS_API_URL?action=getActivities
export async function getActivities(request, env) {
  const { results } = await env.DB.prepare(
    "SELECT name FROM token_activities ORDER BY id"
  ).all();
  return json(request, env, results.map(r => r.name));
}

// GET /tokens?action=search&id=&criteria= — เดิมคือ GAS_API_URL?action=search
export async function search(request, env, url) {
  const studentId = (url.searchParams.get("id") || "").trim();
  const activityName = (url.searchParams.get("criteria") || "").trim();

  if (!studentId || !activityName) {
    return json(request, env, { found: false }, 400);
  }

  const { results } = await env.DB.prepare(
    `SELECT student_name, student_group, code, token
     FROM token_records
     WHERE activity_name = ? AND student_id = ?
     ORDER BY id`
  ).bind(activityName, studentId).all();

  if (!results.length) {
    return json(request, env, { found: false });
  }

  return json(request, env, {
    found: true,
    data: {
      activityName,
      name: results[0].student_name || "",
      studentId,
      group: results[0].student_group || "",
      activities: results.map(r => ({ code: r.code, token: r.token }))
    }
  });
}
