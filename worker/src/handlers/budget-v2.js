import { json } from "../lib/cors.js";
import { requireBudgetAuth, canAccessAccount } from "../lib/budget-auth.js";
import { decodeDataUrl, putFile } from "../lib/files.js";

const MAX_FILE = 10 * 1024 * 1024;
const ALLOWED_MIME = new Set(["image/jpeg","image/png","image/webp","application/pdf"]);

function fail(request, env, message, status=400) { return json(request, env, {error:message}, status); }
function clean(s, max=4000) { return String(s ?? "").trim().slice(0,max); }
function amount(n) { const x=Number(n); return Number.isFinite(x) && x>0 ? Math.round(x*100)/100 : null; }

async function audit(env, auth, action, entityType, entityUuid, metadata={}) {
  await env.DB.prepare(
    "INSERT INTO budget_audit_logs (uuid, actor_auth0_id, actor_email, action, entity_type, entity_uuid, metadata) VALUES (?, ?, ?, ?, ?, ?, ?)"
  ).bind(crypto.randomUUID(), auth.user.sub, auth.user.email || auth.row.email, action, entityType, entityUuid || null, JSON.stringify(metadata)).run();
}

function txId() {
  const d = new Date();
  const date = d.toISOString().slice(0,10).replaceAll("-","");
  return `TRX-${date}-${crypto.randomUUID().replaceAll("-","").slice(0,8).toUpperCase()}`;
}

async function dashboard(request, env, auth) {
  const accounts = await env.DB.prepare(`
    SELECT a.uuid, a.name, a.description, a.currency,
      COALESCE(SUM(CASE WHEN t.type='income' AND t.status='completed' THEN t.amount WHEN t.type='expense' AND t.status='completed' THEN -t.amount ELSE 0 END),0) balance,
      COALESCE(SUM(CASE WHEN t.type='income' AND t.status='completed' THEN t.amount ELSE 0 END),0) income,
      COALESCE(SUM(CASE WHEN t.type='expense' AND t.status='completed' THEN t.amount ELSE 0 END),0) expense
    FROM budget_accounts a
    LEFT JOIN budget_transactions t ON t.account_uuid=a.uuid
    WHERE a.active=1
    GROUP BY a.uuid ORDER BY a.name
  `).all();
  const recentSql = auth.isAdmin
    ? `SELECT t.uuid,t.transaction_id,t.account_uuid,a.name account_name,t.type,c.name category,t.amount,t.details,t.created_by_email,t.created_at,t.status FROM budget_transactions t JOIN budget_accounts a ON a.uuid=t.account_uuid JOIN budget_categories c ON c.uuid=t.category_uuid ORDER BY t.created_at DESC LIMIT 5`
    : `SELECT t.uuid,t.transaction_id,t.account_uuid,a.name account_name,t.type,c.name category,t.amount,t.details,t.created_by_email,t.created_at,t.status FROM budget_transactions t JOIN budget_accounts a ON a.uuid=t.account_uuid JOIN budget_categories c ON c.uuid=t.category_uuid WHERE t.account_uuid IN (SELECT account_uuid FROM budget_account_access WHERE user_uuid=?) ORDER BY t.created_at DESC LIMIT 5`;
  const recent = auth.isAdmin ? await env.DB.prepare(recentSql).all() : await env.DB.prepare(recentSql).bind(auth.row.uuid).all();
  const all = (accounts.results || []).filter(x => auth.isAdmin || auth.accessibleAccounts.includes(x.uuid));
  return json(request, env, {
    accounts: all, recent: recent.results || [],
    totals: { income: all.reduce((s,x)=>s+Number(x.income||0),0), expense: all.reduce((s,x)=>s+Number(x.expense||0),0), balance: all.reduce((s,x)=>s+Number(x.balance||0),0) },
    user:{email:auth.user.email,name:auth.user.name,roles:auth.roles,isAdmin:auth.isAdmin}
  });
}

async function listTransactions(request, env, auth, url) {
  const page=Math.max(1,Number(url.searchParams.get("page")||1));
  const limit=Math.min(100,Math.max(10,Number(url.searchParams.get("limit")||25)));
  const account=url.searchParams.get("account");
  const type=url.searchParams.get("type");
  const from=url.searchParams.get("from");
  const to=url.searchParams.get("to");
  const params=[]; let where=["1=1"];
  if(account){where.push("t.account_uuid=?");params.push(account);}
  if(type){where.push("t.type=?");params.push(type);}
  if(from){where.push("date(t.created_at)>=date(?)");params.push(from);}
  if(to){where.push("date(t.created_at)<=date(?)");params.push(to);}
  const allowed=auth.isAdmin ? "" : " AND t.account_uuid IN (SELECT account_uuid FROM budget_account_access WHERE user_uuid=?)";
  if(!auth.isAdmin) params.push(auth.row.uuid);
  const sql=`SELECT t.uuid,t.transaction_id,t.account_uuid,a.name account_name,t.type,c.name category,t.amount,t.details,t.note,t.created_by_email,t.created_at,t.status,t.reversal_of_uuid,
    (SELECT f.uuid FROM budget_transaction_files f WHERE f.transaction_uuid=t.uuid LIMIT 1) evidence_uuid
    FROM budget_transactions t JOIN budget_accounts a ON a.uuid=t.account_uuid JOIN budget_categories c ON c.uuid=t.category_uuid
    WHERE ${where.join(" AND ")} ${allowed} ORDER BY t.created_at DESC LIMIT ? OFFSET ?`;
  params.push(limit,(page-1)*limit);
  const result=await env.DB.prepare(sql).bind(...params).all();
  return json(request,env,{transactions:result.results||[],page,limit});
}

async function createTransaction(request, env, auth) {
  const body=await request.json().catch(()=>null);
  if(!body)return fail(request,env,"Invalid JSON");
  const accountUuid=clean(body.accountUuid,100), categoryUuid=clean(body.categoryUuid,100), type=clean(body.type,20);
  const details=clean(body.details,4000), note=clean(body.note,1000);
  const value=amount(body.amount);
  if(!accountUuid||!categoryUuid||!["income","expense"].includes(type)||!details||!value)return fail(request,env,"กรุณากรอกข้อมูลรายการให้ครบ");
  if(!canAccessAccount(auth,accountUuid))return fail(request,env,"ไม่มีสิทธิ์เข้าถึงบัญชีนี้",403);
  const account=await env.DB.prepare("SELECT * FROM budget_accounts WHERE uuid=? AND active=1").bind(accountUuid).first();
  const category=await env.DB.prepare("SELECT * FROM budget_categories WHERE uuid=? AND active=1 AND (type=? OR type='both')").bind(categoryUuid,type).first();
  if(!account||!category)return fail(request,env,"บัญชีหรือหมวดหมู่ไม่ถูกต้อง",400);
  if(!body.fileBase64||!body.fileName||!body.fileMimeType)return fail(request,env,"หลักฐานการชำระเงินเป็นข้อมูลบังคับ",400);
  if(!ALLOWED_MIME.has(body.fileMimeType))return fail(request,env,"รองรับเฉพาะ JPG, PNG, WebP และ PDF",400);
  const {bytes,mime}=decodeDataUrl(body.fileBase64,body.fileMimeType);
  if(bytes.byteLength>MAX_FILE)return fail(request,env,"ไฟล์ต้องไม่เกิน 10 MB",400);

  const uuid=crypto.randomUUID(), id=txId(), key=`budget/evidence/${uuid}/${crypto.randomUUID()}-${String(body.fileName).replace(/[^a-zA-Z0-9._-]/g,"_")}`;
  const now=new Date().toISOString();
  await putFile(env,key,bytes,mime);
  try {
    const fileUuid=crypto.randomUUID();
    await env.DB.batch([
      env.DB.prepare("INSERT INTO budget_transactions (uuid,transaction_id,account_uuid,type,category_uuid,amount,details,note,created_by_auth0_id,created_by_email,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)")
        .bind(uuid,id,accountUuid,type,categoryUuid,value,details,note,auth.user.sub,auth.user.email||auth.row.email,now),
      env.DB.prepare("INSERT INTO budget_transaction_files (uuid,transaction_uuid,r2_key,file_name,mime_type,file_size,uploaded_by_auth0_id) VALUES (?,?,?,?,?,?,?)")
        .bind(fileUuid,uuid,key,clean(body.fileName,255),mime,bytes.byteLength,auth.user.sub),
      env.DB.prepare("INSERT INTO budget_audit_logs (uuid,actor_auth0_id,actor_email,action,entity_type,entity_uuid,metadata) VALUES (?,?,?,?,?,?,?)")
        .bind(crypto.randomUUID(),auth.user.sub,auth.user.email||auth.row.email,"TRANSACTION_CREATED","transaction",uuid,JSON.stringify({transaction_id:id,account_uuid:accountUuid,type,amount:value})),
      env.DB.prepare("INSERT INTO budget_audit_logs (uuid,actor_auth0_id,actor_email,action,entity_type,entity_uuid,metadata) VALUES (?,?,?,?,?,?,?)")
        .bind(crypto.randomUUID(),auth.user.sub,auth.user.email||auth.row.email,"FILE_UPLOADED","transaction",uuid,JSON.stringify({file_name:body.fileName}))
    ]);
  } catch (e) {
    await env.FILES.delete(key).catch(()=>{});
    throw e;
  }
  return json(request,env,{ok:true,transaction:{uuid,transactionId:id,accountUuid,type,category:category.name,amount:value,details,note,createdAt:now},verificationUrl:`https://solution.litalkeducation.com/budget/verify/${id}`},201);
}

async function meta(request,env,auth) {
  const [accounts,categories]=await Promise.all([
    env.DB.prepare("SELECT uuid,name,description,currency FROM budget_accounts WHERE active=1 ORDER BY name").all(),
    env.DB.prepare("SELECT uuid,name,type FROM budget_categories WHERE active=1 ORDER BY name").all()
  ]);
  const visibleAccounts=(accounts.results||[]).filter(x=>auth.isAdmin||auth.accessibleAccounts.includes(x.uuid));
  return json(request,env,{accounts:visibleAccounts,categories:categories.results||[],isAdmin:auth.isAdmin,roles:auth.roles});
}

async function verify(request,env,url) {
  const id=decodeURIComponent(url.pathname.split("/").pop());
  const t=await env.DB.prepare("SELECT t.transaction_id,t.type,t.amount,t.created_at,t.status,a.name account_name,c.name category FROM budget_transactions t JOIN budget_accounts a ON a.uuid=t.account_uuid JOIN budget_categories c ON c.uuid=t.category_uuid WHERE t.transaction_id=?").bind(id).first();
  if(!t)return json(request,env,{valid:false,message:"ไม่พบรายการธุรกรรม"},404);
  return json(request,env,{valid:t.status==="completed",transaction:{transactionId:t.transaction_id,account:t.account_name,type:t.type,category:t.category,amount:t.amount,createdAt:t.created_at,status:t.status}});
}

async function getEvidence(request,env,auth,uuid) {
  const row=await env.DB.prepare("SELECT f.r2_key,f.file_name,f.mime_type FROM budget_transaction_files f JOIN budget_transactions t ON t.uuid=f.transaction_uuid WHERE t.uuid=?").bind(uuid).first();
  if(!row)return fail(request,env,"ไม่พบหลักฐาน",404);
  if(!canAccessAccount(auth,(await env.DB.prepare("SELECT account_uuid FROM budget_transactions WHERE uuid=?").bind(uuid).first())?.account_uuid))return fail(request,env,"Forbidden",403);
  const obj=await env.FILES.get(row.r2_key); if(!obj)return fail(request,env,"ไม่พบไฟล์",404);
  return new Response(obj.body,{headers:{"Content-Type":row.mime_type,"Content-Disposition":`inline; filename="${row.file_name.replace(/["\\\r\n]/g, "_")}"`,"Cache-Control":"private, no-store"}});
}


async function adminOnly(request,env,auth){if(!auth.isAdmin)return fail(request,env,"ต้องใช้สิทธิ์ budget_admin",403);}

async function adminAccounts(request,env,auth){
 await adminOnly(request,env,auth);
 if(request.method==="GET"){const x=await env.DB.prepare("SELECT uuid,name,description,currency,active,created_at,updated_at FROM budget_accounts ORDER BY name").all();return json(request,env,{accounts:x.results||[]});}
 const b=await request.json().catch(()=>null); if(!b?.name)return fail(request,env,"กรุณาระบุชื่อบัญชี");
 const uuid=crypto.randomUUID();
 try{await env.DB.prepare("INSERT INTO budget_accounts (uuid,name,description,currency) VALUES (?,?,?,?)").bind(uuid,clean(b.name,120),clean(b.description,500),clean(b.currency||"THB",3)).run();await audit(env,auth,"ACCOUNT_CREATED","account",uuid,{name:b.name});return json(request,env,{ok:true,uuid},201);}catch(e){return fail(request,env,"ไม่สามารถสร้างบัญชีได้: "+e.message,400);}
}

async function adminCategories(request,env,auth){
 await adminOnly(request,env,auth);
 if(request.method==="GET"){const x=await env.DB.prepare("SELECT uuid,name,type,active FROM budget_categories ORDER BY name").all();return json(request,env,{categories:x.results||[]});}
 const b=await request.json().catch(()=>null); if(!b?.name||!["income","expense","both"].includes(b.type))return fail(request,env,"ข้อมูลหมวดหมู่ไม่ถูกต้อง");
 const uuid=crypto.randomUUID();
 try{await env.DB.prepare("INSERT INTO budget_categories (uuid,name,type) VALUES (?,?,?)").bind(uuid,clean(b.name,120),b.type).run();await audit(env,auth,"CATEGORY_CREATED","category",uuid,{name:b.name,type:b.type});return json(request,env,{ok:true,uuid},201);}catch(e){return fail(request,env,"ไม่สามารถสร้างหมวดหมู่ได้: "+e.message,400);}
}

async function adminUsers(request,env,auth){
 await adminOnly(request,env,auth);
 if(request.method==="GET"){const x=await env.DB.prepare("SELECT uuid,auth0_user_id,email,student_id,display_name,enabled FROM budget_users ORDER BY email").all();return json(request,env,{users:x.results||[]});}
 const b=await request.json().catch(()=>null); if(!b?.email)return fail(request,env,"กรุณาระบุอีเมล");
 const email=String(b.email).trim().toLowerCase();
 const existing=await env.DB.prepare("SELECT uuid FROM budget_users WHERE email=?").bind(email).first();
 if(existing)return fail(request,env,"อีเมลนี้มีอยู่แล้ว");
 const uuid=crypto.randomUUID();
 await env.DB.prepare("INSERT INTO budget_users (uuid,auth0_user_id,email,student_id,display_name,enabled) VALUES (?,?,?,?,?,?)").bind(uuid,b.auth0UserId||"pending:"+uuid,email,clean(b.studentId,50),clean(b.displayName,200),b.enabled===false?0:1).run();
 if(Array.isArray(b.accountUuids))for(const a of b.accountUuids){await env.DB.prepare("INSERT OR IGNORE INTO budget_account_access (user_uuid,account_uuid) VALUES (?,?)").bind(uuid,a).run();}
 await audit(env,auth,"USER_ENABLED","user",uuid,{email,student_id:b.studentId||null});
 return json(request,env,{ok:true,uuid},201);
}

async function report(request,env,auth,url){
 const from=url.searchParams.get("from"),to=url.searchParams.get("to");
 const p=[];const w=["1=1"];if(from){w.push("date(t.created_at)>=date(?)");p.push(from);}if(to){w.push("date(t.created_at)<=date(?)");p.push(to);}if(!auth.isAdmin){w.push("t.account_uuid IN (SELECT account_uuid FROM budget_account_access WHERE user_uuid=?)");p.push(auth.row.uuid);}
 const x=await env.DB.prepare(`SELECT t.transaction_id,t.uuid transaction_uuid,t.account_uuid,a.name account_name,t.created_at,t.type,c.name category,t.amount,t.details,t.note,t.created_by_email,t.status,t.reversal_of_uuid FROM budget_transactions t JOIN budget_accounts a ON a.uuid=t.account_uuid JOIN budget_categories c ON c.uuid=t.category_uuid WHERE ${w.join(" AND ")} ORDER BY t.created_at DESC LIMIT 5000`).bind(...p).all();
 await audit(env,auth,"REPORT_EXPORTED","report",null,{count:(x.results||[]).length,from,to});
 return json(request,env,{transactions:x.results||[]});
}

export async function budgetV2(request,env,url){
  if(request.method==="GET" && url.pathname.match(/^\/budget\/verify\/[^/]+$/)) return verify(request,env,url);
  const auth=await requireBudgetAuth(request,env); if(!auth.ok)return auth.response;
  if(request.method==="GET" && url.pathname==="/budget/me") return json(request,env,{email:auth.user.email,name:auth.user.name,roles:auth.roles,isAdmin:auth.isAdmin});
  if(request.method==="GET" && url.pathname==="/budget/meta") return meta(request,env,auth);
  if(request.method==="GET" && url.pathname==="/budget/dashboard") return dashboard(request,env,auth);
  if(request.method==="GET" && url.pathname==="/budget/transactions") return listTransactions(request,env,auth,url);
  if(url.pathname==="/budget/report" && request.method==="GET") return report(request,env,auth,url);
  if(url.pathname==="/budget/admin/accounts" && (request.method==="GET"||request.method==="POST")) return adminAccounts(request,env,auth);
  if(url.pathname==="/budget/admin/categories" && (request.method==="GET"||request.method==="POST")) return adminCategories(request,env,auth);
  if(url.pathname==="/budget/admin/users" && (request.method==="GET"||request.method==="POST")) return adminUsers(request,env,auth);
  const ev=url.pathname.match(/^\/budget\/transactions\/([^/]+)\/evidence$/); if(ev&&request.method==="GET")return getEvidence(request,env,auth,ev[1]);
  if(request.method==="POST" && url.pathname==="/budget/transactions") return createTransaction(request,env,auth);
  return json(request,env,{error:"Not Found"},404);
}
