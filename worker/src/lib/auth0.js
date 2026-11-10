// Auth0 helpers.
export async function getAuth0User(env, accessToken) {
  if (!accessToken) return null;
  const res = await fetch(`https://${env.AUTH0_DOMAIN}/userinfo`, { headers: { Authorization: `Bearer ${accessToken}` } });
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
  const res = await fetch(`https://${env.AUTH0_DOMAIN}/oauth/token`, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({grant_type:'client_credentials',client_id:env.AUTH0_M2M_CLIENT_ID,client_secret:env.AUTH0_M2M_CLIENT_SECRET,audience:`https://${env.AUTH0_DOMAIN}/api/v2/`}) });
  if (!res.ok) throw new Error(`Failed to get Management Token: ${await res.text()}`);
  return (await res.json()).access_token;
}
export async function getAuth0Roles(env, userId) {
  try { const token=await getManagementToken(env); const res=await fetch(`https://${env.AUTH0_DOMAIN}/api/v2/users/${encodeURIComponent(userId)}/roles`, {headers:{Authorization:'Bearer '+token}}); if(!res.ok)return []; const data=await res.json(); return Array.isArray(data)?data.map(x=>x.name).filter(Boolean):[]; } catch (_) { return []; }
}
export async function updateAuth0User(env,userId,payload) {
  const token=await getManagementToken(env);
  const res=await fetch(`https://${env.AUTH0_DOMAIN}/api/v2/users/${encodeURIComponent(userId)}`,{method:'PATCH',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify(payload)});
  if(!res.ok)throw new Error(`Failed to update user profile: ${await res.text()}`);
  return res.json();
}