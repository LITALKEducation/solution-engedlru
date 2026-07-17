export function corsHeaders(request, env) {
  const allowed = (env.ALLOWED_ORIGINS || "").split(",").map(s => s.trim()).filter(Boolean);
  const origin = request.headers.get("Origin") || "";
  const allowOrigin = allowed.includes(origin) ? origin : allowed[0] || "";

  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type,Authorization",
    "Vary": "Origin"
  };
}

export function json(request, env, data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...corsHeaders(request, env) }
  });
}

export function handleOptions(request, env) {
  return new Response(null, { status: 204, headers: corsHeaders(request, env) });
}
