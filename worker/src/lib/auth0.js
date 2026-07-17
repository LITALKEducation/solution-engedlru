// ตรวจสอบ access_token กับ Auth0 แล้วคืนข้อมูลผู้ใช้ (เทียบเท่า UrlFetchApp ไป /userinfo เดิม)
export async function getAuth0User(env, accessToken) {
  const res = await fetch(`https://${env.AUTH0_DOMAIN}/userinfo`, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  if (!res.ok) return null;
  return res.json();
}

// ขอ Management API token แบบ M2M (เทียบเท่า tokenUrl fetch เดิมใน auth0_m2m.gs)
export async function getManagementToken(env) {
  const res = await fetch(`https://${env.AUTH0_DOMAIN}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type: "client_credentials",
      client_id: env.AUTH0_M2M_CLIENT_ID,
      client_secret: env.AUTH0_M2M_CLIENT_SECRET,
      audience: `https://${env.AUTH0_DOMAIN}/api/v2/`
    })
  });
  if (!res.ok) throw new Error(`Failed to get Management Token: ${await res.text()}`);
  const data = await res.json();
  return data.access_token;
}

export async function updateAuth0User(env, userId, payload) {
  const managementToken = await getManagementToken(env);
  const res = await fetch(`https://${env.AUTH0_DOMAIN}/api/v2/users/${encodeURIComponent(userId)}`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${managementToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });
  if (!res.ok) throw new Error(`Failed to update user profile: ${await res.text()}`);
  return res.json();
}
