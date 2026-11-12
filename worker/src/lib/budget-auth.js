import { getAuth0UserFromRequest, getAuth0Roles } from "./auth0.js";
import { json } from "./cors.js";

export async function requireBudgetAuth(request,env){
 const auth=await getAuth0UserFromRequest(request,env);
 if(!auth.user){
  if(auth.unavailable)return {ok:false,response:json(request,env,{error:"ระบบยืนยันตัวตน (Auth0) ไม่ว่างชั่วคราว กรุณาลองใหม่อีกครั้ง",code:"AUTH_UNAVAILABLE"},503)};
  return {ok:false,response:json(request,env,{error:auth.response?.status===401?"Unauthorized":"Authentication failed"},auth.response?.status||401)};
 }

 const user=auth.user,email=(user.email||"").toLowerCase();
 let roles;
 try {
  roles=await getAuth0Roles(env,user.sub);
 } catch (error) {
  // Do not silently turn an Auth0 Management API failure into an empty role list.
  // This keeps role-based admin checks fail-closed while making the configuration
  // problem visible to the client and in Cloudflare Worker logs.
  console.error("[budget-auth] Auth0 role lookup failed:", error?.message || error);
  return {
   ok:false,
   response:json(request,env,{
    error:"ไม่สามารถตรวจสอบ Auth0 Role ได้ กรุณาตรวจสอบ M2M credentials และสิทธิ์ Management API",
    code:"AUTH0_ROLE_LOOKUP_FAILED"
   },503)
  };
 }

 // Look the user up whether or not they are enabled, so a disabled user is refused (not re-created).
 let row=await env.DB.prepare("SELECT * FROM budget_users WHERE auth0_user_id=?").bind(user.sub).first();
 // Match by email only when the identity provider says the address is verified (Google always does).
 if(!row&&email&&user.email_verified===true)row=await env.DB.prepare("SELECT * FROM budget_users WHERE email=?").bind(email).first();
 if(row && row.auth0_user_id !== user.sub) await env.DB.prepare("UPDATE budget_users SET auth0_user_id=?,updated_at=datetime('now') WHERE uuid=?").bind(user.sub,row.uuid).run();

 const isAdmin=roles.includes("budget_admin");
 // Admins are governed by the Auth0 role (so nobody can lock themselves out); everyone else needs an enabled row.
 if(row&&!row.enabled&&!isAdmin)return {ok:false,response:json(request,env,{error:"บัญชีนี้ถูกปิดสิทธิ์ใช้งาน กรุณาติดต่อผู้ดูแล",code:"ACCESS_DISABLED"},403)};
 if(!row&&!isAdmin)return {ok:false,response:json(request,env,{error:"บัญชีนี้ไม่ได้รับสิทธิ์ใช้งาน Budget"},403)};
 if(!row&&isAdmin){
  const uuid=crypto.randomUUID();
  await env.DB.prepare("INSERT INTO budget_users (uuid,auth0_user_id,email,display_name,enabled) VALUES (?,?,?,?,1)").bind(uuid,user.sub,email,user.name||user.nickname||email).run();
  row=await env.DB.prepare("SELECT * FROM budget_users WHERE uuid=?").bind(uuid).first();
 }
 const access=await env.DB.prepare("SELECT account_uuid FROM budget_account_access WHERE user_uuid=?").bind(row.uuid).all();
 return {ok:true,user,row,roles,isAdmin,accessibleAccounts:(access.results||[]).map(x=>x.account_uuid)};
}

export function canAccessAccount(auth,uuid){return auth.isAdmin||auth.accessibleAccounts.includes(uuid);}
