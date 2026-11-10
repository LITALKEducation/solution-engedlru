import { getAuth0UserFromRequest, getAuth0Roles } from "./auth0.js";
import { json } from "./cors.js";
export async function requireBudgetAuth(request,env){
 const auth=await getAuth0UserFromRequest(request,env); if(!auth.user)return {ok:false,response:auth.response};
 const user=auth.user,roles=await getAuth0Roles(env,user.sub),email=(user.email||"").toLowerCase();
 let row=await env.DB.prepare("SELECT * FROM budget_users WHERE auth0_user_id=? AND enabled=1").bind(user.sub).first();
 if(!row&&email)row=await env.DB.prepare("SELECT * FROM budget_users WHERE email=? AND enabled=1").bind(email).first();
 const isAdmin=roles.includes("budget_admin");
 if(!row&&!isAdmin)return {ok:false,response:json(request,env,{error:"บัญชีนี้ไม่ได้รับสิทธิ์ใช้งาน Budget"},403)};
 if(!row&&isAdmin){const uuid=crypto.randomUUID();await env.DB.prepare("INSERT INTO budget_users (uuid,auth0_user_id,email,display_name,enabled) VALUES (?,?,?,?,1)").bind(uuid,user.sub,email,user.name||user.nickname||email).run();row=await env.DB.prepare("SELECT * FROM budget_users WHERE uuid=?").bind(uuid).first();}
 const access=await env.DB.prepare("SELECT account_uuid FROM budget_account_access WHERE user_uuid=?").bind(row.uuid).all();
 return {ok:true,user,row,roles,isAdmin,accessibleAccounts:(access.results||[]).map(x=>x.account_uuid)};
}
export function canAccessAccount(auth,uuid){return auth.isAdmin||auth.accessibleAccounts.includes(uuid);}
