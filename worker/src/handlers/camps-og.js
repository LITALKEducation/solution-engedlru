// Link previews (Open Graph) for the public Camps pages. Public: the merged title / description / image of every page (read by the Pages
// Function in camps/functions, which puts them into the HTML for crawlers) and the custom image. Admin: edit the text, upload / remove the image.
import { json } from "../lib/cors.js";
import { getAuth0UserFromRequest, getAuth0Roles } from "../lib/auth0.js";
import { OG_PAGES, OG_LIMITS, OG_SITE, ogDefaultImage, ogPaths } from "../lib/og-pages.js";

const fail = (req, env, error, status = 400, extra = {}) => json(req, env, { error, ...extra }, status);
const tidy = (s) => String(s ?? "").normalize("NFC").replace(/[​-‍⁠﻿]/g, "").replace(/[   　]/g, " ").replace(/[ \t]+/g, " ").replace(/\s*\n\s*/g, " ").trim();
const ADMIN_ROLES = ["camp_admin", "budget_admin"];
async function requireAdmin(req, env) {
  const a = await getAuth0UserFromRequest(req, env);
  if (!a.user) return { response: fail(req, env, a.unavailable ? "ยังเข้าสู่ระบบไม่ได้ในขณะนี้ ลองใหม่อีกครั้ง" : "กรุณาเข้าสู่ระบบ", a.unavailable ? 503 : 401) };
  let ok = false;
  try { ok = (await getAuth0Roles(env, a.user.sub)).some((r) => ADMIN_ROLES.includes(r)); }
  catch (e) { return { response: fail(req, env, "ตรวจสอบสิทธิ์แอดมินไม่ได้ ลองใหม่อีกครั้ง", 503) }; }
  if (!ok) return { response: fail(req, env, "ต้องเป็นแอดมิน", 403) };
  return { user: a.user, email: tidy(a.user.email || "").toLowerCase() };
}
async function audit(env, w, action, entityId, metadata = {}) {
  await env.DB.prepare("INSERT INTO budget_audit_logs (uuid,actor_auth0_id,actor_email,action,entity_type,entity_uuid,metadata) VALUES (?,?,?,?,?,?,?)")
    .bind(crypto.randomUUID(), w.user.sub, w.email || "unknown", action, "og", entityId == null ? null : String(entityId), JSON.stringify(metadata)).run();
}
const SQL_ALL = "SELECT page,title,description,image_key,image_mime,updated_by,updated_at FROM camp_og_pages";
const apiBase = (url) => `${url.protocol}//${url.host}`;
// one page: defaults, the admin's overrides, and the values to publish
function merge(key, row, url) {
  const d = OG_PAGES[key];
  const title = row?.title || d.title, description = row?.description || d.description;
  const custom = !!row?.image_key;
  const v = row?.updated_at ? encodeURIComponent(row.updated_at) : "0";
  return { page: key, label: d.label, path: d.path, url: OG_SITE + d.path, title, description,
    image: custom ? `${apiBase(url)}/camps/og/image?page=${key}&v=${v}` : ogDefaultImage(key), customImage: custom,
    defaults: { title: d.title, description: d.description, image: ogDefaultImage(key) },
    custom: { title: row?.title || "", description: row?.description || "" }, updatedAt: row?.updated_at || null, updatedBy: row?.updated_by || null };
}
async function allRows(env) { return Object.fromEntries(((await env.DB.prepare(SQL_ALL).all()).results || []).map((r) => [r.page, r])); }

// public: what the Pages Function needs. Cached for a minute so crawlers and visitors never wait on the database.
async function publicPages(req, env, url) {
  const rows = await allRows(env), pages = {};
  for (const key of Object.keys(OG_PAGES)) { const m = merge(key, rows[key], url); pages[key] = { path: m.path, paths: ogPaths(key), url: m.url, title: m.title, description: m.description, image: m.image, customImage: m.customImage }; }
  const r = json(req, env, { pages });
  r.headers.set("Cache-Control", "public, max-age=30, stale-while-revalidate=120");
  return r;
}
async function publicImage(req, env, url) {
  const key = tidy(url.searchParams.get("page")).toLowerCase();
  const row = OG_PAGES[key] ? await env.DB.prepare("SELECT image_key,image_mime FROM camp_og_pages WHERE page=?").bind(key).first() : null;
  if (!row?.image_key) return new Response("Not Found", { status: 404 });
  const obj = await env.FILES.get(row.image_key);
  if (!obj) return new Response("Not Found", { status: 404 });
  const h = new Headers(); if (obj.writeHttpMetadata) obj.writeHttpMetadata(h);
  h.set("Content-Type", row.image_mime || "image/png"); h.set("Cache-Control", "public, max-age=3600, stale-while-revalidate=86400"); h.set("Access-Control-Allow-Origin", "*");
  return new Response(obj.body, { headers: h });
}

// ---------- admin ----------
async function adminPages(req, env, url) {
  const a = await requireAdmin(req, env); if (a.response) return a.response;
  const rows = await allRows(env);
  return json(req, env, { limits: OG_LIMITS, pages: Object.keys(OG_PAGES).map((k) => merge(k, rows[k], url)) });
}
const readKey = (v) => { const k = tidy(v).toLowerCase(); return OG_PAGES[k] ? k : null; };
// save title + description. An empty value (or the default text) goes back to the default.
async function adminSave(req, env, url) {
  const a = await requireAdmin(req, env); if (a.response) return a.response;
  const b = await req.json().catch(() => null), key = readKey(b?.page);
  if (!key) return fail(req, env, "ไม่พบหน้านี้", 404);
  const title = tidy(b?.title), description = tidy(b?.description);
  if ([...title].length > OG_LIMITS.title) return fail(req, env, `ชื่อยาวเกินไป (ไม่เกิน ${OG_LIMITS.title} ตัวอักษร)`);
  if ([...description].length > OG_LIMITS.description) return fail(req, env, `คำอธิบายยาวเกินไป (ไม่เกิน ${OG_LIMITS.description} ตัวอักษร)`);
  const d = OG_PAGES[key], t = !title || title === d.title ? null : title, ds = !description || description === d.description ? null : description;
  await env.DB.prepare(`INSERT INTO camp_og_pages (page,title,description,updated_by,updated_at) VALUES (?,?,?,?,datetime('now'))
    ON CONFLICT(page) DO UPDATE SET title=excluded.title,description=excluded.description,updated_by=excluded.updated_by,updated_at=excluded.updated_at`).bind(key, t, ds, a.email).run();
  await audit(env, a, "OG_SAVE", key, { title: t, description: ds });
  return json(req, env, { ok: true, page: merge(key, await env.DB.prepare(SQL_ALL + " WHERE page=?").bind(key).first(), url) });
}
const sniff = (u8) => (u8[0] === 0x89 && u8[1] === 0x50 && u8[2] === 0x4e && u8[3] === 0x47 ? ["image/png", "png"]
  : u8[0] === 0xff && u8[1] === 0xd8 && u8[2] === 0xff ? ["image/jpeg", "jpg"]
  : u8[0] === 0x52 && u8[1] === 0x49 && u8[2] === 0x46 && u8[3] === 0x46 && u8[8] === 0x57 && u8[9] === 0x45 && u8[10] === 0x42 && u8[11] === 0x50 ? ["image/webp", "webp"] : null);
// upload the preview image (raw body, PNG / JPEG / WebP up to 2 MB; 1200x630 recommended)
async function adminImage(req, env, url) {
  const a = await requireAdmin(req, env); if (a.response) return a.response;
  const key = readKey(url.searchParams.get("page"));
  if (!key) return fail(req, env, "ไม่พบหน้านี้", 404);
  const buf = new Uint8Array(await req.arrayBuffer());
  if (!buf.length) return fail(req, env, "ไม่พบไฟล์รูป");
  if (buf.length > OG_LIMITS.image) return fail(req, env, "ไฟล์ใหญ่เกินไป (ไม่เกิน 2 MB)", 413);
  const kind = sniff(buf); if (!kind) return fail(req, env, "ใช้ไฟล์ PNG, JPG หรือ WebP เท่านั้น");
  const old = await env.DB.prepare("SELECT image_key FROM camp_og_pages WHERE page=?").bind(key).first();
  const imageKey = `camps/og/${key}-${Date.now()}.${kind[1]}`;
  await env.FILES.put(imageKey, buf, { httpMetadata: { contentType: kind[0] } });
  await env.DB.prepare(`INSERT INTO camp_og_pages (page,image_key,image_mime,updated_by,updated_at) VALUES (?,?,?,?,datetime('now'))
    ON CONFLICT(page) DO UPDATE SET image_key=excluded.image_key,image_mime=excluded.image_mime,updated_by=excluded.updated_by,updated_at=excluded.updated_at`).bind(key, imageKey, kind[0], a.email).run();
  if (old?.image_key) { try { await env.FILES.delete(old.image_key); } catch (e) { /* the new image is saved; an orphan file is harmless */ } }
  await audit(env, a, "OG_IMAGE", key, { mime: kind[0], bytes: buf.length });
  return json(req, env, { ok: true, page: merge(key, await env.DB.prepare(SQL_ALL + " WHERE page=?").bind(key).first(), url) });
}
async function adminReset(req, env, url) {
  const a = await requireAdmin(req, env); if (a.response) return a.response;
  const b = await req.json().catch(() => null), key = readKey(b?.page);
  if (!key) return fail(req, env, "ไม่พบหน้านี้", 404);
  const what = b?.what === "image" || b?.what === "text" ? b.what : "all";
  const row = await env.DB.prepare(SQL_ALL + " WHERE page=?").bind(key).first();
  if (row) {
    if (what !== "text" && row.image_key) { try { await env.FILES.delete(row.image_key); } catch (e) { /* ignore */ } }
    if (what === "all") await env.DB.prepare("DELETE FROM camp_og_pages WHERE page=?").bind(key).run();
    else if (what === "image") await env.DB.prepare("UPDATE camp_og_pages SET image_key=NULL,image_mime=NULL,updated_by=?,updated_at=datetime('now') WHERE page=?").bind(a.email, key).run();
    else await env.DB.prepare("UPDATE camp_og_pages SET title=NULL,description=NULL,updated_by=?,updated_at=datetime('now') WHERE page=?").bind(a.email, key).run();
  }
  await audit(env, a, "OG_RESET", key, { what });
  return json(req, env, { ok: true, page: merge(key, await env.DB.prepare(SQL_ALL + " WHERE page=?").bind(key).first(), url) });
}

export async function campsOg(req, env, url) {
  try {
    const p = url.pathname, m = req.method;
    if (m === "GET" && p === "/camps/og/pages") return await publicPages(req, env, url);
    if (m === "GET" && p === "/camps/og/image") return await publicImage(req, env, url);
    if (m === "GET" && p === "/camps/og/admin/pages") return await adminPages(req, env, url);
    if (m === "POST" && p === "/camps/og/admin/save") return await adminSave(req, env, url);
    if (m === "POST" && p === "/camps/og/admin/image") return await adminImage(req, env, url);
    if (m === "POST" && p === "/camps/og/admin/reset") return await adminReset(req, env, url);
    return fail(req, env, "Not Found", 404);
  } catch (e) {
    console.error("[og] error:", e?.message || e);
    if (/no such (table|column)/i.test(String(e?.message))) {
      // before the migration the public list still works with the defaults, so previews never break
      if (req.method === "GET" && url.pathname === "/camps/og/pages") { const pages = {}; for (const k of Object.keys(OG_PAGES)) { const m = merge(k, null, url); pages[k] = { path: m.path, paths: ogPaths(k), url: m.url, title: m.title, description: m.description, image: m.image, customImage: false }; } return json(req, env, { pages }); }
      return fail(req, env, "ระบบหน้าตัวอย่างลิงก์ยังไม่พร้อมใช้งาน กรุณาแจ้งแอดมิน", 503, { code: "MIGRATION_REQUIRED" });
    }
    return fail(req, env, "เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง", 500);
  }
}
