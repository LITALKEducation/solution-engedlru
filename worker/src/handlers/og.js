const FALLBACKS = {
  home: "https://solution.litalkeducation.com/img/og/home.png",
  checkup: "https://solution.litalkeducation.com/img/og/checkup.png",
  card: "https://solution.litalkeducation.com/img/og/home.png",
  sys: "https://solution.litalkeducation.com/img/og/token.png"
};

export async function getOgImage(request, env, url) {
  const page = (url.searchParams.get("page") || "home").trim().toLowerCase();
  try {
    const row = await env.DB.prepare("SELECT image_key, mime FROM site_og_images WHERE page = ? LIMIT 1").bind(page).first();
    if (row?.image_key) {
      const object = await env.FILES.get(row.image_key);
      if (object) {
        const headers = new Headers();
        object.writeHttpMetadata(headers);
        if (row.mime) headers.set("Content-Type", row.mime);
        headers.set("Cache-Control", "public, max-age=3600, stale-while-revalidate=86400");
        headers.set("Access-Control-Allow-Origin", "*");
        headers.set("X-OG-Source", "r2");
        return new Response(object.body, { headers });
      }
    }
  } catch (error) {
    console.warn("OG image lookup failed", { page, message: error.message });
  }
  const fallback = FALLBACKS[page] || FALLBACKS.home;
  const response = await fetch(fallback, { cf: { cacheTtl: 3600, cacheEverything: true } });
  const headers = new Headers(response.headers);
  headers.set("Cache-Control", "public, max-age=900, stale-while-revalidate=86400");
  headers.set("Access-Control-Allow-Origin", "*");
  headers.set("X-OG-Source", "fallback");
  return new Response(response.body, { status: response.status, headers });
}

export async function listOgImages(request, env) {
  const { results = [] } = await env.DB.prepare("SELECT page, image_key, mime, updated_at FROM site_og_images ORDER BY page").all();
  return results;
}

export async function upsertOgImage(request, env) {
  const body = await request.json();
  const page = String(body.page || "").trim().toLowerCase();
  const imageKey = String(body.image_key || body.imageKey || "").trim();
  const mime = String(body.mime || "").trim() || null;
  if (!/^[a-z0-9/_-]{1,80}$/.test(page)) throw new Error("Invalid page key");
  if (!imageKey) throw new Error("image_key is required");
  await env.DB.prepare(`INSERT INTO site_og_images (page, image_key, mime, updated_at) VALUES (?, ?, ?, datetime('now')) ON CONFLICT(page) DO UPDATE SET image_key = excluded.image_key, mime = excluded.mime, updated_at = datetime('now')`).bind(page, imageKey, mime).run();
  return { ok: true, page, image_key: imageKey, mime };
}
