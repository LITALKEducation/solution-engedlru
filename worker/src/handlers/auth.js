// Login run by the Worker, so Auth0 needs only ONE callback URL (<worker>/auth/callback) and ONE logout URL (<worker>/auth/logged-out)
// for every Camps system. Authorization code + PKCE; tokens never travel in a URL: the browser comes back with a one-time `?code=`
// and swaps it for the tokens with POST /auth/exchange. Refreshing also goes through the Worker (no CORS / Allowed Web Origins needed).
//   GET  /auth/login?returnTo=<page url>&bind=<random, kept by the page>[&prompt=select_account][&connection=]   -> redirect to Auth0 /authorize
//   GET  /auth/callback                                            -> Auth0 lands here, redirects to returnTo?code=<one-time>
//   POST /auth/exchange {code, bind}                                    -> { access_token, refresh_token, expires_in, user }
//   POST /auth/refresh {refresh_token}                             -> same shape (refresh token rotated by Auth0)
//   GET  /auth/logout?returnTo=<page url>                          -> ends the Auth0 session, then /auth/logged-out -> returnTo
import { json } from "../lib/cors.js";

const DEFAULT_CLIENT_ID = "PGqozL94LzOwstm4pD39W5kvalYRiK7w";
const SITE_PATHS = /^\/(hr|admin|budget|lotto|qrcheck|aka)\/[\w\-/.]*$/;
const b64url = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const rand = (n) => b64url(crypto.getRandomValues(new Uint8Array(n)));
const domain = (env) => String(env.AUTH0_DOMAIN || "").replace(/^https?:\/\//, "").replace(/\/+$/, "");
const clientId = (env) => env.AUTH0_CLIENT_ID || DEFAULT_CLIENT_ID;
const origins = (env) => String(env.ALLOWED_ORIGINS || "").split(",").map((s) => s.trim()).filter(Boolean);
const now = () => Date.now();

// a page to come back to: its origin must be an allowed site origin and its path one of the Camps systems (never an open redirect)
export function safeReturn(env, v) {
  try {
    const u = new URL(String(v || ""));
    if (!origins(env).includes(u.origin) || !SITE_PATHS.test(u.pathname)) return null;
    return u.origin + u.pathname;
  } catch (e) { return null; }
}
const redirect = (to, headers = {}) => new Response(null, { status: 302, headers: { Location: to, "Cache-Control": "no-store", ...headers } });
const page = (msg, env) => new Response(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>เข้าสู่ระบบไม่สำเร็จ</title><body style="font-family:system-ui,sans-serif;max-width:420px;margin:15vh auto;padding:0 20px"><h2>เข้าสู่ระบบไม่สำเร็จ</h2><p>${msg}</p><p><a href="${(env && origins(env)[0]) || "/"}">กลับหน้าแรก</a></p>`, { status: 400, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });

async function put(env, kind, data, ttlMs) {
  const id = rand(32), t = now();
  await env.DB.prepare("DELETE FROM auth_tmp WHERE expires_at<?").bind(t).run();
  await env.DB.prepare("INSERT INTO auth_tmp (id,kind,data,expires_at) VALUES (?,?,?,?)").bind(id, kind, JSON.stringify(data), t + ttlMs).run();
  return id;
}
// read once: the row is deleted by the same statement, so a replay finds nothing
async function take(env, kind, id) {
  if (!id || String(id).length > 100) return null;
  const r = await env.DB.prepare("DELETE FROM auth_tmp WHERE id=? AND kind=? AND expires_at>? RETURNING data").bind(String(id), kind, now()).first();
  try { return r ? JSON.parse(r.data) : null; } catch (e) { return null; }
}
function userFromIdToken(idt) {
  try {
    const p = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(idt.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0))));
    return { sub: p.sub, email: p.email, email_verified: p.email_verified, name: p.name, nickname: p.nickname, picture: p.picture };
  } catch (e) { return null; }   // the id_token came straight from Auth0 over TLS, so it is only decoded, not verified
}
async function token(env, body) {
  let res;
  try { res = await fetch(`https://${domain(env)}/oauth/token`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ client_id: clientId(env), ...body }) }); }
  catch (e) { return { status: 0, data: { error: "unavailable" } }; }
  return { status: res.status, data: await res.json().catch(() => ({})) };
}
const shape = (d) => ({ access_token: d.access_token, refresh_token: d.refresh_token || null, expires_in: Number(d.expires_in) || 86400, user: d.id_token ? userFromIdToken(d.id_token) : null });

async function login(request, env, url) {
  const back = safeReturn(env, url.searchParams.get("returnTo"));
  if (!back) return page("ลิงก์กลับไม่ถูกต้อง", env);
  // the page that started the login proves it is the one finishing it (login CSRF): `bind` is kept in that tab's sessionStorage
  const bind = String(url.searchParams.get("bind") || "");
  if (!/^[\w-]{16,100}$/.test(bind)) return page("คำขอเข้าสู่ระบบไม่ถูกต้อง ลองใหม่จากหน้าเว็บ", env);
  const connection = /^[\w-]{1,60}$/.test(url.searchParams.get("connection") || "") ? url.searchParams.get("connection") : "google-oauth2";
  const verifier = rand(48);
  const challenge = b64url(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)));
  const sid = await put(env, "state", { verifier, back, bind }, 10 * 60_000);
  const q = new URLSearchParams({ response_type: "code", client_id: clientId(env), redirect_uri: url.origin + "/auth/callback", scope: "openid profile email offline_access", state: sid, code_challenge: challenge, code_challenge_method: "S256", connection });
  if (url.searchParams.get("prompt") === "select_account") q.set("prompt", "select_account");
  return redirect(`https://${domain(env)}/authorize?${q}`);
}
async function callback(request, env, url) {
  const st = await take(env, "state", url.searchParams.get("state"));
  if (!st) return page("ลิงก์หมดอายุหรือถูกใช้ไปแล้ว กลับไปกดเข้าสู่ระบบใหม่อีกครั้ง", env);
  const back = (extra) => redirect(st.back + "?" + new URLSearchParams(extra));
  const err = url.searchParams.get("error");
  if (err) return back({ error: err.slice(0, 80), error_description: (url.searchParams.get("error_description") || "").slice(0, 300) });
  const r = await token(env, { grant_type: "authorization_code", code: url.searchParams.get("code") || "", code_verifier: st.verifier, redirect_uri: url.origin + "/auth/callback" });
  if (!r.data.access_token) return back({ error: r.data.error || "login_failed", error_description: r.data.error_description || "เข้าสู่ระบบไม่สำเร็จ ลองใหม่อีกครั้ง" });
  const code = await put(env, "code", { ...shape(r.data), bind: st.bind }, 2 * 60_000);
  return back({ code });
}
async function exchange(request, env) {
  const b = await request.json().catch(() => null);
  const t = await take(env, "code", b?.code);
  if (!t || typeof b?.bind !== "string" || b.bind !== t.bind) return json(request, env, { error: "invalid_grant", error_description: "รหัสหมดอายุ ใช้ไปแล้ว หรือไม่ได้เริ่มเข้าสู่ระบบจากเครื่องนี้" }, 400);
  const { bind, ...out } = t;
  return json(request, env, out);
}
async function refresh(request, env) {
  const b = await request.json().catch(() => null), rt = typeof b?.refresh_token === "string" ? b.refresh_token.slice(0, 500) : "";
  if (!rt) return json(request, env, { error: "invalid_grant" }, 401);
  const r = await token(env, { grant_type: "refresh_token", refresh_token: rt });
  if (r.data.access_token) { const s = shape(r.data); if (!s.refresh_token) s.refresh_token = rt; return json(request, env, s); }
  // a revoked / expired refresh token means signed out; Auth0 being slow or down must NOT sign people out
  if (r.status === 400 || r.status === 401 || r.status === 403) return json(request, env, { error: "invalid_grant", error_description: r.data.error_description || "" }, 401);
  return json(request, env, { error: "unavailable" }, 503);
}
async function logout(request, env, url) {
  const back = safeReturn(env, url.searchParams.get("returnTo"));
  if (!back) return page("ลิงก์กลับไม่ถูกต้อง", env);
  const q = new URLSearchParams({ client_id: clientId(env), returnTo: url.origin + "/auth/logged-out" });
  return redirect(`https://${domain(env)}/v2/logout?${q}`, { "Set-Cookie": `auth_back=${encodeURIComponent(back)}; Max-Age=600; Path=/auth; Secure; HttpOnly; SameSite=Lax` });
}
function loggedOut(request, env) {
  const m = /(?:^|;\s*)auth_back=([^;]+)/.exec(request.headers.get("Cookie") || "");
  let back = null; try { back = m ? safeReturn(env, decodeURIComponent(m[1])) : null; } catch (e) { /* ignore */ }
  return redirect(back || (origins(env)[0] || "/") + "/", { "Set-Cookie": "auth_back=; Max-Age=0; Path=/auth; Secure; HttpOnly; SameSite=Lax" });
}

export async function auth(request, env, url) {
  const p = url.pathname, m = request.method;
  try {
    if (m === "GET" && p === "/auth/login") return await login(request, env, url);
    if (m === "GET" && p === "/auth/callback") return await callback(request, env, url);
    if (m === "POST" && p === "/auth/exchange") return await exchange(request, env);
    if (m === "POST" && p === "/auth/refresh") return await refresh(request, env);
    if (m === "GET" && p === "/auth/logout") return await logout(request, env, url);
    if (m === "GET" && p === "/auth/logged-out") return loggedOut(request, env);
  } catch (e) {
    console.error("[auth]", e?.message || e);
    return json(request, env, { error: "เกิดข้อผิดพลาด ลองใหม่อีกครั้ง" }, 500);
  }
  return json(request, env, { error: "Not found" }, 404);
}
