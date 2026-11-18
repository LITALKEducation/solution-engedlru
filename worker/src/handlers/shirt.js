// Camp shirt (/hr/shirt for students, /admin/hr/shirt for admins): students upload ONE design (picture + designer's name + class group / หมู่เรียน) while
// submissions are open, then vote for one design (not their own) while voting is open. The ADMINS upload the sample shirt the designs are shown on.
// Admins also set both date windows, hide / delete designs, see live counts and announce the results.
//   Student:  GET  /camps/shirt/me                       dates, sample shirt, my design, my vote, the gallery (from the day voting opens)
//             POST /camps/shirt/design?designer=&group=&title=&description=   body = image (PNG / JPG / WebP, <= 10 MB; optional when only the text changes)
//             POST /camps/shirt/design/delete             POST /camps/shirt/vote {designId}      POST /camps/shirt/unvote
//   Public:   GET  /camps/shirt/image/<id>                the picture of a visible design (random ids, so URLs cannot be guessed)
//             GET  /camps/shirt/sample                    the sample shirt picture
//             GET  /camps/shirt/gallery                   the designs with designer + class group, for the public page /shirt/ (no sign-in; admins can switch it off)
//   Admin:    GET  /camps/shirt/admin/overview            POST /camps/shirt/admin/settings
//             POST /camps/shirt/admin/sample   body = picture   |  POST /camps/shirt/admin/sample/reset
//             POST /camps/shirt/admin/design/hide | delete
import { json } from "../lib/cors.js";
import { who, requireAdmin, clean, fail } from "./camps.js";

const MAX_IMAGE = 10 * 1024 * 1024, TITLE_MAX = 60, DESC_MAX = 300, NAME_MAX = 80, GROUP_MAX = 40;
const KEYS = { submitFrom: "shirt_submit_from", submitTo: "shirt_submit_to", voteFrom: "shirt_vote_from", voteTo: "shirt_vote_to" };
const sniff = (u8) => (u8[0] === 0x89 && u8[1] === 0x50 && u8[2] === 0x4e && u8[3] === 0x47 ? ["image/png", "png"]
  : u8[0] === 0xff && u8[1] === 0xd8 && u8[2] === 0xff ? ["image/jpeg", "jpg"]
  : u8.length > 12 && u8[0] === 0x52 && u8[1] === 0x49 && u8[2] === 0x46 && u8[3] === 0x46 && u8[8] === 0x57 && u8[9] === 0x45 && u8[10] === 0x42 && u8[11] === 0x50 ? ["image/webp", "webp"] : null);
const rid = () => [...crypto.getRandomValues(new Uint8Array(12))].map((b) => b.toString(16).padStart(2, "0")).join("");
const num = (v) => (v === null || v === undefined || v === "" ? null : Number.isFinite(Number(v)) ? Number(v) : NaN);

async function loadSettings(env) {
  const rows = (await env.DB.prepare("SELECT key,value FROM camp_settings WHERE key LIKE 'shirt_%'").all()).results || [];
  const m = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  const t = (k) => { const n = num(m[k]); return Number.isFinite(n) ? n : null; };
  return { submitFrom: t(KEYS.submitFrom), submitTo: t(KEYS.submitTo), voteFrom: t(KEYS.voteFrom), voteTo: t(KEYS.voteTo), resultsPublic: m.shirt_results_public === "1", galleryPublic: m.shirt_gallery_public !== "0", _sample: { key: m.shirt_sample_key || "", mime: m.shirt_sample_mime || "", v: m.shirt_sample_v || "" } };
}
// a window is only active when both its times are set: 'unset' | 'before' | 'open' | 'after'
const windowState = (from, to, now) => (from == null || to == null ? "unset" : now < from ? "before" : now < to ? "open" : "after");
const publicSettings = (st) => { const { _sample, ...rest } = st; return rest; };
const phases = (st, now = Date.now()) => ({ submit: windowState(st.submitFrom, st.submitTo, now), vote: windowState(st.voteFrom, st.voteTo, now) });
// the sample shirt as the pages need it: { image: url | null } (shown as it is, no layout)
const sampleInfo = (url, st) => ({ image: st._sample.key ? `${url.protocol}//${url.host}/camps/shirt/sample?v=${encodeURIComponent(st._sample.v)}` : null });
const imageUrl = (url, d) => `${url.protocol}//${url.host}/camps/shirt/image/${d.id}?v=${encodeURIComponent(d.image_key.split("-").pop().split(".")[0])}`;
const setting = (env, key, value) => env.DB.prepare("INSERT INTO camp_settings (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(key, String(value ?? ""));
async function audit(env, w, action, entityId, metadata = {}) {
  await env.DB.prepare("INSERT INTO budget_audit_logs (uuid,actor_auth0_id,actor_email,action,entity_type,entity_uuid,metadata) VALUES (?,?,?,?,?,?,?)")
    .bind(crypto.randomUUID(), w.user.sub, w.email || "unknown", action, "shirt", entityId == null ? null : String(entityId), JSON.stringify(metadata)).run();
}

// a verified university email whose student id is on the roster (gender is not needed here)
async function student(request, env) {
  const w = await who(request, env); if (w.response) return { response: w.response };
  if (!w.parsed) return { response: fail(request, env, "ต้องใช้อีเมลมหาวิทยาลัย (@lru.ac.th)", 403, { reason: "not_university_email" }) };
  if (!w.verified) return { response: fail(request, env, "อีเมลนี้ยังไม่ได้รับการยืนยัน", 403, { reason: "email_not_verified" }) };
  const s = await env.DB.prepare("SELECT student_id,name FROM camp_students WHERE student_id=?").bind(w.parsed.studentId).first();
  if (!s) return { response: fail(request, env, `ไม่พบรหัสนักศึกษา ${w.parsed.studentId} ในรายชื่อ กรุณาติดต่อแอดมิน`, 403, { reason: "not_in_roster" }) };
  return { w, s };
}
const mine = (env, id) => env.DB.prepare("SELECT * FROM camp_shirt_designs WHERE student_id=?").bind(id).first();
const shapeDesign = (url, d, extra = {}) => ({ id: d.id, title: d.title, description: d.description, designer: d.designer_name, classGroup: d.class_group, image: imageUrl(url, d), ...extra });

// ---------- student ----------
async function me(request, env, url) {
  const r = await student(request, env);
  if (r.response) {   // the page shows why instead of failing: not a university email / not on the roster
    const body = await r.response.clone().json().catch(() => ({}));
    if (r.response.status === 403 && body.reason) { const st = await loadSettings(env); return json(request, env, { reason: body.reason, error: body.error, schedule: publicSettings(st), ...phases(st), now: Date.now() }); }
    return r.response;
  }
  const { s } = r, st = await loadSettings(env), now = Date.now(), ph = phases(st, now);
  const my = await mine(env, s.student_id);
  const vote = await env.DB.prepare("SELECT design_id FROM camp_shirt_votes WHERE student_id=?").bind(s.student_id).first();
  let gallery = null;   // shown while the public gallery is on, otherwise from the day voting opens
  if (st.galleryPublic || ph.vote === "open" || ph.vote === "after") {
    const rows = (await env.DB.prepare(
      `SELECT d.*,(SELECT COUNT(*) FROM camp_shirt_votes v WHERE v.design_id=d.id) votes FROM camp_shirt_designs d WHERE d.hidden=0 ORDER BY d.id`).all()).results || [];
    gallery = rows.map((d) => shapeDesign(url, d, { mine: d.student_id === s.student_id, ...(st.resultsPublic ? { votes: d.votes } : {}) }));
  }
  return json(request, env, { student: { studentId: s.student_id, name: s.name }, schedule: { submitFrom: st.submitFrom, submitTo: st.submitTo, voteFrom: st.voteFrom, voteTo: st.voteTo }, submit: ph.submit, vote: ph.vote, now,
    resultsPublic: st.resultsPublic, sample: sampleInfo(url, st), myDesign: my ? shapeDesign(url, my, { hidden: !!my.hidden }) : null, myVote: vote?.design_id || null, designs: gallery });
}
async function saveDesign(request, env, url) {
  const r = await student(request, env); if (r.response) return r.response;
  const { w, s } = r, st = await loadSettings(env);
  if (phases(st).submit !== "open") return fail(request, env, "ไม่อยู่ในช่วงรับผลงาน", 403, { code: "SUBMIT_CLOSED" });
  if (phases(st).vote === "open") return fail(request, env, "เปิดโหวตแล้ว แก้ผลงานไม่ได้", 403, { code: "VOTE_OPEN" });
  const designer = clean(url.searchParams.get("designer"), NAME_MAX), group = clean(url.searchParams.get("group"), GROUP_MAX);
  const title = clean(url.searchParams.get("title"), TITLE_MAX), description = clean(url.searchParams.get("description"), DESC_MAX);
  if (!designer) return fail(request, env, "กรอกชื่อผู้ออกแบบ", 400, { field: "designer" });
  if (!group) return fail(request, env, "กรอกหมู่เรียน", 400, { field: "group" });
  const old = await mine(env, s.student_id);
  const buf = new Uint8Array(await request.arrayBuffer());
  let kind = null;
  if (buf.length) {
    if (buf.length > MAX_IMAGE) return fail(request, env, "ไฟล์ใหญ่เกินไป (ไม่เกิน 10 MB)", 413);
    kind = sniff(buf); if (!kind) return fail(request, env, "ใช้ไฟล์ PNG, JPG หรือ WebP เท่านั้น");
  } else if (!old) return fail(request, env, "เลือกรูปผลงาน", 400, { field: "image" });
  let imageKey = old?.image_key, mime = old?.image_mime;
  if (kind) { imageKey = `camps/shirt/${s.student_id}-${Date.now()}.${kind[1]}`; mime = kind[0]; await env.FILES.put(imageKey, buf, { httpMetadata: { contentType: mime } }); }
  const id = old?.id || rid();
  await env.DB.prepare(`INSERT INTO camp_shirt_designs (id,student_id,designer_name,class_group,title,description,image_key,image_mime) VALUES (?,?,?,?,?,?,?,?)
    ON CONFLICT(student_id) DO UPDATE SET designer_name=excluded.designer_name,class_group=excluded.class_group,title=excluded.title,description=excluded.description,image_key=excluded.image_key,image_mime=excluded.image_mime,updated_at=datetime('now')`).bind(id, s.student_id, designer, group, title, description, imageKey, mime).run();
  if (kind && old?.image_key && old.image_key !== imageKey) { try { await env.FILES.delete(old.image_key); } catch (e) { /* orphan file is harmless */ } }
  await audit(env, w, "SHIRT_DESIGN", s.student_id, { created: !old, newImage: !!kind });
  return json(request, env, { ok: true, design: shapeDesign(url, await mine(env, s.student_id)) });
}
async function deleteMine(request, env) {
  const r = await student(request, env); if (r.response) return r.response;
  const st = await loadSettings(env), ph = phases(st);
  if (ph.submit !== "open" || ph.vote === "open") return fail(request, env, "ลบผลงานได้เฉพาะในช่วงรับผลงาน", 403);
  const d = await mine(env, r.s.student_id); if (!d) return json(request, env, { ok: true });
  await removeDesign(env, d); await audit(env, r.w, "SHIRT_DESIGN_DELETE", r.s.student_id);
  return json(request, env, { ok: true });
}
// a deleted design takes its votes and its picture with it (those students can vote again)
async function removeDesign(env, d) {
  await env.DB.batch([env.DB.prepare("DELETE FROM camp_shirt_votes WHERE design_id=?").bind(d.id), env.DB.prepare("DELETE FROM camp_shirt_designs WHERE id=?").bind(d.id)]);
  try { await env.FILES.delete(d.image_key); } catch (e) { /* ignore */ }
}
async function vote(request, env) {
  const r = await student(request, env); if (r.response) return r.response;
  const st = await loadSettings(env);
  if (phases(st).vote !== "open") return fail(request, env, "ไม่อยู่ในช่วงโหวต", 403, { code: "VOTE_CLOSED" });
  const b = await request.json().catch(() => null), id = clean(b?.designId, 40);
  const d = id ? await env.DB.prepare("SELECT id,student_id,hidden FROM camp_shirt_designs WHERE id=?").bind(id).first() : null;
  if (!d || d.hidden) return fail(request, env, "ไม่พบผลงานนี้", 404);
  if (d.student_id === r.s.student_id) return fail(request, env, "โหวตผลงานของตัวเองไม่ได้", 403, { code: "OWN_DESIGN" });
  await env.DB.prepare(`INSERT INTO camp_shirt_votes (student_id,design_id) VALUES (?,?) ON CONFLICT(student_id) DO UPDATE SET design_id=excluded.design_id,updated_at=datetime('now')`).bind(r.s.student_id, d.id).run();
  return json(request, env, { ok: true, myVote: d.id });
}
async function unvote(request, env) {
  const r = await student(request, env); if (r.response) return r.response;
  if (phases(await loadSettings(env)).vote !== "open") return fail(request, env, "ไม่อยู่ในช่วงโหวต", 403, { code: "VOTE_CLOSED" });
  await env.DB.prepare("DELETE FROM camp_shirt_votes WHERE student_id=?").bind(r.s.student_id).run();
  return json(request, env, { ok: true, myVote: null });
}
// public: only a visible design's picture (hidden / deleted ones are 404)
async function image(request, env, id) {
  const d = await env.DB.prepare("SELECT image_key,image_mime,hidden FROM camp_shirt_designs WHERE id=?").bind(id).first();
  if (!d || d.hidden) return new Response("Not Found", { status: 404 });
  const obj = await env.FILES.get(d.image_key); if (!obj) return new Response("Not Found", { status: 404 });
  const h = new Headers(); if (obj.writeHttpMetadata) obj.writeHttpMetadata(h);
  h.set("Content-Type", d.image_mime); h.set("Cache-Control", "public, max-age=3600"); h.set("Access-Control-Allow-Origin", "*"); h.set("X-Content-Type-Options", "nosniff");
  return new Response(obj.body, { headers: h });
}

// public page /shirt/: every visible design with who made it; no sign-in, no student ids. The counts only appear once the admins announced the results.
async function gallery(request, env, url) {
  const st = await loadSettings(env), ph = phases(st);
  let designs = [];
  if (st.galleryPublic) {
    const rows = (await env.DB.prepare(`SELECT d.*,(SELECT COUNT(*) FROM camp_shirt_votes v WHERE v.design_id=d.id) votes FROM camp_shirt_designs d WHERE d.hidden=0 ORDER BY d.id`).all()).results || [];
    designs = rows.map((d) => shapeDesign(url, d, st.resultsPublic ? { votes: d.votes } : {}));
  }
  const r = json(request, env, { now: Date.now(), galleryPublic: st.galleryPublic, resultsPublic: st.resultsPublic, schedule: { submitFrom: st.submitFrom, submitTo: st.submitTo, voteFrom: st.voteFrom, voteTo: st.voteTo }, submit: ph.submit, vote: ph.vote, sample: sampleInfo(url, st), designs });
  r.headers.set("Cache-Control", "public, max-age=30, stale-while-revalidate=60");
  return r;
}
// ---------- the sample shirt (uploaded by an admin) ----------
async function sampleImage(request, env) {
  const st = await loadSettings(env); if (!st._sample.key) return new Response("Not Found", { status: 404 });
  const obj = await env.FILES.get(st._sample.key); if (!obj) return new Response("Not Found", { status: 404 });
  const h = new Headers(); if (obj.writeHttpMetadata) obj.writeHttpMetadata(h);
  h.set("Content-Type", st._sample.mime || "image/png"); h.set("Cache-Control", "public, max-age=3600"); h.set("Access-Control-Allow-Origin", "*"); h.set("X-Content-Type-Options", "nosniff");
  return new Response(obj.body, { headers: h });
}
async function adminSample(request, env, url) {
  const a = await requireAdmin(request, env); if (a.response) return a.response;
  const buf = new Uint8Array(await request.arrayBuffer());
  if (!buf.length) return fail(request, env, "เลือกรูปเสื้อตัวอย่าง");
  if (buf.length > MAX_IMAGE) return fail(request, env, "ไฟล์ใหญ่เกินไป (ไม่เกิน 10 MB)", 413);
  const kind = sniff(buf); if (!kind) return fail(request, env, "ใช้ไฟล์ PNG, JPG หรือ WebP เท่านั้น");
  const old = await loadSettings(env), key = `camps/shirt/sample-${Date.now()}.${kind[1]}`;
  await env.FILES.put(key, buf, { httpMetadata: { contentType: kind[0] } });
  await env.DB.batch([setting(env, "shirt_sample_key", key), setting(env, "shirt_sample_mime", kind[0]), setting(env, "shirt_sample_v", Date.now())]);
  if (old._sample.key) { try { await env.FILES.delete(old._sample.key); } catch (e) { /* the new picture is saved; an orphan file is harmless */ } }
  await audit(env, a, "SHIRT_SAMPLE", null, { mime: kind[0], bytes: buf.length });
  return json(request, env, { ok: true, sample: sampleInfo(url, await loadSettings(env)) });
}
async function adminSampleReset(request, env) {
  const a = await requireAdmin(request, env); if (a.response) return a.response;
  const st = await loadSettings(env);
  await env.DB.batch([setting(env, "shirt_sample_key", ""), setting(env, "shirt_sample_mime", ""), setting(env, "shirt_sample_v", "")]);
  if (st._sample.key) { try { await env.FILES.delete(st._sample.key); } catch (e) { /* ignore */ } }
  await audit(env, a, "SHIRT_SAMPLE_RESET", null);
  return json(request, env, { ok: true });
}

// ---------- admin ----------
async function adminOverview(request, env, url) {
  const a = await requireAdmin(request, env); if (a.response) return a.response;
  const st = await loadSettings(env), now = Date.now(), ph = phases(st, now);
  const rows = (await env.DB.prepare(
    `SELECT d.*,s.name student_name,(SELECT COUNT(*) FROM camp_shirt_votes v WHERE v.design_id=d.id) votes FROM camp_shirt_designs d LEFT JOIN camp_students s ON s.student_id=d.student_id ORDER BY votes DESC,d.created_at`).all()).results || [];
  const voters = (await env.DB.prepare("SELECT COUNT(*) c FROM camp_shirt_votes").first())?.c || 0;
  return json(request, env, { now, settings: publicSettings(st), sample: sampleInfo(url, st), submit: ph.submit, vote: ph.vote, totals: { designs: rows.length, votes: voters },
    designs: rows.map((d) => shapeDesign(url, d, { studentId: d.student_id, studentName: d.student_name || "", hidden: !!d.hidden, votes: d.votes, createdAt: d.created_at })) });
}
// both ends of a window or none; the vote window cannot start before submissions end (a design could otherwise be swapped after it gathered votes)
async function adminSettings(request, env) {
  const a = await requireAdmin(request, env); if (a.response) return a.response;
  const b = await request.json().catch(() => null);
  if (!b) return fail(request, env, "ข้อมูลไม่ถูกต้อง");
  const v = {}; for (const k of Object.keys(KEYS)) { v[k] = num(b[k]); if (Number.isNaN(v[k]) || (v[k] != null && (v[k] < 1e12 || v[k] > 4.2e12))) return fail(request, env, "วันเวลาไม่ถูกต้อง"); }
  if ((v.submitFrom == null) !== (v.submitTo == null)) return fail(request, env, "ช่วงรับผลงาน: ใส่ทั้งวันเริ่มและวันปิด หรือเว้นว่างทั้งคู่");
  if ((v.voteFrom == null) !== (v.voteTo == null)) return fail(request, env, "ช่วงโหวต: ใส่ทั้งวันเริ่มและวันปิด หรือเว้นว่างทั้งคู่");
  if (v.submitFrom != null && v.submitTo <= v.submitFrom) return fail(request, env, "วันปิดรับผลงานต้องหลังวันเริ่มรับ");
  if (v.voteFrom != null && v.voteTo <= v.voteFrom) return fail(request, env, "วันปิดโหวตต้องหลังวันเริ่มโหวต");
  if (v.submitTo != null && v.voteFrom != null && v.voteFrom < v.submitTo) return fail(request, env, "ต้องเริ่มโหวตหลังปิดรับผลงาน (ไม่ให้ซ้อนกัน)");
  const pub = b.resultsPublic === true, gal = b.galleryPublic !== false;   // the public gallery stays on unless the admin switches it off
  await env.DB.batch([...Object.entries(KEYS).map(([k, key]) => setting(env, key, v[k] ?? "")), setting(env, "shirt_results_public", pub ? "1" : "0"), setting(env, "shirt_gallery_public", gal ? "1" : "0")]);
  await audit(env, a, "SHIRT_SETTINGS", null, { ...v, resultsPublic: pub, galleryPublic: gal });
  return json(request, env, { ok: true, settings: publicSettings(await loadSettings(env)) });
}
async function adminHide(request, env) {
  const a = await requireAdmin(request, env); if (a.response) return a.response;
  const b = await request.json().catch(() => null), id = clean(b?.id, 40);
  const d = await env.DB.prepare("SELECT id FROM camp_shirt_designs WHERE id=?").bind(id).first(); if (!d) return fail(request, env, "ไม่พบผลงาน", 404);
  const hidden = b?.hidden === true ? 1 : 0;
  await env.DB.prepare("UPDATE camp_shirt_designs SET hidden=? WHERE id=?").bind(hidden, id).run();
  if (hidden) await env.DB.prepare("DELETE FROM camp_shirt_votes WHERE design_id=?").bind(id).run();   // votes for a pulled design are returned
  await audit(env, a, hidden ? "SHIRT_HIDE" : "SHIRT_UNHIDE", id);
  return json(request, env, { ok: true });
}
async function adminDelete(request, env) {
  const a = await requireAdmin(request, env); if (a.response) return a.response;
  const b = await request.json().catch(() => null), id = clean(b?.id, 40);
  const d = await env.DB.prepare("SELECT * FROM camp_shirt_designs WHERE id=?").bind(id).first(); if (!d) return fail(request, env, "ไม่พบผลงาน", 404);
  await removeDesign(env, d); await audit(env, a, "SHIRT_DELETE", id, { studentId: d.student_id });
  return json(request, env, { ok: true });
}

export async function shirt(request, env, url) {
  try {
    const p = url.pathname, m = request.method;
    if (m === "GET" && p === "/camps/shirt/me") return await me(request, env, url);
    if (m === "POST" && p === "/camps/shirt/design") return await saveDesign(request, env, url);
    if (m === "POST" && p === "/camps/shirt/design/delete") return await deleteMine(request, env);
    if (m === "POST" && p === "/camps/shirt/vote") return await vote(request, env);
    if (m === "POST" && p === "/camps/shirt/unvote") return await unvote(request, env);
    { const im = /^\/camps\/shirt\/image\/([a-f0-9]{24})$/.exec(p); if (m === "GET" && im) return await image(request, env, im[1]); }
    if (m === "GET" && p === "/camps/shirt/sample") return await sampleImage(request, env);
    if (m === "GET" && p === "/camps/shirt/gallery") return await gallery(request, env, url);
    if (m === "POST" && p === "/camps/shirt/admin/sample") return await adminSample(request, env, url);
    if (m === "POST" && p === "/camps/shirt/admin/sample/reset") return await adminSampleReset(request, env);
    if (m === "GET" && p === "/camps/shirt/admin/overview") return await adminOverview(request, env, url);
    if (m === "POST" && p === "/camps/shirt/admin/settings") return await adminSettings(request, env);
    if (m === "POST" && p === "/camps/shirt/admin/design/hide") return await adminHide(request, env);
    if (m === "POST" && p === "/camps/shirt/admin/design/delete") return await adminDelete(request, env);
    return fail(request, env, "Not Found", 404);
  } catch (e) {
    console.error("[shirt]", e?.message || e);
    return fail(request, env, "เกิดข้อผิดพลาด ลองใหม่อีกครั้ง", 500);
  }
}
export const _internals = { phases, windowState, sniff };
