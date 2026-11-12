// Auth0 helpers.
function normalizeDomain(value, name) {
  let domain = String(value || "").trim();
  if (domain.startsWith("https://")) domain = domain.slice(8);
  else if (domain.startsWith("http://")) domain = domain.slice(7);
  while (domain.endsWith("/")) domain = domain.slice(0, -1);
  if (!domain) throw new Error(`${name} is not configured`);
  return domain;
}

// Custom domain used by the browser login flow and /userinfo.
function auth0Domain(env) {
  return normalizeDomain(env.AUTH0_DOMAIN, "AUTH0_DOMAIN");
}

// Canonical tenant domain used for Auth0 Management API M2M requests.
function auth0ManagementDomain(env) {
  return normalizeDomain(env.AUTH0_MANAGEMENT_API_DOMAIN, "AUTH0_MANAGEMENT_API_DOMAIN");
}

// Auth0 rate-limits /userinfo, the M2M token endpoint and the Management API. The Budget app fires several
// requests at once (dashboard, meta, notifications, ...), so cache per isolate and share in-flight calls.
const USER_TTL = 30_000, ROLES_TTL = 60_000;
const userCache = new Map(), rolesCache = new Map();
let mgmtToken = null; // { token, exp, promise }
function remember(map, key, ttl, promise, ok) {
  map.set(key, { exp: Date.now() + ttl, promise });
  if (map.size > 300) for (const [k, v] of map) if (v.exp < Date.now()) map.delete(k);
  promise.then((v) => { if (!ok(v)) map.delete(key); }, () => map.delete(key));
  return promise;
}

// Returns { user, status }: user=null with status 401/403 means a bad/expired token; 429, 5xx or 0 (network)
// means Auth0 itself was unavailable and the caller should NOT treat the session as invalid.
export async function getAuth0UserEx(env, accessToken) {
  if (!accessToken) return { user: null, status: 401 };
  const hit = userCache.get(accessToken);
  if (hit && hit.exp > Date.now()) return hit.promise;
  const promise = (async () => {
    try {
      const res = await fetch(`https://${auth0Domain(env)}/userinfo`, { headers: { Authorization: `Bearer ${accessToken}` } });
      if (!res.ok) return { user: null, status: res.status };
      return { user: await res.json(), status: 200 };
    } catch (e) {
      console.error("[auth0] userinfo failed:", e?.message || e);
      return { user: null, status: 0 };
    }
  })();
  return remember(userCache, accessToken, USER_TTL, promise, (v) => !!v.user);
}

export async function getAuth0User(env, accessToken) {
  return (await getAuth0UserEx(env, accessToken)).user;
}

export async function getAuth0UserFromRequest(request, env) {
  const h = request.headers.get('Authorization') || '';
  if (!h.startsWith('Bearer ')) return { user:null, response:new Response(JSON.stringify({error:'Missing Authorization'}), {status:401,headers:{'Content-Type':'application/json'}}) };
  const { user, status } = await getAuth0UserEx(env, h.slice(7));
  if (!user) {
    const unavailable = status === 429 || status >= 500 || status === 0;
    return { user:null, unavailable, response:new Response(JSON.stringify({error: unavailable ? 'ระบบยืนยันตัวตน (Auth0) ไม่ว่างชั่วคราว กรุณาลองใหม่อีกครั้ง' : 'Invalid or expired access token'}), {status: unavailable ? 503 : 401,headers:{'Content-Type':'application/json'}}) };
  }
  return { user, response:null };
}

export async function getManagementToken(env) {
  if (mgmtToken && mgmtToken.exp > Date.now() + 60_000) return mgmtToken.token;
  if (mgmtToken && mgmtToken.promise) return mgmtToken.promise;
  const promise = fetchManagementToken(env).then((t) => { mgmtToken = { token: t.token, exp: Date.now() + t.ttl * 1000 }; return t.token; },
    (e) => { mgmtToken = null; throw e; });
  mgmtToken = { token: null, exp: 0, promise };
  return promise;
}

async function fetchManagementToken(env) {
  const domain = auth0ManagementDomain(env);
  const audience = String(env.AUTH0_MANAGEMENT_API_AUDIENCE || "").trim();
  if (!audience) throw new Error("AUTH0_MANAGEMENT_API_AUDIENCE is not configured");
  if (!env.AUTH0_M2M_CLIENT_ID || !env.AUTH0_M2M_CLIENT_SECRET) {
    throw new Error("Auth0 M2M credentials are missing (AUTH0_M2M_CLIENT_ID / AUTH0_M2M_CLIENT_SECRET)");
  }

  const res = await fetch(`https://${domain}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'client_credentials',
      client_id: env.AUTH0_M2M_CLIENT_ID,
      client_secret: env.AUTH0_M2M_CLIENT_SECRET,
      audience,
      scope: 'read:users read:roles update:users'
    })
  });

  if (!res.ok) {
    const details = await res.text();
    throw new Error(`Auth0 Management API token request failed (${res.status}): ${details}`);
  }
  const data = await res.json();
  if (!data.access_token) throw new Error("Auth0 Management API did not return an access_token");
  return { token: data.access_token, ttl: Math.max(120, Number(data.expires_in) || 3600) };
}

export async function getAuth0Roles(env, userId) {
  if (!userId) throw new Error("Auth0 user ID is missing");
  const hit = rolesCache.get(userId);
  if (hit && hit.exp > Date.now()) return hit.promise;
  return remember(rolesCache, userId, ROLES_TTL, fetchAuth0Roles(env, userId), () => true);
}

async function fetchAuth0Roles(env, userId) {
  const domain = auth0ManagementDomain(env);
  const token = await getManagementToken(env);
  const url = `https://${domain}/api/v2/users/${encodeURIComponent(userId)}/roles?per_page=100&page=0`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) {
    const details = await res.text();
    throw new Error(`Auth0 user-role lookup failed (${res.status}): ${details}`);
  }
  const data = await res.json();
  if (!Array.isArray(data)) throw new Error("Auth0 user-role lookup returned an unexpected response");
  return data.map(role => String(role?.name || "").trim()).filter(Boolean);
}

// Profile picture of the Auth0 user with this email (Google avatar), for the lottery scan popup. Returns null when the
// student never signed in, the M2M app lacks read:users, or Auth0 is slow — callers must treat the picture as optional.
const pictureCache = new Map();
export async function getAuth0PictureByEmail(env, email) {
  const key = String(email || "").trim().toLowerCase();
  if (!key) return null;
  const hit = pictureCache.get(key);
  if (hit && hit.exp > Date.now()) return hit.promise;
  const promise = (async () => {
    const domain = auth0ManagementDomain(env);
    const token = await getManagementToken(env);
    const res = await fetch(`https://${domain}/api/v2/users-by-email?email=${encodeURIComponent(key)}&fields=picture&include_fields=true`, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) throw new Error(`Auth0 picture lookup failed (${res.status})`);
    const list = await res.json();
    const pic = Array.isArray(list) ? list.map((u) => u && u.picture).find((x) => typeof x === "string" && /^https:\/\//.test(x)) : null;
    return pic || null;
  })();
  pictureCache.set(key, { exp: Date.now() + 10 * 60_000, promise });
  if (pictureCache.size > 300) for (const [k, v] of pictureCache) if (v.exp < Date.now()) pictureCache.delete(k);
  promise.catch(() => pictureCache.delete(key));   // a failed lookup is retried on the next scan
  return promise;
}

export async function updateAuth0User(env,userId,payload) {
  const domain = auth0ManagementDomain(env);
  const token = await getManagementToken(env);
  const res = await fetch(`https://${domain}/api/v2/users/${encodeURIComponent(userId)}`,{method:'PATCH',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify(payload)});
  if(!res.ok)throw new Error(`Failed to update user profile: ${await res.text()}`);
  return res.json();
}
