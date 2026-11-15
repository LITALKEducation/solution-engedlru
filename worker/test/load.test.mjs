// 100 students open the page at the same moment (run with `npm test`).
// Counts calls to Auth0 (the real limit) and checks that the department quota is still exact.
import {makeEnv,installFetch,PEOPLE} from './env.mjs';
const {camps}=await import('../src/handlers/camps.js');
installFetch();const {db,env}=makeEnv();
let pass=0,failn=0;const ok=(c,m)=>{if(c){pass++}else{failn++;console.log('  FAIL:',m)}};
const calls={userinfo:0,roles:0,token:0};const real=globalThis.fetch;
globalThis.fetch=async(u,o)=>{u=String(u);if(u.includes('/userinfo'))calls.userinfo++;else if(u.includes('/roles'))calls.roles++;else if(u.includes('/oauth/token'))calls.token++;return real(u,o)};
async function call(who,method,path,body){const url=new URL('https://api.x'+path);const h={Origin:'https://enged.sorasukt.com',Authorization:'Bearer '+who};if(body)h['Content-Type']='application/json';
 const r=await camps(new Request(url,{method,headers:h,body:body?JSON.stringify(body):undefined}),env,url);return {s:r.status,d:await r.json().catch(()=>null)}}
const N=100,ids=Array.from({length:N},(_,i)=>String(6740200000+i));
ids.forEach((id,i)=>{PEOPLE['L'+i]={sub:'google-oauth2|L'+i,email:`sb${id}@lru.ac.th`,email_verified:true,name:'Load '+i,roles:[]}});
await call('admin','POST','/camps/admin/students/bulk',{text:ids.map((id,i)=>`${id},Load ${i},2,${i%2?'F':'M'}`).join('\n')});
await call('admin','POST','/camps/admin/quota',{departmentCode:'teaching',quotas:{M:{1:0,2:20,3:0,4:0},F:{1:0,2:20,3:0,4:0}}});
await call('admin','POST','/camps/admin/state',{registration:'open'});
Object.keys(calls).forEach(k=>calls[k]=0);   // count only what the 100 students do
console.log('100 students: me + departments + select at once');
const res=await Promise.all(ids.map(async(_,i)=>{const t='L'+i;const [m,d]=await Promise.all([call(t,'GET','/camps/me'),call(t,'GET','/camps/departments')]);const s=await call(t,'POST','/camps/select',{departmentCode:'teaching'});return {m,d,s}}));
ok(res.every(x=>x.m.s===200&&x.d.s===200),'every student gets me + departments');
ok(res.every(x=>x.m.d.adminDeferred===true&&x.m.d.isAdmin===false),'students skip the role lookup');
ok(calls.roles===0&&calls.token===0,'no Auth0 Management API calls for students (roles '+calls.roles+', token '+calls.token+')');
ok(calls.userinfo<=N,'at most one /userinfo per student: '+calls.userinfo);
const won=res.filter(x=>x.s.s===200).length,full=res.filter(x=>x.s.s===409).length;
ok(won===40&&full===60,'exactly 40 places filled, 60 told it is full: '+won+'/'+full);
ok(db.prepare("SELECT COUNT(*) c FROM camp_selections").get().c===40,'40 rows saved');
const a=await call('L0','GET','/camps/me?admin=1');ok(a.s===200&&a.d.isAdmin===false,'?admin=1 does the role lookup, student stays a student');
const ad=await call('admin','GET','/camps/me');ok(ad.d.isAdmin===true,'staff (non-student email) still sees admin at once');
console.log(failn?`${failn} FAILED`:`all ${pass} load checks passed`);process.exit(failn?1:0);
