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

export async function getAuth0User(env, accessToken) {
  if (!accessToken) return null;
  const res = await fetch(`https://${auth0Domain(env)}/userinfo`, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) return null;
  return res.json();
}

export async function getAuth0UserFromRequest(request, env) {
  const h = request.headers.get('Authorization') || '';
  if (!h.startsWith('Bearer ')) return { user:null, response:new Response(JSON.stringify({error:'Missing Authorization'}), {status:401,headers:{'Content-Type':'application/json'}}) };
  const user = await getAuth0User(env, h.slice(7));
  if (!user) return { user:null, response:new Response(JSON.stringify({error:'Invalid or expired access token'}), {status:401,headers:{'Content-Type':'application/json'}}) };
  return { user, response:null };
}

export async function getManagementToken(env) {
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
  return data.access_token;
}

export async function getAuth0Roles(env, userId) {
  if (!userId) throw new Error("Auth0 user ID is missing");
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

export async function updateAuth0User(env,userId,payload) {
  const domain = auth0ManagementDomain(env);
  const token = await getManagementToken(env);
  const res = await fetch(`https://${domain}/api/v2/users/${encodeURIComponent(userId)}`,{method:'PATCH',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify(payload)});
  if(!res.ok)throw new Error(`Failed to update user profile: ${await res.text()}`);
  return res.json();
}
