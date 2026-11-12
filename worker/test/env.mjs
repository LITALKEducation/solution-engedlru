// Test helpers: in-memory D1 (node:sqlite) with every migration applied, an R2 stub and a fake Auth0.
import {DatabaseSync} from 'node:sqlite';import fs from 'node:fs';
// every migration, in the same (alphabetical) order wrangler applies them
const MIGRATIONS = new URL('../migrations/', import.meta.url);
export const MIG=fs.readdirSync(MIGRATIONS).filter((f)=>f.endsWith('.sql')&&!/^0001/.test(f)).sort().map((f)=>f.replace(/\.sql$/,''));
export function makeEnv(){
 const db=new DatabaseSync(':memory:');for(const f of MIG)db.exec(fs.readFileSync(new URL(f+'.sql',MIGRATIONS),'utf8'));
 const stmt=(sql,params=[])=>({bind:(...p)=>stmt(sql,p),all:async()=>({results:db.prepare(sql).all(...params)}),first:async()=>db.prepare(sql).get(...params)??null,run:async()=>{const r=db.prepare(sql).run(...params);return {success:true,meta:{changes:Number(r.changes)}}},_run:()=>db.prepare(sql).run(...params)});
 const DB={prepare:sql=>stmt(sql),batch:async ss=>{db.exec('BEGIN');try{for(const s of ss)s._run();db.exec('COMMIT')}catch(e){db.exec('ROLLBACK');throw e}}};
 return {db,env:{DB,FILES:(()=>{const m=new Map();return{put:async(k,v)=>m.set(k,v),get:async k=>m.has(k)?{body:m.get(k)}:null,delete:async k=>m.delete(k),_m:m}})(),ALLOWED_ORIGINS:'https://enged.sorasukt.com',AUTH0_DOMAIN:'a.example',AUTH0_MANAGEMENT_API_DOMAIN:'t.example',AUTH0_MANAGEMENT_API_AUDIENCE:'aud',AUTH0_M2M_CLIENT_ID:'i',AUTH0_M2M_CLIENT_SECRET:'s'}};
}
export const PEOPLE={
 admin:{sub:'google-oauth2|admin',email:'info@sorasukt.com',email_verified:true,name:'Admin',roles:['camp_admin']},
 budgetadmin:{sub:'google-oauth2|ba',email:'ba@gmail.com',email_verified:true,name:'BA',roles:['budget_admin']},
 s1:{sub:'google-oauth2|s1',email:'sb6740102220@lru.ac.th',email_verified:true,name:'Student One',roles:[]},
 s2:{sub:'google-oauth2|s2',email:'sb6740102221@lru.ac.th',email_verified:true,name:'Student Two',roles:[]},
 s3:{sub:'google-oauth2|s3',email:'sb6740102222@lru.ac.th',email_verified:true,name:'Student Three',roles:[]},
 y1:{sub:'google-oauth2|y1',email:'sb6840100001@lru.ac.th',email_verified:true,name:'Fresher',roles:[]},
 gmail:{sub:'google-oauth2|g',email:'someone@gmail.com',email_verified:true,name:'G',roles:[]},
 unverified:{sub:'google-oauth2|u',email:'sb6740109999@lru.ac.th',email_verified:false,name:'U',roles:[]},
 other:{sub:'google-oauth2|o',email:'sb6740100000@lru.ac.th',email_verified:true,name:'Not in roster',roles:[]}
};
export function installFetch(){
 globalThis.fetch=async(u,o)=>{u=String(u);const j=x=>new Response(JSON.stringify(x),{headers:{'content-type':'application/json'}});
  if(u.includes('/userinfo')){const t=(o.headers.Authorization||'').replace('Bearer ','');const p=PEOPLE[t];return p?j({sub:p.sub,email:p.email,email_verified:p.email_verified,name:p.name}):new Response('{}',{status:401})}
  if(u.includes('/users-by-email')){const em=decodeURIComponent(new URL(u).searchParams.get('email')||'');const p=Object.values(PEOPLE).find(x=>x.email===em);return j(p?[{picture:'https://lh3.googleusercontent.com/a/'+p.sub.split('|')[1]}]:[])}
  if(u.includes('/oauth/token'))return j({access_token:'m',expires_in:86400});
  if(u.includes('/roles')){const sub=decodeURIComponent(u.split('/users/')[1].split('/roles')[0]);const p=Object.values(PEOPLE).find(x=>x.sub===sub);return j((p?.roles||[]).map(name=>({name})))}
  return new Response('no',{status:404})};
}
