// Camps lottery API checks (run with `npm test`).
import {makeEnv,installFetch} from './env.mjs';
const {lotto}=await import('../src/handlers/lotto.js');
installFetch();const {env}=makeEnv();let pass=0,fl=0;const ok=(c,m)=>{if(c)pass++;else{fl++;console.log('  FAIL:',m)}};
async function call(who,method,path,body){const url=new URL('https://api.x'+path);const h={Origin:'https://enged.sorasukt.com'};if(who)h.Authorization='Bearer '+who;if(body)h['Content-Type']='application/json';
 const r=await lotto(new Request(url,{method,headers:h,body:body?JSON.stringify(body):undefined}),env,url);return {s:r.status,d:await r.json().catch(()=>null)}}
let r=await call(null,'GET','/camps/lotto/admin/overview');ok(r.s===401,'anon 401');
r=await call('s1','GET','/camps/lotto/admin/overview');ok(r.s===403,'student cannot see admin overview');
r=await call('s1','GET','/camps/lotto/scanner/me');ok(r.s===403,'unassigned student cannot scan');
r=await call('admin','POST','/camps/lotto/admin/students',{studentId:'6740102220',name:'สมชาย ใจดี',drawNumber:'001'});ok(r.s===200&&r.d.created,'admin adds student');
r=await call('admin','POST','/camps/lotto/admin/students',{studentId:'6740102221',name:'x',drawNumber:'001'});ok(r.s===409,'duplicate draw number 409');
r=await call('admin','POST','/camps/lotto/admin/students/import',{students:[{studentId:'๖๘๔๐๑๐๐๐๐๑',name:'นางสาวสมหญิง',drawNumber:'002'},{studentId:'abc',name:'x',drawNumber:'3'}]});ok(r.d.imported===1&&r.d.errors.length===1,'bulk import Thai digits: '+JSON.stringify(r.d));
r=await call('admin','POST','/camps/lotto/admin/scanners',{email:'sb6740102220@lru.ac.th'});ok(r.s===200,'assign scanner by email (needs a valid email regex): '+r.s+' '+JSON.stringify(r.d));
r=await call('admin','POST','/camps/lotto/admin/scanners',{email:'not-an-email'});ok(r.s===400,'invalid email rejected');
r=await call('admin','GET','/camps/lotto/admin/scanners');ok(r.d.scanners.length===1,'scanner listed');
r=await call('s1','GET','/camps/lotto/scanner/me');ok(r.s===200&&r.d.isAdmin===false,'assigned scanner allowed (not admin)');
r=await call('s1','POST','/camps/lotto/admin/scan',{studentId:'6740102220'});ok(r.s===200&&r.d.ok,'scan checks in');
ok(r.d.picture==='https://lh3.googleusercontent.com/a/s1','scan returns the student Auth0 picture: '+r.d.picture);
r=await call('s1','POST','/camps/lotto/admin/scan',{studentId:'6740102220'});ok(r.s===409&&r.d.alreadyChecked&&r.d.picture,'second scan 409 already checked (still returns the picture)');
await call('admin','POST','/camps/lotto/admin/students',{studentId:'6840100005',name:'Never Signed In',drawNumber:'77'});
r=await call('admin','POST','/camps/lotto/admin/scan',{studentId:'6840100005'});ok(r.s===200&&r.d.picture===null,'student who never signed in: picture null, scan still works');
r=await call('s1','POST','/camps/lotto/admin/scan',{studentId:'9999999999'});ok(r.s===404,'unknown id 404');
r=await call('s1','GET','/camps/lotto/scanner/lookup?q=สมชาย');ok(r.d.students.length===1,'scanner lookup');
r=await call('s1','POST','/camps/lotto/admin/students',{studentId:'6740102229',name:'x',drawNumber:'9'});ok(r.s===403,'scanner cannot edit roster');
r=await call('admin','DELETE','/camps/lotto/admin/students/6740102220');ok(r.s===409,'cannot delete a checked-in student');
r=await call('admin','DELETE','/camps/lotto/admin/students/6840100001');ok(r.s===200,'delete unchecked');
r=await call('admin','DELETE','/camps/lotto/admin/scanners/sb6740102220%40lru.ac.th');ok(r.s===200,'remove scanner (route regex)');
r=await call('s1','GET','/camps/lotto/scanner/me');ok(r.s===403,'removed scanner blocked');
r=await call('admin','GET','/camps/lotto/admin/overview');ok(r.d.total===2&&r.d.checked===2,'overview counts');
// read-only QR verification
r=await call(null,'GET','/camps/lotto/scanner/verify?studentId=6740102220');ok(r.s===401,'verify: anonymous 401');
await call('admin','POST','/camps/lotto/admin/scanners',{email:'sb6740102221@lru.ac.th'});
r=await call('s2','GET','/camps/lotto/scanner/verify?studentId=6740102220');ok(r.s===200&&r.d.checked===true&&r.d.student.checked_by&&r.d.picture,'verify (assigned scanner): already checked, with who/when and photo');
await call('admin','POST','/camps/lotto/admin/students',{studentId:'6840300001',name:'Not Yet',drawNumber:'88'});
r=await call('s2','GET','/camps/lotto/scanner/verify?studentId=6840300001');ok(r.s===200&&r.d.checked===false&&r.d.student.draw_number==='88','verify: not checked yet');
r=await call('s2','GET','/camps/lotto/scanner/verify?studentId=6840300001');ok(r.d.checked===false,'verifying twice does not check the student in');
r=await call('admin','GET','/camps/lotto/admin/students?q=6840300001');ok(r.d.students[0].checked_at===null,'still unchecked in the roster (read-only)');
r=await call('s2','GET','/camps/lotto/scanner/verify?studentId=9999999999');ok(r.s===404,'verify: unknown id 404');
r=await call('s2','GET','/camps/lotto/scanner/verify?studentId=hello');ok(r.s===400,'verify: not a student QR 400');
r=await call('s3','GET','/camps/lotto/scanner/verify?studentId=6840300001');ok(r.s===403,'verify: unassigned account refused');
await call('admin','DELETE','/camps/lotto/admin/students/6840300001');await call('admin','DELETE','/camps/lotto/admin/scanners/sb6740102221%40lru.ac.th');
// gift: open once, only after check-in
await call('admin','POST','/camps/lotto/admin/scanners',{email:'sb6740102221@lru.ac.th'});
await call('admin','POST','/camps/lotto/admin/students',{studentId:'6840400001',name:'Gift Tester',drawNumber:'555'});
r=await call('s2','POST','/camps/lotto/scanner/gift/open',{studentId:'6840400001'});ok(r.s===409&&r.d.code==='NOT_CHECKED_IN'&&r.d.student.draw_number===null,'gift: not before check-in, and the draw number is not leaked');
r=await call('s3','POST','/camps/lotto/scanner/gift/open',{studentId:'6840400001'});ok(r.s===403,'gift: unassigned account refused');
r=await call('s2','POST','/camps/lotto/scanner/gift/open',{studentId:'9999999999'});ok(r.s===404,'gift: unknown id 404');
r=await call('s2','POST','/camps/lotto/admin/scan',{studentId:'6840400001'});ok(r.s===200&&r.d.student.gift_opened_at===null,'check-in; gift still closed');
r=await call('s2','POST','/camps/lotto/scanner/gift/open',{studentId:'6840400001'});ok(r.s===200&&r.d.firstTime===true&&r.d.student.gift_opened_by==='sb6740102221@lru.ac.th'&&r.d.student.draw_number==='555','gift opens for a checked-in student (first time, by whom)');
r=await call('s2','POST','/camps/lotto/scanner/gift/open',{studentId:'6840400001'});ok(r.s===200&&r.d.firstTime===false&&r.d.student.gift_opened_at,'second open is idempotent (firstTime false, keeps who/when)');
r=await call('s2','POST','/camps/lotto/admin/scan',{studentId:'6840400001'});ok(r.s===409&&r.d.student.gift_opened_at,'scan reports the gift as already opened');
r=await call('admin','GET','/camps/lotto/admin/overview');ok(r.d.gifts===1,'overview counts opened gifts: '+r.d.gifts);
r=await call('admin','GET','/camps/lotto/admin/students?q=6840400001');ok(r.d.students[0].gift_opened_at&&r.d.students[0].gift_opened_by,'roster rows carry the gift fields');
ok(env.DB&&true,'(db)');
{const logs=await env.DB.prepare("SELECT result FROM camp_lotto_scan_logs WHERE student_id='6840400001' ORDER BY id").all();ok(logs.results.map(x=>x.result).join()==='checked,gift_opened','scan log: checked, then gift_opened exactly once');}
await call('admin','DELETE','/camps/lotto/admin/scanners/sb6740102221%40lru.ac.th');
console.log(fl?fl+' FAILED':'all '+pass+' lotto checks passed');
process.exit(fl?1:0);
