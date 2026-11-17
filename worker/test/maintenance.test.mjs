// Maintenance mode ("ปิดปรับปรุงระบบ") checks, all through the Worker router (src/index.js) (run with `npm test`).
import {makeEnv,installFetch} from './env.mjs';
installFetch();const {db,env}=makeEnv();
const worker=(await import('../src/index.js')).default;
let pass=0,failn=0;const ok=(c,msg)=>{if(c){pass++}else{failn++;console.log('  FAIL:',msg)}};
async function call(who,method,path,body){const h={Origin:'https://enged.sorasukt.com'};if(who)h.Authorization='Bearer '+who;if(body)h['Content-Type']='application/json';
 const r=await worker.fetch(new Request('https://api.x'+path,{method,headers:h,body:body?JSON.stringify(body):undefined}),env,{waitUntil(){}});let d=null;try{d=await r.clone().json()}catch(e){}return {s:r.status,d,r}}
const H=3600e3,now=Date.now();
const set=(o)=>call('admin','POST','/camps/maintenance/admin/settings',{enabled:true,scope:['hr','lotto','qrcheck'],message:'ปิดปรับปรุง',...o});
const blocked=(r)=>r.s===503&&r.d&&r.d.code==='MAINTENANCE';
console.log('1. off by default');
let r=await call(null,'GET','/camps/maintenance');ok(r.s===200&&r.d.state==='off'&&Object.keys(r.d).sort().join()==='now,state'&&/max-age=15/.test(r.r.headers.get('cache-control')||''),'status is just { state: off, now } and cacheable');
r=await call('s1','POST','/camps/select',{departmentCode:'teaching'});ok(!blocked(r),'nothing is blocked while off');
console.log('2. admin-only settings + validation');
for(const who of ['s1','gmail']){r=await call(who,'POST','/camps/maintenance/admin/settings',{enabled:true,scope:['hr']});ok(r.s===403,'students refused: '+who)}
r=await call(null,'POST','/camps/maintenance/admin/settings',{});ok(r.s===401,'anonymous refused');
r=await call('s1','GET','/camps/maintenance/admin/settings');ok(r.s===403,'students cannot read the admin settings');r=await call(null,'GET','/camps/maintenance/admin/settings');ok(r.s===401,'anonymous cannot read the admin settings');
r=await set({scope:[]});ok(r.s===400,'switching on needs at least one system');
r=await set({scope:['hr','budget']});ok(r.s===400,'unknown system refused');
r=await set({from:now+2*H,until:now+H});ok(r.s===400,'end must be after start');
r=await set({from:'abc'});ok(r.s===400,'junk date refused');r=await set({from:5});ok(r.s===400,'implausible date refused');
r=await set({message:'x'.repeat(501)});ok(r.s===400,'message length limit');
r=await call('admin','POST','/camps/maintenance/admin/settings',{enabled:false,scope:[]});ok(r.s===200&&r.d.state==='off','switching off needs no system');
console.log('3. active: writes refused, the rest passes');
r=await set({message:'ปิดปรับปรุง <b>ถึงเที่ยง</b>',until:now+H});ok(r.s===200&&r.d.state==='active','switched on until +1 h');
r=await call(null,'GET','/camps/maintenance');ok(r.d.state==='active'&&r.d.message.includes('<b>')&&r.d.scope.join()==='hr,lotto,qrcheck'&&r.d.until===now+H&&!('enabled' in r.d),'public status: state, message, window, scope');
for(const [who,m,p] of [['s1','POST','/camps/select'],['s1','POST','/camps/unselect'],['s1','POST','/camps/me/profile'],['s1','POST','/camps/aka/save'],['s1','POST','/camps/shirt/vote'],['s1','POST','/camps/shirt/design'],['s1','POST','/camps/survey/save'],['s1','POST','/camps/lotto/scanner/gift/open'],['s1','POST','/camps/qrcheck/scan'],['s1','POST','/camps/qrcheck/record'],[null,'POST','/camps/select']]){
  r=await call(who,m,p,{});ok(blocked(r),'blocked: '+m+' '+p+(who?'':' (anonymous too)'));}
r=await call('s1','POST','/camps/select',{});ok(r.r.headers.get('access-control-allow-origin')==='https://enged.sorasukt.com'&&/^\d+$/.test(r.r.headers.get('retry-after')||'')&&r.d.error.includes('<b>'),'the refusal has CORS (so the page can show the message), Retry-After and the admin text');
r=await call('s1','GET','/camps/me');ok(r.s===200,'reads still work');
r=await call(null,'GET','/camps/shirt/gallery');ok(r.s===200,'public gallery still readable');r=await call(null,'GET','/camps/status');ok(r.s===200,'registration status still readable');
r=await call('s1','POST','/auth/refresh',{refresh_token:'x'});ok(!blocked(r),'/auth/* is never blocked');
for(const [m,p,b] of [['POST','/camps/admin/state',{registration:'open'}],['POST','/camps/aka/admin/state',{state:'open'}],['POST','/camps/shirt/admin/settings',{resultsPublic:false}],['POST','/camps/maintenance/admin/settings',{enabled:true,scope:['hr','lotto','qrcheck'],message:'ปิดปรับปรุง',until:now+H}]]){r=await call('admin',m,p,b);ok(!blocked(r)&&r.s===200,'admin route passes: '+p);}
r=await call('admin','POST','/camps/lotto/admin/students',{});ok(!blocked(r),'lotto admin route is not blocked');r=await call('admin','POST','/camps/qrcheck/admin/checks',{});ok(!blocked(r),'qrcheck admin route is not blocked');
r=await call('s1','POST','/camps/lotto/admin/scanners',{});ok(!blocked(r)&&r.s===403,'an admin path is never blocked by maintenance (a student just gets the normal 403)');
r=await call('s1','POST','/campsfoo/select',{});ok(!blocked(r),'only /camps/* is gated');
console.log('4. scopes are independent');
await set({scope:['lotto'],until:now+H});
r=await call('s1','POST','/camps/select',{});ok(!blocked(r),'lotto only: HR writes pass');r=await call('s1','POST','/camps/lotto/scanner/gift/open',{});ok(blocked(r),'lotto only: lotto is blocked');r=await call('s1','POST','/camps/qrcheck/scan',{});ok(!blocked(r),'lotto only: qrcheck passes');
await set({scope:['hr'],until:now+H});
r=await call('s1','POST','/camps/select',{});ok(blocked(r),'hr only: HR blocked');r=await call('s1','POST','/camps/lotto/scanner/gift/open',{});ok(!blocked(r),'hr only: lotto passes');
r=await call(null,'GET','/camps/maintenance');ok(r.d.scope.join()==='hr','status reports the chosen scope');
console.log('5. schedule: upcoming / ended');
await set({from:now+H,until:now+2*H});
r=await call(null,'GET','/camps/maintenance');ok(r.d.state==='upcoming'&&r.d.from===now+H,'before the start: upcoming (a notice, no block)');
r=await call('s1','POST','/camps/select',{});ok(!blocked(r),'upcoming does not block');
await set({from:now-2*H,until:now-H});
r=await call(null,'GET','/camps/maintenance');ok(r.d.state==='off','after the end: off');r=await call('s1','POST','/camps/select',{});ok(!blocked(r),'ended does not block');
await set({from:now-H,until:null});
r=await call(null,'GET','/camps/maintenance');ok(r.d.state==='active'&&r.d.until===null,'no end time: stays active until switched off');
r=await call('s1','POST','/camps/select',{});ok(blocked(r)&&!r.r.headers.get('retry-after'),'blocked, no Retry-After without an end time');
// the window is judged on every request, not frozen in the cache
db.exec("UPDATE camp_settings SET value='"+(Date.now()-1)+"' WHERE key='maint_until'");
await new Promise(x=>setTimeout(x,5));
r=await call('s1','POST','/camps/select',{});ok(blocked(r),'(a direct DB edit stays hidden behind the 10 s cache)');
console.log('6. switching off + failing open');
r=await call('admin','POST','/camps/maintenance/admin/settings',{enabled:false,scope:['hr']});ok(r.s===200,'admin switches maintenance off');
r=await call('s1','POST','/camps/select',{});ok(!blocked(r),'the next request is not blocked (cache invalidated by the save)');
r=await call('admin','GET','/camps/maintenance/admin/settings');ok(r.s===200&&r.d.enabled===false&&r.d.systems.join()==='hr,lotto,qrcheck'&&r.d.defaultMessage,'admin settings readable (systems, default message)');
await set({scope:['hr','lotto','qrcheck']});
const real=env.DB.prepare;env.DB.prepare=()=>{throw new Error('db down')};
const { invalidateMaintenance }=await import('../src/handlers/maintenance.js');invalidateMaintenance();
r=await worker.fetch(new Request('https://api.x/camps/select',{method:'POST',headers:{Origin:'https://enged.sorasukt.com'}}),env,{waitUntil(){}});
ok(!(r.status===503&&(await r.clone().json().catch(()=>({}))).code==='MAINTENANCE'),'fails open when the settings cannot be read');
env.DB.prepare=real;invalidateMaintenance();
console.log(failn?`maintenance: ${pass} passed, ${failn} FAILED`:`maintenance: ${pass} passed, 0 failed`);process.exit(failn?1:0);
