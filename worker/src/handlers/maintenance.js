// Maintenance mode ("ปิดปรับปรุงระบบ"): an admin switches it on (optionally between two times) for chosen systems; the Camps pages then show a closed
// notice and the Worker refuses the students' / officers' WRITES for those systems. Admin pages and every /camps/**/admin/** route keep working.
//   Public:  GET  /camps/maintenance                 { state: off | upcoming | active, message, from, until, scope, now }  (15 s cache)
//   Admin:   GET  /camps/maintenance/admin/settings  POST /camps/maintenance/admin/settings { enabled, from, until, message, scope[] }
//   Gate:    maintenanceGate() runs in index.js before the /camps routes: 503 { code: "MAINTENANCE" } for mutating, non-admin requests of a system in scope.
// Systems: hr (everything for students: my details, departments, AKA, shirt, survey), lotto, qrcheck. Budget has its own admin and is not covered.
import { json } from "../lib/cors.js";
import { requireAdmin, clean, fail } from "./camps.js";

export const SYSTEMS = ["hr", "lotto", "qrcheck"];
const KEYS = { enabled: "maint_enabled", from: "maint_from", until: "maint_until", message: "maint_message", scope: "maint_scope" };
const MSG_MAX = 500, DEFAULT_MSG = "ระบบกำลังปิดปรับปรุงชั่วคราว ขออภัยในความไม่สะดวก";
const ADMIN_PATH = /^\/camps\/(?:[a-z]+\/)?admin\//;
const num = (v) => (v === null || v === undefined || v === "" ? null : Number.isFinite(Number(v)) ? Number(v) : NaN);

// raw settings, cached per isolate for 10 s (the phase is computed on every request, so a scheduled start / end is exact)
let cache = { exp: 0, v: null };
export const invalidateMaintenance = () => { cache = { exp: 0, v: null }; };
async function readRaw(env) {
  if (cache.exp > Date.now() && cache.v) return cache.v;
  const rows = (await env.DB.prepare("SELECT key,value FROM camp_settings WHERE key LIKE 'maint_%'").all()).results || [];
  const m = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  const t = (k) => { const n = num(m[k]); return Number.isFinite(n) ? n : null; };
  const scope = String(m[KEYS.scope] ?? SYSTEMS.join(",")).split(",").map((s) => s.trim()).filter((s) => SYSTEMS.includes(s));
  const v = { enabled: m[KEYS.enabled] === "1", from: t(KEYS.from), until: t(KEYS.until), message: m[KEYS.message] || "", scope };
  cache = { exp: Date.now() + 10_000, v };
  return v;
}
// off | upcoming (switched on, starts later) | active
export const phase = (s, now = Date.now()) => {
  if (!s.enabled) return "off";
  if (s.until != null && now >= s.until) return "off";
  if (s.from != null && now < s.from) return "upcoming";
  return "active";
};
const systemOf = (p) => (p.startsWith("/camps/lotto/") ? "lotto" : p.startsWith("/camps/qrcheck/") ? "qrcheck" : "hr");

// null = let it through. Never blocks reads, /auth/*, the status route or anything under an admin path; fails open if the settings cannot be read.
export async function maintenanceGate(request, env, url) {
  const p = url.pathname, m = request.method;
  if (!p.startsWith("/camps/") || !["POST", "PUT", "PATCH", "DELETE"].includes(m) || ADMIN_PATH.test(p) || p.startsWith("/camps/maintenance")) return null;
  let s; try { s = await readRaw(env); } catch (e) { return null; }
  if (phase(s) !== "active" || !s.scope.includes(systemOf(p))) return null;
  const r = json(request, env, { error: s.message || DEFAULT_MSG, code: "MAINTENANCE", until: s.until }, 503);
  if (s.until != null) r.headers.set("Retry-After", String(Math.max(1, Math.min(86400, Math.ceil((s.until - Date.now()) / 1000)))));
  return r;
}

async function status(request, env) {
  let s; try { s = await readRaw(env); } catch (e) { s = { enabled: false, scope: [] }; }
  const now = Date.now(), ph = phase(s, now);
  const body = ph === "off" ? { state: "off", now } : { state: ph, message: s.message || DEFAULT_MSG, from: s.from, until: s.until, scope: s.scope, now };
  const r = json(request, env, body);
  r.headers.set("Cache-Control", "public, max-age=15");
  return r;
}
async function audit(env, w, action, metadata) {
  await env.DB.prepare("INSERT INTO budget_audit_logs (uuid,actor_auth0_id,actor_email,action,entity_type,entity_uuid,metadata) VALUES (?,?,?,?,?,?,?)")
    .bind(crypto.randomUUID(), w.user.sub, w.email || "unknown", action, "maintenance", null, JSON.stringify(metadata)).run();
}
async function adminGet(request, env) {
  const a = await requireAdmin(request, env, "maintenance"); if (a.response) return a.response;
  invalidateMaintenance(); const s = await readRaw(env);
  return json(request, env, { ...s, message: s.message, state: phase(s), now: Date.now(), systems: SYSTEMS, defaultMessage: DEFAULT_MSG });
}
async function adminSave(request, env) {
  const a = await requireAdmin(request, env, "maintenance"); if (a.response) return a.response;
  const b = await request.json().catch(() => null); if (!b) return fail(request, env, "ข้อมูลไม่ถูกต้อง");
  const from = num(b.from), until = num(b.until);
  for (const v of [from, until]) if (Number.isNaN(v) || (v != null && (v < 1e12 || v > 4.2e12))) return fail(request, env, "วันเวลาไม่ถูกต้อง");
  if (from != null && until != null && until <= from) return fail(request, env, "เวลาสิ้นสุดต้องหลังเวลาเริ่ม");
  const message = clean(b.message, MSG_MAX + 1); if ([...String(b.message ?? "")].length > MSG_MAX) return fail(request, env, `ข้อความยาวเกินไป (ไม่เกิน ${MSG_MAX} ตัวอักษร)`);
  const scopeIn = Array.isArray(b.scope) ? b.scope : [];
  if (scopeIn.some((x) => !SYSTEMS.includes(x))) return fail(request, env, "ระบบที่เลือกไม่ถูกต้อง");
  const scope = SYSTEMS.filter((x) => scopeIn.includes(x)), enabled = b.enabled === true;
  if (enabled && !scope.length) return fail(request, env, "เลือกระบบที่จะปิดปรับปรุงอย่างน้อย 1 ระบบ");
  const set = (k, v) => env.DB.prepare("INSERT INTO camp_settings (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(k, String(v ?? ""));
  await env.DB.batch([set(KEYS.enabled, enabled ? "1" : "0"), set(KEYS.from, from ?? ""), set(KEYS.until, until ?? ""), set(KEYS.message, message), set(KEYS.scope, scope.join(","))]);
  invalidateMaintenance();
  await audit(env, a, "MAINTENANCE_SET", { enabled, from, until, scope, messageLength: message.length });
  const s = await readRaw(env);
  return json(request, env, { ok: true, ...s, state: phase(s), now: Date.now() });
}

export async function maintenance(request, env, url) {
  try {
    const p = url.pathname, m = request.method;
    if (m === "GET" && p === "/camps/maintenance") return await status(request, env);
    if (m === "GET" && p === "/camps/maintenance/admin/settings") return await adminGet(request, env);
    if (m === "POST" && p === "/camps/maintenance/admin/settings") return await adminSave(request, env);
    return fail(request, env, "Not Found", 404);
  } catch (e) {
    console.error("[maintenance]", e?.message || e);
    return fail(request, env, "เกิดข้อผิดพลาด ลองใหม่อีกครั้ง", 500);
  }
}
