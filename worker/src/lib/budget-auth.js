import { getAuth0User, getAuth0Roles } from "./auth0.js";

export async function requireBudgetAuth(request, env) {
  const auth = await getAuth0User(request, env);
  if (!auth?.user?.sub) return { ok:false, response: auth.response };

  const user = auth.user;
  const roles = await getAuth0Roles(env, user.sub);
  const email = (user.email || "").toLowerCase();

  let row = await env.DB.prepare(
    "SELECT * FROM budget_users WHERE auth0_user_id = ? AND enabled = 1"
  ).bind(user.sub).first();

  if (!row && email) {
    row = await env.DB.prepare(
      "SELECT * FROM budget_users WHERE email = ? AND enabled = 1"
    ).bind(email).first();
  }

  const isAdmin = roles.includes("budget_admin");
  if (!row && !isAdmin) {
    return { ok:false, response: new Response(JSON.stringify({error:"Budget access is not enabled for this account."}), {status:403, headers:{"Content-Type":"application/json"}}) };
  }

  if (!row && isAdmin) {
    const uuid = crypto.randomUUID();
    await env.DB.prepare(
      "INSERT INTO budget_users (uuid, auth0_user_id, email, display_name, enabled) VALUES (?, ?, ?, ?, 1)"
    ).bind(uuid, user.sub, email, user.name || user.nickname || email).run();
    row = await env.DB.prepare("SELECT * FROM budget_users WHERE uuid = ?").bind(uuid).first();
  }

  const isSuperAdmin = isAdmin;
  const accessRows = await env.DB.prepare(
    "SELECT account_uuid FROM budget_account_access WHERE user_uuid = ?"
  ).bind(row.uuid).all();
  const accessibleAccounts = accessRows.results?.map(x=>x.account_uuid) || [];

  return { ok:true, user, row, roles, isAdmin, isSuperAdmin, accessibleAccounts };
}

export function canAccessAccount(auth, accountUuid) {
  return auth.isAdmin || auth.accessibleAccounts.includes(accountUuid);
}
