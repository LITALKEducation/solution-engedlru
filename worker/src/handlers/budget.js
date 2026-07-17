import { json } from "../lib/cors.js";
import { getAuth0User } from "../lib/auth0.js";
import { decodeDataUrl, putFile, fileUrl, randomId } from "../lib/files.js";

// POST /budget — เดิมคือ WEB_APP_URL (budget.js) ที่ใช้ Google Sheets + Google Drive
export async function postBudget(request, env) {
  let payload;
  try {
    payload = await request.json();
  } catch {
    return json(request, env, { status: "error", message: "รูปแบบข้อมูลไม่ถูกต้อง" }, 400);
  }

  const allowedEmails = (env.BUDGET_ALLOWED_EMAILS || "").split(",").map(s => s.trim().toLowerCase()).filter(Boolean);
  if (allowedEmails.length) {
    const accessToken = payload.access_token;
    if (!accessToken) return json(request, env, { status: "error", message: "ต้องเข้าสู่ระบบก่อนบันทึกข้อมูล" }, 401);

    const user = await getAuth0User(env, accessToken);
    if (!user || !allowedEmails.includes((user.email || "").toLowerCase())) {
      return json(request, env, { status: "error", message: "ไม่มีสิทธิ์บันทึกข้อมูลงบประมาณ" }, 403);
    }
  }

  const { date, category, details, qty, price, note, fileName, fileMimeType, fileBase64 } = payload;
  if (!date || !category) {
    return json(request, env, { status: "error", message: "กรุณากรอกวันที่และหมวดเงิน" }, 400);
  }

  const qtyNum = parseFloat(qty) || 0;
  const priceNum = parseFloat(price) || 0;
  const total = qtyNum * priceNum;

  let fileKey = null;
  if (fileBase64) {
    const { bytes, mime } = decodeDataUrl(fileBase64, fileMimeType);
    fileKey = `budget/${randomId()}-${fileName || "attachment"}`;
    await putFile(env, fileKey, bytes, mime);
  }

  await env.DB.prepare(
    `INSERT INTO budget_entries (entry_date, category, details, qty, price, total, note, file_key, file_name, file_mime)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(date, category, details || "", qtyNum, priceNum, total, note || "", fileKey, fileName || null, fileMimeType || null).run();

  return json(request, env, {
    status: "success",
    fileUrl: fileKey ? fileUrl(request, fileKey) : null
  });
}
