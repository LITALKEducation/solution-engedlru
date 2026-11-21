// Small helpers that keep D1 / Auth0 off the hot path.
//   edgeCached(key, ttl, loader)  Cloudflare Cache API (shared by every isolate in a data centre) for small JSON values that are the same for everybody.
//                                 Only ever store what is safe to share (never anything per-person unless the key is derived from a secret). No-op where the
//                                 Cache API does not exist (tests, local dev): the loader just runs.
//   readDb(env)                   a D1 session that may read from the nearest read replica (only for data where a few seconds of lag is fine).
//   timed(env)                    wraps env.DB to count D1 round trips and their time, for the Server-Timing header.
export async function edgeCached(key, ttlSec, loader) {
  const c = globalThis.caches && globalThis.caches.default;
  if (!c) return loader();
  const req = new Request("https://edge-cache.invalid/" + key);
  try { const hit = await c.match(req); if (hit) return await hit.json(); } catch (e) { /* cache unavailable: fall through to the loader */ }
  const v = await loader();
  try { await c.put(req, new Response(JSON.stringify(v), { headers: { "Content-Type": "application/json", "Cache-Control": "public, max-age=" + ttlSec } })); } catch (e) { /* ignore */ }
  return v;
}

// `first-unconstrained` = any replica is fine. Falls back to the primary where read replication / sessions are not available.
export function readDb(env) {
  try { if (typeof env.DB.withSession === "function") return env.DB.withSession("first-unconstrained"); } catch (e) { /* ignore */ }
  return env.DB;
}

export function sha256hex(text) {
  return crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)).then((b) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join(""));
}

// returns { env, stats } where stats = { n, ms } fills in while the request runs
export function timed(env) {
  const stats = { n: 0, ms: 0 };
  const run = async (fn) => { const t = Date.now(); stats.n++; try { return await fn(); } finally { stats.ms += Date.now() - t; } };
  const wrap = (st) => ({
    bind: (...a) => wrap(st.bind(...a)),
    all: (...a) => run(() => st.all(...a)), first: (...a) => run(() => st.first(...a)), run: (...a) => run(() => st.run(...a)), raw: (...a) => run(() => st.raw(...a)),
    _st: st
  });
  const DB = new Proxy(env.DB, { get(t, k) {
    if (k === "prepare") return (sql) => wrap(t.prepare(sql));
    if (k === "batch") return (list) => run(() => t.batch(list.map((s) => (s && s._st) || s)));
    if (k === "withSession") return (c) => { const s = t.withSession(c); return { prepare: (sql) => wrap(s.prepare(sql)), batch: (list) => run(() => s.batch(list.map((x) => (x && x._st) || x))), getBookmark: () => s.getBookmark && s.getBookmark() }; };
    const v = t[k]; return typeof v === "function" ? v.bind(t) : v;
  } });
  return { env: { ...env, DB }, stats };
}
