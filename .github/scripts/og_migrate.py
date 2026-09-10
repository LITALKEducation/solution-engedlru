from pathlib import Path
import re

schema = Path('worker/schema.sql')
s = schema.read_text()
if 'CREATE TABLE IF NOT EXISTS site_og_images' not in s:
    s += '''\n\n-- ── Open Graph images (metadata in D1, binary files in R2) ──\nCREATE TABLE IF NOT EXISTS site_og_images (\n  page       TEXT PRIMARY KEY,\n  image_key  TEXT NOT NULL,\n  mime       TEXT,\n  updated_at TEXT NOT NULL DEFAULT (datetime('now'))\n);\n'''
    schema.write_text(s)

Path('worker/src/handlers/og.js').write_text('''const FALLBACKS = {\n  home: "https://solution.litalkeducation.com/img/og/home.png",\n  checkup: "https://solution.litalkeducation.com/img/og/checkup.png",\n  card: "https://solution.litalkeducation.com/img/og/home.png",\n  sys: "https://solution.litalkeducation.com/img/og/token.png"\n};\n\nexport async function getOgImage(request, env, url) {\n  const page = (url.searchParams.get("page") || "home").trim().toLowerCase();\n  try {\n    const row = await env.DB.prepare("SELECT image_key, mime FROM site_og_images WHERE page = ? LIMIT 1").bind(page).first();\n    if (row?.image_key) {\n      const object = await env.FILES.get(row.image_key);\n      if (object) {\n        const headers = new Headers();\n        object.writeHttpMetadata(headers);\n        if (row.mime) headers.set("Content-Type", row.mime);\n        headers.set("Cache-Control", "public, max-age=3600, stale-while-revalidate=86400");\n        headers.set("Access-Control-Allow-Origin", "*");\n        headers.set("X-OG-Source", "r2");\n        return new Response(object.body, { headers });\n      }\n    }\n  } catch (error) {\n    console.warn("OG image lookup failed", { page, message: error.message });\n  }\n  const fallback = FALLBACKS[page] || FALLBACKS.home;\n  const response = await fetch(fallback, { cf: { cacheTtl: 3600, cacheEverything: true } });\n  const headers = new Headers(response.headers);\n  headers.set("Cache-Control", "public, max-age=900, stale-while-revalidate=86400");\n  headers.set("Access-Control-Allow-Origin", "*");\n  headers.set("X-OG-Source", "fallback");\n  return new Response(response.body, { status: response.status, headers });\n}\n\nexport async function listOgImages(request, env) {\n  const { results = [] } = await env.DB.prepare("SELECT page, image_key, mime, updated_at FROM site_og_images ORDER BY page").all();\n  return results;\n}\n\nexport async function upsertOgImage(request, env) {\n  const body = await request.json();\n  const page = String(body.page || "").trim().toLowerCase();\n  const imageKey = String(body.image_key || body.imageKey || "").trim();\n  const mime = String(body.mime || "").trim() || null;\n  if (!/^[a-z0-9/_-]{1,80}$/.test(page)) throw new Error("Invalid page key");\n  if (!imageKey) throw new Error("image_key is required");\n  await env.DB.prepare(`INSERT INTO site_og_images (page, image_key, mime, updated_at) VALUES (?, ?, ?, datetime('now')) ON CONFLICT(page) DO UPDATE SET image_key = excluded.image_key, mime = excluded.mime, updated_at = datetime('now')`).bind(page, imageKey, mime).run();\n  return { ok: true, page, image_key: imageKey, mime };\n}\n''')

idx = Path('worker/src/index.js')
t = idx.read_text()
if 'from "./handlers/og.js"' not in t:
    t = t.replace('import { getStats } from "./handlers/admin/stats.js";', 'import { getStats } from "./handlers/admin/stats.js";\nimport { getOgImage, listOgImages, upsertOgImage } from "./handlers/og.js";')
if 'pathname === "/og/image"' not in t:
    t = t.replace('      if (pathname.startsWith("/files/") && request.method === "GET") {', '      if (pathname === "/og/image" && request.method === "GET") {\n        return await getOgImage(request, env, url);\n      }\n\n      if (pathname.startsWith("/files/") && request.method === "GET") {')
marker = '        if (pathname === "/admin/stats" && request.method === "GET") return await getStats(request, env);'
if 'pathname === "/admin/og-images"' not in t:
    t = t.replace(marker, marker + '\n\n        if (pathname === "/admin/og-images" && request.method === "GET") return json(request, env, await listOgImages(request, env));\n        if (pathname === "/admin/og-images" && request.method === "POST") return json(request, env, await upsertOgImage(request, env));')
idx.write_text(t)

replacements = {
    'index.html': ('https://solution.litalkeducation.com/img/og/home.png', 'https://engedlru-api.stnetworld.workers.dev/og/image?page=home'),
    'checkup.html': ('https://solution.litalkeducation.com/img/og/checkup.png', 'https://engedlru-api.stnetworld.workers.dev/og/image?page=checkup'),
    'card.html': ('https://solution.litalkeducation.com/img/og/home.png', 'https://engedlru-api.stnetworld.workers.dev/og/image?page=card'),
    'sys.html': ('https://solution.litalkeducation.com/img/og/token.png', 'https://engedlru-api.stnetworld.workers.dev/og/image?page=sys'),
}
for file, (old, new) in replacements.items():
    p = Path(file)
    if p.exists():
        text = p.read_text()
        text = text.replace(old, new)
        p.write_text(text)

sw = Path('service-worker.js')
if sw.exists():
    text = sw.read_text()
    text = re.sub(r"const CACHE_NAME = 'sorasukt-pwa-v(\d+)'", lambda m: f"const CACHE_NAME = 'sorasukt-pwa-v{int(m.group(1))+1}'", text, count=1)
    sw.write_text(text)
