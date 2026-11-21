// Maintenance mode ("ปิดปรับปรุงระบบ"): an admin switches it on (optionally between two times) for chosen systems; the Camps pages then show a closed
// notice and the Worker refuses the students' / officers' WRITES for those systems. Admin pages and every /camps/**/admin/** route keep working.
//   Public:  GET  /camps/maintenance                 { state: off | upcoming | active, message, from, until, scope, now }  (15 s cache)
//   Admin:   GET  /camps/maintenance/admin/settings  POST /camps/maintenance/admin/settings { enabled, from, until, message, scope[] }
//   Admin:   GET  /camps/maintenance/admin/history   (who switched it on / off, last 30 changes)
//   Me:      GET  /camps/maintenance/me              { allowed } for the signed-in person (is their email on the allow list?)
//   Gate:    maintenanceGate() runs in index.js before the /camps routes: 503 { code: "MAINTENANCE" } for mutating, non-admin requests of a system in scope.
// Systems: hr (everything for students: my details, departments, AKA, shirt, survey), lotto, qrcheck. Budget has its own admin and is not covered.
import { json } from "../lib/cors.js";
import { requireAdmin, clean, fail } from "./camps.js";
import { getAuth0UserFromRequest } from "../lib/auth0.js";
import { edgeCached } from "../lib/edge-cache.js";

export const SYSTEMS = ["hr", "lotto", "qrcheck"];
const KEYS = { enabled: "maint_enabled", from: "maint_from", until: "maint_until", message: "maint_message", scope: "maint_scope", mode: "maint_mode", lead: "maint_lead", notice: "maint_notice", msgs: "maint_msgs", allow: "maint_allow" };
export const MODES = ["closed", "readonly"], LEADS = [0, 1, 3, 6, 12, 24, 48, 72];   // closed = the page is covered; readonly = the page stays usable, only saving is refused
const HOUR = 3600e3, ALLOW_MAX = 50, EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MSG_MAX = 500, DEFAULT_MSG = "ระบบกำลังปิดปรับปรุงชั่วคราว ขออภัยในความไม่สะดวก";
const ADMIN_PATH = /^\/camps\/(?:[a-z]+\/)?admin\//;
const num = (v) => (v === null || v === undefined || v === "" ? null : Number.isFinite(Number(v)) ? Number(v) : NaN);

// raw settings, cached per isolate for 10 s (the phase is computed on every request, so a scheduled start / end is exact).
// If D1 cannot be read the LAST KNOWN settings keep applying (a closed system stays closed, an open one stays open); with nothing known yet it fails open,
// unless MAINTENANCE_FAIL_CLOSED=1 is set (then writes are refused while the settings are unreadable).
let cache = { exp: 0, v: null }, last = null;
export const invalidateMaintenance = () => { cache = { exp: 0, v: null }; };
export const resetMaintenance = () => { cache = { exp: 0, v: null }; last = null; };
const parseMsgs = (raw) => { try { const o = JSON.parse(raw || "{}"); const r = {}; for (const k of SYSTEMS) if (typeof o[k] === "string" && o[k].trim()) r[k] = o[k].slice(0, MSG_MAX); return r; } catch (e) { return {}; } };
const parseAllow = (raw) => String(raw || "").split(",").map((x) => x.trim().toLowerCase()).filter((x) => EMAIL.test(x));
async function readRaw(env, { fresh = false } = {}) {
  if (!fresh && cache.exp > Date.now() && cache.v) return cache.v;
  let rows;
  // shared per data centre for 5 s (every visitor's home page asks); the admin screens read with fresh:true
  const load = async () => (await env.DB.prepare("SELECT key,value FROM camp_settings WHERE key LIKE 'maint_%'").all()).results || [];
  try { rows = fresh ? await load() : await edgeCached("maint-rows", 5, load); }
  catch (e) { if (last) return last; throw e; }
  const m = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  const t = (k) => { const n = num(m[k]); return Number.isFinite(n) ? n : null; };
  const scope = String(m[KEYS.scope] ?? SYSTEMS.join(",")).split(",").map((s) => s.trim()).filter((s) => SYSTEMS.includes(s));
  const lead = t(KEYS.lead);
  const v = { enabled: m[KEYS.enabled] === "1", from: t(KEYS.from), until: t(KEYS.until), message: m[KEYS.message] || "", scope,
    mode: MODES.includes(m[KEYS.mode]) ? m[KEYS.mode] : "closed", lead: LEADS.includes(lead) ? lead : 0, notice: m[KEYS.notice] || "", messages: parseMsgs(m[KEYS.msgs]), allow: parseAllow(m[KEYS.allow]) };
  cache = { exp: Date.now() + 10_000, v }; last = v;
  return v;
}
// off | upcoming (switched on, starts later) | active
export const phase = (s, now = Date.now()) => {
  if (!s.enabled) return "off";
  if (s.until != null && now >= s.until) return "off";
  if (s.from != null && now < s.from) return "upcoming";
  return "active";
};
// the heads-up is shown from `lead` hours before the start (0 = from the moment it is scheduled)
export const noticeFrom = (s) => (s.from != null && s.lead > 0 ? s.from - s.lead * HOUR : null);
const systemOf = (p) => (p.startsWith("/camps/lotto/") ? "lotto" : p.startsWith("/camps/qrcheck/") ? "qrcheck" : "hr");

// null = let it through. Never blocks reads, /auth/*, the status route or anything under an admin path. A person on the allow list passes too.
export async function maintenanceGate(request, env, url) {
  const p = url.pathname, m = request.method;
  if (!p.startsWith("/camps/") || !["POST", "PUT", "PATCH", "DELETE"].includes(m) || ADMIN_PATH.test(p) || p.startsWith("/camps/maintenance")) return null;
  let s;
  try { s = await readRaw(env); } catch (e) { if (env.MAINTENANCE_FAIL_CLOSED !== "1") return null; s = { enabled: true, from: null, until: null, message: "", scope: SYSTEMS, messages: {}, allow: [] }; }
  const sys = systemOf(p);
  if (phase(s) !== "active" || !s.scope.includes(sys)) return null;
  if (s.allow.length && (await onAllowList(request, env, s))) return null;
  const r = json(request, env, { error: s.messages[sys] || s.message || DEFAULT_MSG, code: "MAINTENANCE", mode: s.mode, until: s.until }, 503);
  if (s.until != null) r.headers.set("Retry-After", String(Math.max(1, Math.min(86400, Math.ceil((s.until - Date.now()) / 1000)))));
  return r;
}
async function onAllowList(request, env, s) {
  if (!(request.headers.get("Authorization") || "").startsWith("Bearer ")) return false;
  try { const a = await getAuth0UserFromRequest(request, env); const e = String((a.user && a.user.email) || "").toLowerCase(); return !!(a.user && a.user.email_verified === true && s.allow.includes(e)); } catch (e) { return false; }
}

async function status(request, env) {
  let s; try { s = await readRaw(env); } catch (e) { s = { enabled: false, scope: [] }; }
  const now = Date.now();
  let ph = phase(s, now);
  const nf = ph === "upcoming" ? noticeFrom(s) : null;
  if (nf != null && now < nf) ph = "off";   // scheduled, but too early to announce
  const body = ph === "off" ? { state: "off", now }
    : { state: ph, message: s.message || DEFAULT_MSG, messages: s.messages, notice: s.notice, mode: s.mode, from: s.from, until: s.until, scope: s.scope, now };
  const r = json(request, env, body);
  r.headers.set("Cache-Control", "public, max-age=15");
  return r;
}
// is the signed-in person on the allow list? (the page asks so that a listed officer can keep working while everyone else sees the notice)
async function me(request, env) {
  let s; try { s = await readRaw(env); } catch (e) { return json(request, env, { allowed: false }); }
  const r = json(request, env, { allowed: s.allow.length > 0 && (await onAllowList(request, env, s)) });
  r.headers.set("Cache-Control", "no-store");
  return r;
}
async function audit(env, w, action, metadata) {
  await env.DB.prepare("INSERT INTO budget_audit_logs (uuid,actor_auth0_id,actor_email,action,entity_type,entity_uuid,metadata) VALUES (?,?,?,?,?,?,?)")
    .bind(crypto.randomUUID(), w.user.sub, w.email || "unknown", action, "maintenance", null, JSON.stringify(metadata)).run();
}
async function adminGet(request, env) {
  const a = await requireAdmin(request, env, "maintenance"); if (a.response) return a.response;
  invalidateMaintenance(); const s = await readRaw(env, { fresh: true });
  return json(request, env, { ...s, state: phase(s), noticeFrom: noticeFrom(s), now: Date.now(), systems: SYSTEMS, modes: MODES, leads: LEADS, defaultMessage: DEFAULT_MSG, allowMax: ALLOW_MAX });
}
async function history(request, env) {
  const a = await requireAdmin(request, env, "maintenance"); if (a.response) return a.response;
  const rows = (await env.DB.prepare("SELECT actor_email,metadata,created_at FROM budget_audit_logs WHERE entity_type='maintenance' ORDER BY created_at DESC, id DESC LIMIT 30").all()).results || [];
  return json(request, env, { items: rows.map((r) => { let m = {}; try { m = JSON.parse(r.metadata || "{}"); } catch (e) { /* ignore */ } return { by: r.actor_email, at: r.created_at, ...m }; }) });
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
  const mode = b.mode === undefined ? "closed" : b.mode; if (!MODES.includes(mode)) return fail(request, env, "รูปแบบการปิดไม่ถูกต้อง");
  const lead = b.lead === undefined || b.lead === null ? 0 : Number(b.lead); if (!LEADS.includes(lead)) return fail(request, env, "ระยะเวลาแจ้งล่วงหน้าไม่ถูกต้อง");
  const notice = clean(b.notice, MSG_MAX + 1); if ([...String(b.notice ?? "")].length > MSG_MAX) return fail(request, env, `ข้อความแจ้งล่วงหน้ายาวเกินไป (ไม่เกิน ${MSG_MAX} ตัวอักษร)`);
  const msgsIn = b.messages && typeof b.messages === "object" ? b.messages : {}, messages = {};
  for (const k of SYSTEMS) { const raw = String(msgsIn[k] ?? ""); if ([...raw].length > MSG_MAX) return fail(request, env, `ข้อความของระบบ ${k} ยาวเกินไป (ไม่เกิน ${MSG_MAX} ตัวอักษร)`); const c = clean(raw, MSG_MAX); if (c) messages[k] = c; }
  const allowIn = (Array.isArray(b.allow) ? b.allow : [b.allow ?? ""]).flatMap((x) => String(x).split(/[\s,;]+/));
  const allow = [...new Set(allowIn.map((x) => String(x).trim().toLowerCase()).filter(Boolean))];
  if (allow.some((x) => !EMAIL.test(x))) return fail(request, env, "อีเมลในรายชื่อผู้ผ่านได้ไม่ถูกต้อง");
  if (allow.length > ALLOW_MAX) return fail(request, env, `รายชื่อผู้ผ่านได้ไม่เกิน ${ALLOW_MAX} อีเมล`);
  const set = (k, v) => env.DB.prepare("INSERT INTO camp_settings (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(k, String(v ?? ""));
  await env.DB.batch([set(KEYS.enabled, enabled ? "1" : "0"), set(KEYS.from, from ?? ""), set(KEYS.until, until ?? ""), set(KEYS.message, message), set(KEYS.scope, scope.join(",")), set(KEYS.mode, mode), set(KEYS.lead, lead), set(KEYS.notice, notice), set(KEYS.msgs, JSON.stringify(messages)), set(KEYS.allow, allow.join(","))]);
  invalidateMaintenance();
  await audit(env, a, "MAINTENANCE_SET", { enabled, from, until, scope, mode, lead, allow: allow.length, messageLength: message.length, notice: notice.length > 0 });
  const s = await readRaw(env, { fresh: true });
  return json(request, env, { ok: true, ...s, state: phase(s), noticeFrom: noticeFrom(s), now: Date.now() });
}

export async function maintenance(request, env, url) {
  try {
    const p = url.pathname, m = request.method;
    if (m === "GET" && p === "/camps/maintenance") return await status(request, env);
    if (m === "GET" && p === "/camps/maintenance/me") return await me(request, env);
    if (m === "GET" && p === "/camps/maintenance/admin/history") return await history(request, env);
    if (m === "GET" && p === "/camps/maintenance/admin/settings") return await adminGet(request, env);
    if (m === "POST" && p === "/camps/maintenance/admin/settings") return await adminSave(request, env);
    return fail(request, env, "Not Found", 404);
  } catch (e) {
    console.error("[maintenance]", e?.message || e);
    return fail(request, env, "เกิดข้อผิดพลาด ลองใหม่อีกครั้ง", 500);
  }
}
