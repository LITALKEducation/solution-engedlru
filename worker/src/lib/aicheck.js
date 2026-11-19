// AI-generated image check for the shirt uploads. Two sources, both best effort (no detector is reliable, so the result only FLAGS a design for the admins):
//   1. embedded generator tags (IPTC "trainedAlgorithmicMedia", Stable Diffusion / ComfyUI parameters, Midjourney, DALL-E, Firefly, C2PA ...). The browser reads them from the
//      ORIGINAL file (resizing strips them) and sends the short keys below; the Worker only accepts keys from this list.
//   2. an optional detection service: Sightengine "genai" when the secrets SIGHTENGINE_USER and SIGHTENGINE_SECRET are set (`wrangler secret put ...`).
export const STRONG = ["iptc_ai", "sd_params", "midjourney", "dalle", "openai", "firefly", "gemini"];
export const WEAK = ["c2pa"];   // Content Credentials are also written by ordinary cameras / editors, so alone they only ask for a look
const THRESHOLD = { likely: 0.85, review: 0.5 };

export const cleanSignals = (raw) => [...new Set(String(raw || "").split(",").map((s) => s.trim()).filter((s) => STRONG.includes(s) || WEAK.includes(s)))];

// returns the score (0..1) or null when the service is not configured or fails (fail open: a student is never blocked by it)
export async function detect(env, buf, mime) {
  if (!env.SIGHTENGINE_USER || !env.SIGHTENGINE_SECRET) return null;
  try {
    const fd = new FormData();
    fd.append("media", new Blob([buf], { type: mime }), "design");
    fd.append("models", "genai"); fd.append("api_user", env.SIGHTENGINE_USER); fd.append("api_secret", env.SIGHTENGINE_SECRET);
    const r = await fetch("https://api.sightengine.com/1.0/check.json", { method: "POST", body: fd, signal: AbortSignal.timeout(8000) });
    if (!r.ok) return null;
    const d = await r.json(), s = Number(d?.type?.ai_generated);
    return Number.isFinite(s) ? Math.min(1, Math.max(0, s)) : null;
  } catch (e) { console.error("[aicheck]", e?.message || e); return null; }
}

export async function assess(env, buf, mime, clientSignals) {
  const signals = cleanSignals(clientSignals), score = await detect(env, buf, mime);
  let level = "none";
  if (signals.some((k) => STRONG.includes(k)) || (score != null && score >= THRESHOLD.likely)) level = "likely";
  else if (signals.length || (score != null && score >= THRESHOLD.review)) level = "review";
  return { level, score, signals };
}
