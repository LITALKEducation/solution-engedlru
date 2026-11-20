// Cloudflare Pages Function: puts the admin's link-preview edits (title, description, image per page) into the HTML that crawlers read.
// LINE / Facebook / X do not run JavaScript, so the text has to be in the HTML they download. The static page already carries valid default
// tags (written by worker/scripts/build-og-meta.mjs); this only swaps their values. Runs only for the paths in camps/_routes.json.
// If the API is slow or down the page is served exactly as it is, with the default tags.
const API = 'https://engedlru-api.stnetworld.workers.dev';
const norm = (p) => (p.length > 1 ? p.replace(/\/$/, '') : p);
// the runtime escapes quotes in an attribute value but not & < >, and admin text is free-form
const attr = (v) => String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const set = (name, value) => ({ element(el) { el.setAttribute(name, attr(value)); } });

// X-Camps-OG tells you what happened (curl -sI https://enged.sorasukt.com/student/ | grep -i x-camps-og): applied:<page> = the admin's values were
// written into the HTML; no-match = this path is not an OG page; api-<status> / api-error = the API did not answer, default tags were served.
const tag = (res, v) => { const out = new Response(res.body, res); out.headers.set('X-Camps-OG', v); return out; };

export async function onRequestGet({ request, next, env }) {
  const res = await next();
  if (!(res.headers.get('content-type') || '').includes('text/html')) return res;
  let pages;
  try {
    // A Worker cannot fetch another Worker of the same account through its public *.workers.dev address (Cloudflare answers 404 "error code: 1042"),
    // so when the Pages project has a service binding named CAMPS_API to the engedlru-api Worker it is used instead of the public URL.
    const r = env && env.CAMPS_API && env.CAMPS_API.fetch
      ? await env.CAMPS_API.fetch(new Request('https://engedlru-api.internal/camps/og/pages'))
      : await fetch((env && env.OG_API ? env.OG_API : API) + '/camps/og/pages', { cf: { cacheTtl: 30, cacheEverything: true }, signal: AbortSignal.timeout(4000) });
    if (!r.ok) return tag(res, 'api-' + r.status);
    pages = (await r.json()).pages;
  } catch (e) { return tag(res, 'api-error'); }
  const path = norm(new URL(request.url).pathname.replace(/\.html$/, '').replace(/\/index$/, '/'));
  const hit = Object.entries(pages || {}).find(([, x]) => (x.paths || [x.path]).some((q) => norm(q) === path));
  const p = hit && hit[1], key = hit && hit[0];
  if (!p) return tag(res, 'no-match');
  const rw = new HTMLRewriter()
    .on('meta[name="description"]', set('content', p.description))
    .on('meta[property="og:title"]', set('content', p.title)).on('meta[name="twitter:title"]', set('content', p.title))
    .on('meta[property="og:description"]', set('content', p.description)).on('meta[name="twitter:description"]', set('content', p.description))
    .on('meta[property="og:image"]', set('content', p.image)).on('meta[name="twitter:image"]', set('content', p.image));
  // the default images are 1200 x 630; an uploaded image can be any size, so do not claim one
  if (p.customImage) rw.on('meta[property="og:image:width"]', { element(el) { el.remove(); } }).on('meta[property="og:image:height"]', { element(el) { el.remove(); } });
  const out = rw.transform(res);
  out.headers.set('Cache-Control', 'public, max-age=0, must-revalidate');
  out.headers.set('X-Camps-OG', 'applied:' + key);
  return out;
}
