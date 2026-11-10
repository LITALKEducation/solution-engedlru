// Safety net: shown if the app takes too long to start (stale cache, blocked CDN, hung login).
(function(){const g=id=>document.getElementById(id);
 window.__startErr='';addEventListener('error',e=>{window.__startErr=e.message||''});addEventListener('unhandledrejection',e=>{window.__startErr=(e.reason&&e.reason.message)||String(e.reason||'')});
 setTimeout(()=>{const l=g('loading');if(l&&!l.classList.contains('hidden')){g('slowBox').classList.remove('hidden');g('slowMsg').textContent=window.__startErr?' ('+window.__startErr+')':''}},8000)})();
async function resetApp(){try{const r=await navigator.serviceWorker.getRegistrations();await Promise.all(r.map(x=>x.unregister()));const k=await caches.keys();await Promise.all(k.map(x=>caches.delete(x)))}catch(e){}location.href=location.pathname}
const withTimeout=(p,ms,msg)=>Promise.race([p,new Promise((_,no)=>setTimeout(()=>no(new Error(msg)),ms))]);
const API=window.BUDGET_API||'https://engedlru-api.stnetworld.workers.dev',AUTH_DOMAIN=window.BUDGET_AUTH0_DOMAIN||'auth.litalkeducation.com',CLIENT_ID=window.BUDGET_AUTH0_CLIENT_ID||'PGqozL94LzOwstm4pD39W5kvalYRiK7w';
let auth0Client,me,meta,reportRows=[];
const $=id=>document.getElementById(id);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let toastT;
function toast(msg,err){const t=$('toast');t.textContent=msg;t.className=err?'err':'';clearTimeout(toastT);toastT=setTimeout(()=>t.classList.add('hidden'),3200)}
const _libs={};
function loadScript(src){return _libs[src]||(_libs[src]=new Promise((ok,no)=>{const x=document.createElement('script');x.src=src;x.onload=ok;x.onerror=()=>{delete _libs[src];no(new Error('โหลดไลบรารีไม่สำเร็จ'))};document.head.appendChild(x)}))}
async function needXlsx(){await loadScript('https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js')}
async function needPdf(){await loadScript('https://cdn.jsdelivr.net/npm/jspdf@2.5.2/dist/jspdf.umd.min.js');await loadScript('https://cdn.jsdelivr.net/npm/jspdf-autotable@3.8.4/dist/jspdf.plugin.autotable.min.js')}
function updateOnline(){$('offline').classList.toggle('hidden',navigator.onLine)}
addEventListener('online',updateOnline);addEventListener('offline',updateOnline);
// ?test=true : demo mode with local fake data. No Auth0 login and no API calls are made.
const TEST=new URLSearchParams(location.search).get('test')==='true';
const mock=(()=>{const accs=[{uuid:'a1',name:'เงินสดชมรม',currency:'THB'},{uuid:'a2',name:'บัญชีธนาคาร',currency:'THB'}],cats=[{uuid:'c1',name:'อุปกรณ์',type:'expense'},{uuid:'c2',name:'ค่ากิจกรรม',type:'expense'},{uuid:'c3',name:'เงินสนับสนุน',type:'income'},{uuid:'c4',name:'อื่น ๆ',type:'both'}];
 let n=3;const txs=[{transaction_id:'DEMO-0003',transaction_uuid:'t3',account_uuid:'a2',account_name:'บัญชีธนาคาร',type:'income',is_donation:1,category:'เงินบริจาค',amount:20000,details:'บริจาคโดย คุณสมชาย ใจดี (PromptPay)',created_by_email:'demo@example.com',created_by_name:'ผู้ทดสอบ',created_at:new Date(Date.now()-864e5).toISOString(),status:'active'},{transaction_id:'DEMO-0002',transaction_uuid:'t2',account_uuid:'a1',account_name:'เงินสดชมรม',type:'expense',category:'อุปกรณ์',amount:850.5,details:'ซื้อกระดาษ A4 และปากกา',created_by_email:'demo@example.com',created_by_name:'ผู้ทดสอบ',created_at:new Date(Date.now()-2*864e5).toISOString(),status:'active'},{transaction_id:'DEMO-0001',transaction_uuid:'t1',account_uuid:'a1',account_name:'เงินสดชมรม',type:'income',category:'อื่น ๆ',amount:5000,details:'ยอดยกมา',created_by_email:'demo@example.com',created_by_name:'ผู้ทดสอบ',created_at:new Date(Date.now()-5*864e5).toISOString(),status:'active'}];
 const dons=[{uuid:'d2',transaction_uuid:'t2',transaction_id:'DEMO-D2',account_name:'บัญชีธนาคาร',donor_name:'คุณสมชาย ใจดี',method:'promptpay',amount:1000,donated_at:'2026-11-08',note:'สนับสนุนโครงการ',evidence_uuid:'e',created_by_email:'demo@example.com',created_by_name:'ผู้ทดสอบ'},{uuid:'d1',transaction_uuid:'t1',transaction_id:'DEMO-D1',account_name:'เงินสดชมรม',donor_name:'ไม่ประสงค์ออกนาม',method:'cash',amount:500,donated_at:'2026-11-05',note:'',created_by_email:'demo@example.com',created_by_name:'ผู้ทดสอบ'}];
 const notifs=[{uuid:'n2',kind:'donation',transaction_id:'DEMO-0003',type:'income',amount:20000,account_name:'บัญชีธนาคาร',title:'บริจาคใหม่ ฿20,000.00',body:'ผู้ช่วย · บัญชีธนาคาร · บริจาคโดย คุณสมชาย ใจดี (PromptPay)',actor_email:'x@y',actor_name:'ผู้ช่วย',created_at:new Date(Date.now()-36e5).toISOString(),unread:true},{uuid:'n1',kind:'transaction',transaction_id:'DEMO-0002',type:'expense',amount:850.5,account_name:'เงินสดชมรม',title:'เงินออก ฿850.50',body:'ผู้ช่วย · เงินสดชมรม · ซื้อกระดาษ A4 และปากกา',actor_email:'x@y',actor_name:'ผู้ช่วย',created_at:new Date(Date.now()-2*864e5).toISOString(),unread:true}];
 const res=o=>({ok:true,status:200,json:async()=>o,blob:async()=>new Blob(['demo evidence'],{type:'text/plain'})});
 return async(path,opt={})=>{const u=path.split('?')[0],post=(opt.method||'GET')==='POST';
  if(u==='/budget/meta')return res({accounts:accs,categories:cats.filter(c=>c.active!==0)});
   if(u==='/budget/admin/categories'&&!post)return res({categories:cats.map(c=>({...c,active:c.active===0?0:1,uses:txs.filter(t=>t.category===c.name).length}))});
   if(u==='/budget/admin/categories'&&post){const b=JSON.parse(opt.body);cats.push({uuid:'c'+(cats.length+1),name:b.name,type:b.type});return res({ok:true})}
   if(/^\/budget\/admin\/categories\//.test(u)&&(opt.method||'')==='PATCH'){const c=cats.find(x=>x.uuid===decodeURIComponent(u.split('/').pop()));const b=JSON.parse(opt.body);if(!c)return {ok:false,status:404,json:async()=>({error:'ไม่พบหมวดหมู่'})};if(b.name!==undefined)c.name=b.name;if(b.type!==undefined)c.type=b.type;if(b.active!==undefined)c.active=b.active?1:0;return res({ok:true})}
  if(u==='/budget/dashboard'){const t=(x)=>txs.filter(y=>y.type===x).reduce((a,y)=>a+y.amount,0);return res({totals:{income:txs.filter(y=>y.type==='income'&&!y.is_donation).reduce((a,y)=>a+y.amount,0),donation:txs.filter(y=>y.is_donation).reduce((a,y)=>a+y.amount,0),expense:t('expense'),balance:t('income')-t('expense')},accounts:accs.map(a=>{const mine=txs.filter(y=>y.account_uuid===a.uuid),sum=f=>mine.filter(f).reduce((s,y)=>s+y.amount,0);return {...a,income:sum(y=>y.type==='income'&&!y.is_donation),donation:sum(y=>y.is_donation),expense:sum(y=>y.type==='expense'),balance:sum(y=>y.type==='income')-sum(y=>y.type==='expense')}}),recent:txs.slice(0,5)})}
  if(u==='/budget/report')return res({transactions:txs});
  if(u==='/budget/notifications')return res({notifications:notifs,unread:notifs.filter(x=>x.unread).length,push:{configured:false,subscribed:false}});
  if(u==='/budget/notifications/read'){notifs.forEach(x=>x.unread=false);return res({ok:true})}
  if(u==='/budget/donations'&&!post){const t=m=>dons.filter(y=>!m||y.method===m).reduce((a,y)=>a+y.amount,0);return res({donations:dons,totals:{all:t(),cash:t('cash'),promptpay:t('promptpay'),count:dons.length}})}
  if(u==='/budget/donations'&&post){const f=opt.body,acc=accs.find(a=>a.uuid===f.get('accountUuid'));n++;const id='DEMO-'+String(n).padStart(4,'0'),name=f.get('anonymous')?'ไม่ประสงค์ออกนาม':f.get('donorName'),amt=Number(f.get('amount')),m=f.get('method');
   dons.unshift({uuid:'d'+n,transaction_uuid:'t'+n,transaction_id:id,account_name:acc.name,donor_name:name,donor_contact:f.get('donorContact'),method:m,amount:amt,donated_at:f.get('donatedAt'),note:f.get('note'),evidence_uuid:f.get('evidence')?'e':null,created_by_email:'demo@example.com',created_by_name:'ผู้ทดสอบ'});
   txs.unshift({transaction_id:id,transaction_uuid:'t'+n,account_uuid:acc.uuid,account_name:acc.name,type:'income',is_donation:1,category:'เงินบริจาค',amount:amt,details:'บริจาคโดย '+name+' ('+(m==='cash'?'เงินสด':'PromptPay')+')',created_by_email:'demo@example.com',created_by_name:'ผู้ทดสอบ',created_at:new Date().toISOString(),status:'active'});
   return res({donation:{uuid:'d'+n,transactionId:id,accountUuid:acc.uuid,donorName:name,method:m,amount:amt}})}
  if(u==='/budget/admin/users'&&!post)return res({users:[{email:'demo@example.com',student_id:'0000000',enabled:true}]});
  if(u==='/budget/transactions'&&post){const f=opt.body,acc=accs.find(a=>a.uuid===f.get('accountUuid')),cat=cats.find(c=>c.uuid===f.get('categoryUuid'));n++;const id='DEMO-'+String(n).padStart(4,'0');txs.unshift({transaction_id:id,transaction_uuid:'t'+n,account_uuid:acc.uuid,account_name:acc.name,type:f.get('type'),category:cat.name,amount:Number(f.get('amount')),details:f.get('details'),created_by_email:'demo@example.com',created_by_name:'ผู้ทดสอบ',created_at:new Date().toISOString(),status:'active'});return res({transaction:{transactionId:id,uuid:'demo-'+n,accountUuid:acc.uuid,type:f.get('type'),amount:Number(f.get('amount')),details:f.get('details')},verificationUrl:location.origin+'/verify/?id='+id})}
  if(u.endsWith('/evidence'))return res({});
  return res({ok:true})}})();

// ---- phone install gate: phones/tablets must use the installed web app (desktop is exempt) ----
const UA=navigator.userAgent;
const IS_IOS=/iPhone|iPad|iPod/i.test(UA)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
const IS_MOBILE=IS_IOS||/Android|Mobile|Windows Phone|webOS|BlackBerry/i.test(UA);
const IN_APP_BROWSER=/Line\/|FBAN|FBAV|Instagram|MicroMessenger|TikTok|; wv\)/i.test(UA);
const isStandalone=()=>['standalone','fullscreen','minimal-ui'].some(m=>matchMedia('(display-mode: '+m+')').matches)||navigator.standalone===true;
const needsInstall=()=>!TEST&&IS_MOBILE&&!isStandalone();
const icoShare=()=>svgI('<path d="M12 3v12M8 7l4-4 4 4M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7"/>'),icoDots=()=>svgI('<circle cx="12" cy="5" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="12" cy="19" r="1.2"/>');
function updateGate(){gateRender();const st=$('gateSteps');st.innerHTML=st.innerHTML.replace(/<li>/g,'<li><span>').replace(/<\/li>/g,'</span></li>')}
function gateRender(){
 const steps=$('gateSteps'),inst=$('gateInstall'),copy=$('gateCopy');
 copy.classList.add('hidden');inst.classList.add('hidden');
 if(IN_APP_BROWSER){
  $('gateLead').textContent='เบราว์เซอร์ในแอป (เช่น LINE/Facebook) ติดตั้งแอปไม่ได้';
  steps.innerHTML='<li>เปิดลิงก์นี้ใน <b>'+(IS_IOS?'Safari':'Chrome')+'</b> (แตะเมนู แล้วเลือก “เปิดในเบราว์เซอร์”)</li><li>ทำตามขั้นตอนติดตั้งแอปที่แสดงในเบราว์เซอร์</li>';
  copy.classList.remove('hidden');return}
 if(IS_IOS){
  steps.innerHTML='<li>แตะปุ่มแชร์ '+icoShare()+' ใน Safari</li><li>เลือก <b>“เพิ่มไปยังหน้าจอโฮม”</b></li><li>แตะ <b>“เพิ่ม”</b> แล้วเปิดแอป Budget จากหน้าจอโฮม</li>';return}
 if(deferredInstall){inst.classList.remove('hidden');steps.innerHTML='<li>แตะปุ่ม <b>“ติดตั้งแอป”</b> ด้านล่าง</li><li>เปิดแอป Budget จากหน้าจอหลัก</li>';return}
 steps.innerHTML='<li>แตะเมนู '+icoDots()+' ของ Chrome</li><li>เลือก <b>“ติดตั้งแอป”</b> หรือ <b>“เพิ่มลงในหน้าจอหลัก”</b></li><li>เปิดแอป Budget จากหน้าจอหลัก</li>'}
$('gateInstall').addEventListener('click',async()=>{if(!deferredInstall)return;deferredInstall.prompt();const r=await deferredInstall.userChoice;deferredInstall=null;if(r.outcome==='accepted')toast('ติดตั้งแล้ว เปิดแอป Budget จากหน้าจอหลักได้เลย');updateGate()});
$('gateCopy').addEventListener('click',async()=>{try{await navigator.clipboard.writeText(location.origin+'/');toast('คัดลอกลิงก์แล้ว')}catch(e){toast(location.origin+'/')}});
async function init(){
 updateOnline();
 if(needsInstall()){updateGate();show('gate');return}
 if(TEST){me={name:'โหมดทดสอบ',email:'demo@example.com',isAdmin:true};$('userName').textContent=me.name;$('adminNav').classList.remove('hidden');startNotifs();$('testBanner').classList.remove('hidden');show('app');await loadMeta();const q=new URLSearchParams(location.search).get('page');if(q)showPage(q);await loadDashboard();return}
 const T=12000;
 try{
  if(!window.auth0)throw new Error('โหลดระบบเข้าสู่ระบบไม่สำเร็จ ตรวจสอบอินเทอร์เน็ตแล้วลองใหม่');
  auth0Client=await withTimeout(auth0.createAuth0Client({domain:AUTH_DOMAIN,clientId:CLIENT_ID,cacheLocation:'localstorage',useRefreshTokens:true,authorizationParams:{redirect_uri:location.origin+location.pathname}}),T,'เชื่อมต่อระบบเข้าสู่ระบบไม่ทัน');
  if(location.search.includes('code=')||location.search.includes('error=')){await withTimeout(auth0Client.handleRedirectCallback(),T,'ยืนยันการเข้าสู่ระบบไม่ทัน');history.replaceState({},document.title,location.pathname);}
  if(!await withTimeout(auth0Client.isAuthenticated(),T,'ตรวจสอบสถานะไม่ทัน')){show('login');return}
  const token=await withTimeout(auth0Client.getTokenSilently(),T,'ขอสิทธิ์เข้าใช้งานไม่ทัน');
  const r=await withTimeout(fetch(API+'/budget/me',{headers:{Authorization:'Bearer '+token}}),15000,'เชื่อมต่อเซิร์ฟเวอร์ไม่ทัน');
  if(!r.ok){show('denied');return}
  me=await r.json();
 }catch(e){console.error(e);loginMsg(e.message||'เข้าสู่ระบบไม่สำเร็จ ลองใหม่อีกครั้ง');show('login');return}
 $('userName').textContent=me.name||me.email||'';if(me.isAdmin){$('adminNav').classList.remove('hidden');startNotifs()}
 show('app');
 try{await loadMeta();const q=new URLSearchParams(location.search).get('page');if(['transaction','donation','audit'].includes(q))showPage(q);await loadDashboard()}catch(e){console.error(e);toast('โหลดข้อมูลไม่สำเร็จ',1)}
}
function loginMsg(t){const b=$('loginMsg');b.textContent=t;b.classList.toggle('hidden',!t)}
function show(id){['loading','login','gate','denied','app'].forEach(x=>$(x).classList.toggle('hidden',x!==id))}
async function login(){try{loginMsg('');if(!auth0Client)throw new Error('ระบบเข้าสู่ระบบยังไม่พร้อม กรุณารีเฟรชหน้า');await auth0Client.loginWithRedirect()}catch(e){loginMsg(e.message)}}
async function logout(){if(TEST){location.href=location.pathname;return}await auth0Client.logout({logoutParams:{returnTo:location.origin+location.pathname}})}
async function token(){return auth0Client.getTokenSilently()}
async function api(path,opt={}){if(TEST)return mock(path,opt);const t=await token();opt.headers={...(opt.headers||{}),Authorization:'Bearer '+t};return fetch(API+path,opt)}

// ---- helpers ----
const REDUCED=matchMedia('(prefers-reduced-motion: reduce)').matches;
function hideModal(id){const m=$(id);if(!m||m.classList.contains('hidden'))return;if(REDUCED){m.classList.add('hidden');return}m.classList.add('closing');setTimeout(()=>{m.classList.add('hidden');m.classList.remove('closing')},190)}
function openModal(id){const m=$(id);m.classList.remove('closing','hidden')}
function replay(el,cls){el.classList.remove(cls);void el.offsetWidth;el.classList.add(cls)}
function countUp(el,from,to,ms=650){if(REDUCED||from===to){el.textContent='฿'+money(to);return}const t0=performance.now(),d=to-from;const f=t=>{const k=Math.min(1,(t-t0)/ms),e=1-Math.pow(1-k,3);el.textContent='฿'+money(from+d*e);if(k<1)requestAnimationFrame(f)};requestAnimationFrame(f)}
const pad2=n=>String(n).padStart(2,'0');
const ymdOf=d=>d.getFullYear()+'-'+pad2(d.getMonth()+1)+'-'+pad2(d.getDate());
const todayStr=()=>ymdOf(new Date());
const isDateOnly=d=>/^\d{4}-\d{2}-\d{2}$/.test(String(d));
const ymd=d=>isDateOnly(d)?d:ymdOf(new Date(d));
const timeOf=d=>{if(isDateOnly(d))return '';try{return new Date(d).toLocaleTimeString('th-TH',{hour:'2-digit',minute:'2-digit'})}catch(e){return ''}};
const fmtDate=d=>{try{return isDateOnly(d)?dayLabel(d):new Date(d).toLocaleString('th-TH',{day:'numeric',month:'short',year:'2-digit',hour:'2-digit',minute:'2-digit'})}catch(e){return d}};
function dayLabel(k){if(k===todayStr())return 'วันนี้';if(k===ymdOf(new Date(Date.now()-864e5)))return 'เมื่อวาน';const [Y,M,D]=k.split('-').map(Number);return new Date(Y,M-1,D).toLocaleDateString('th-TH',{day:'numeric',month:'short',year:'numeric'})}
const mLabel=m=>m==='promptpay'?'PromptPay':'เงินสด';
const svgI=p=>'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">'+p+'</svg>';
const IC={
 menu:svgI('<path d="M4 7h16M4 12h10M4 17h16"/>'),back:svgI('<path d="M15 18l-6-6 6-6"/>'),
 income:svgI('<path d="M17 7L7 17M7 8v9h9"/>'),expense:svgI('<path d="M7 17L17 7M8 7h9v9"/>'),
 donation:svgI('<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1 1.1L12 21l7.8-7.5 1-1.1a5.5 5.5 0 0 0 0-7.8z"/>'),
 plus:svgI('<path d="M12 5v14M5 12h14"/>'),list:svgI('<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>'),refresh:svgI('<path d="M21 12a9 9 0 1 1-3-6.7L21 8M21 3v5h-5"/>'),
 caret:svgI('<path d="M6 9l6 6 6-6"/>'),del:svgI('<path d="M21 4H8l-7 8 7 8h13a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2zM18 9l-6 6M12 9l6 6"/>')};
function money(n){return Number(n||0).toLocaleString('th-TH',{minimumFractionDigits:2,maximumFractionDigits:2})}
const lists={recent:[],rep:[],don:[]};
async function errMsg(r){try{const d=await r.json();return d.error||('เกิดข้อผิดพลาด ('+r.status+')')}catch(e){return 'เกิดข้อผิดพลาด ('+r.status+')'}}
function failBox(msg,retry){return '<div class="failbox"><b>โหลดข้อมูลไม่สำเร็จ</b><p>'+esc(msg)+'</p><button class="cta small-cta" onclick="'+retry+'">ลองใหม่</button></div>'}
function rowHtml(t,src,i){
 const don=src==='don',k=don?'donation':(t.is_donation?'donation':t.type),inc=don||t.type==='income';
 const title=don?t.donor_name:t.details;
 const sub=don?mLabel(t.method)+' · '+t.account_name:[timeOf(t.created_at),t.category,t.account_name].filter(Boolean).join(' · ');
 const cap=don?mLabel(t.method):(t.is_donation?'บริจาค':inc?'เงินเข้า':'เงินออก');
 return '<button class="row" onclick="openDetail(\''+src+'\','+i+')"><span class="av '+k+'">'+IC[k]+'</span><span class="rm"><b>'+esc(title)+'</b><small>'+esc(sub)+'</small></span><span class="ra"><b class="amt '+k+'">'+(inc?'+':'-')+'฿'+money(t.amount)+'</b><small>'+esc(cap)+'</small></span></button>'}
function groupedHtml(rows,src,key){let out='',last='';rows.forEach((t,i)=>{const k=ymd(t[key]);if(k!==last){out+='<div class="day">'+esc(dayLabel(k))+'</div>';last=k}out+=rowHtml(t,src,i)});return out}

// ---- navigation ----
const TITLES={dashboard:'บัญชีของฉัน',transaction:'บันทึกรายการ',donation:'บริจาค',audit:'ธุรกรรม',admin:'ตั้งค่าระบบ'};
let curPage='dashboard',lastDash=0;
function showPage(p){
 curPage=p;document.querySelectorAll('.page').forEach(x=>x.classList.add('hidden'));const pg=$('page-'+p);pg.classList.remove('hidden');replay(pg,'enter');pg.classList.add('stagger');clearTimeout(pg._st);pg._st=setTimeout(()=>pg.classList.remove('stagger'),1300);
 document.querySelectorAll('nav button').forEach(x=>x.classList.toggle('active',x.dataset.page===p));
 $('pageTitle').textContent=TITLES[p]||'';$('topLeft').innerHTML=p==='dashboard'?IC.menu:IC.back;$('topLeft').setAttribute('aria-label',p==='dashboard'?'เมนู':'ย้อนกลับ');
 $('fab').classList.toggle('gone',p==='transaction'||(p==='donation'&&!$('donForm').classList.contains('hidden')));
 window.scrollTo(0,0);
 if(p==='dashboard'&&Date.now()-lastDash>20000)loadDashboard();
 if(p==='donation')loadDonations();if(p==='audit')loadReport();if(p==='admin')loadAdmin()}
function topLeft(){
 if(curPage==='dashboard')return openMenu();
 if(curPage==='transaction'&&!$('txStep2').classList.contains('hidden'))return goTx(1);
 if(curPage==='donation'&&!$('donForm').classList.contains('hidden')){if(!$('donStep2').classList.contains('hidden'))return goDon(1);return toggleDonForm(false)}
 showPage('dashboard')}
function openMenu(){const n=me?.name||me?.email||'';$('userName').textContent=n;$('menuEmail').textContent=me?.email||'';$('menuAv').textContent=(n.trim()[0]||'?').toUpperCase();$('menuRole').textContent=me?.isAdmin?'ผู้ดูแล (budget_admin)':'ผู้ใช้';$('menu').classList.remove('hidden')}
function closeMenu(){hideModal('menu')}

async function loadMeta(){
 const r=await api('/budget/meta');if(!r.ok){toast(await errMsg(r),1);return}meta=await r.json();
 const accounts=meta.accounts||[],cats=meta.categories||[];
 $('account').innerHTML=accounts.map(x=>'<option value="'+esc(x.uuid)+'">'+esc(x.name)+'</option>').join('');
 $('filterAccount').innerHTML='<option value="">ทุกบัญชี</option>'+accounts.map(x=>'<option value="'+esc(x.uuid)+'">'+esc(x.name)+'</option>').join('');
 $('donAccount').innerHTML=$('account').innerHTML;
 $('newUserAccount').innerHTML=accounts.map(x=>'<label><input type="checkbox" value="'+esc(x.uuid)+'"> '+esc(x.name)+'</label>').join('');
 updateCats();
}
function updateCats(){const cats=(meta?.categories||[]).filter(x=>x.type===$('type').value||x.type==='both');$('category').innerHTML=cats.map(x=>'<option value="'+esc(x.uuid)+'">'+esc(x.name)+'</option>').join('')}

// segmented toggles
document.querySelectorAll('[data-type]').forEach(b=>b.addEventListener('click',()=>{$('type').value=b.dataset.type;document.querySelectorAll('[data-type]').forEach(x=>x.classList.toggle('on',x===b));updateCats()}));
function resetType(){$('type').value='expense';document.querySelectorAll('[data-type]').forEach(x=>x.classList.toggle('on',x.dataset.type==='expense'))}

// ---- amount keypad ----
function Pad(o){
 let v='';
 const KEYS=['1','2','3','4','5','6','7','8','9','.','0','del'];
 o.pad.innerHTML=KEYS.map(k=>'<button type="button" class="k" data-k="'+k+'" aria-label="'+(k==='del'?'ลบ':k)+'">'+(k==='del'?IC.del:k)+'</button>').join('');
 o.quick.innerHTML=[100,500,1000,2000,5000].map(n=>'<button type="button" class="chip" data-q="'+n+'">฿'+n.toLocaleString('th-TH')+'</button>').join('');
 function render(){const [i,f]=v.split('.');const ii=(i||'0').replace(/\B(?=(\d{3})+(?!\d))/g,',');
  o.disp.innerHTML='<span class="cur">฿</span><span class="num">'+ii+(v.includes('.')?'.'+(f||''):'')+'</span>';o.disp.classList.toggle('empty',!v);o.hidden.value=v;o.next.disabled=!(Number(v)>0)}
 function bump(){if(!REDUCED)replay(o.disp,'bump')}
 function press(k){
  if(k==='del')v=v.slice(0,-1);
  else if(k==='.'){if(!v.includes('.'))v=(v||'0')+'.'}
  else{if(v.includes('.')&&v.split('.')[1].length>=2)return;if(v.replace('.','').length>=9)return;v=(v==='0')?k:v+k}
  render();bump()}
 o.pad.addEventListener('click',e=>{const b=e.target.closest('[data-k]');if(b)press(b.dataset.k)});
 o.quick.addEventListener('click',e=>{const b=e.target.closest('[data-q]');if(b){v=b.dataset.q;render();bump()}});
 document.addEventListener('keydown',e=>{if(!o.visible()||/INPUT|TEXTAREA|SELECT/.test((e.target.tagName||'')))return;
  if(/^[0-9.]$/.test(e.key))press(e.key);else if(e.key==='Backspace')press('del');else if(e.key==='Enter'&&!o.next.disabled)o.next.click()});
 render();
 return {reset(){v='';render()},get:()=>v}}

// ---- dashboard ----
let dash=null,acctSel='',lastBal=0;
async function loadDashboard(){
 if(!dash)$('summary').innerHTML='<div class="skeleton" style="height:270px;border-radius:0 0 32px 32px;margin:0 -16px"></div>';
 let r;try{r=await api('/budget/dashboard')}catch(e){if(!dash)$('summary').innerHTML=failBox('เชื่อมต่อเซิร์ฟเวอร์ไม่ได้','loadDashboard()');else toast('โหลดข้อมูลไม่สำเร็จ',1);return}
 if(!r.ok){const m=await errMsg(r);if(!dash)$('summary').innerHTML=failBox(m,'loadDashboard()');else toast(m,1);return}
 dash=await r.json();lastDash=Date.now();renderDash()}
function pickAcct(u){acctSel=acctSel===u?'':u;renderDash()}
function renderDash(){
 const d=dash,accs=d.accounts||[],a=acctSel&&accs.find(x=>x.uuid===acctSel);if(acctSel&&!a)acctSel='';
 const t=a?{balance:a.balance,income:a.income,donation:a.donation,expense:a.expense}:d.totals;
 const act=(ic,label,fn,prim)=>'<div class="act"><button class="ab'+(prim?' primary':'')+'" onclick="'+fn+'" aria-label="'+label+'">'+ic+'</button><span>'+label+'</span></div>';
 $('summary').innerHTML='<div class="hero-panel"><label class="chip-sel"><i class="cardico"></i><span>'+esc(a?a.name:'ทุกบัญชี')+'</span>'+IC.caret+'<select id="acctSelect" aria-label="เลือกบัญชี"><option value="">ทุกบัญชี</option>'+accs.map(x=>'<option value="'+esc(x.uuid)+'"'+(x.uuid===acctSel?' selected':'')+'>'+esc(x.name)+'</option>').join('')+'</select></label>'
  +'<div class="lbl">ยอดคงเหลือ</div><div class="bal" id="balNum">฿'+money(t.balance)+'</div>'
  +'<div class="pn-row"><span class="pn in">เงินเข้า ฿'+money(t.income)+'</span><span class="pn don">บริจาค ฿'+money(t.donation)+'</span><span class="pn out">เงินออก ฿'+money(t.expense)+'</span></div>'
  +'<div class="acts">'+act(IC.plus,'บันทึก',"showPage('transaction')",1)+act(IC.donation,'บริจาค',"showPage('donation')")+act(IC.list,'ธุรกรรม',"showPage('audit')")+act(IC.refresh,'รีเฟรช','loadDashboard()')+'</div></div>';
 $('acctSelect').onchange=e=>{acctSel=e.target.value;renderDash()};
 countUp($('balNum'),lastBal,Number(t.balance||0));lastBal=Number(t.balance||0);
 $('accounts').innerHTML=accs.map(x=>'<button class="acct-card'+(x.uuid===acctSel?' on':'')+'" onclick="pickAcct(\''+esc(x.uuid)+'\')"><i class="cardico"></i><b>'+esc(x.name)+'</b><small>'+esc(x.currency||'THB')+'</small><div class="ab">฿'+money(x.balance)+'</div></button>').join('')||'<div class="empty">ยังไม่มีบัญชี</div>';
 lists.recent=(d.recent||[]).filter(x=>!acctSel||x.account_uuid===acctSel);
 $('recent').innerHTML=groupedHtml(lists.recent,'recent','created_at')||'<div class="empty">ยังไม่มีรายการ</div>'}

// ---- detail sheet ----
function openDetail(src,i){const t=lists[src][i];if(!t)return;
 const don=src==='don',inc=don||t.type==='income',k=don?'donation':(t.is_donation?'donation':t.type);
 const rows=don?[['ช่องทาง',mLabel(t.method)],['วันที่บริจาค',dayLabel(ymd(t.donated_at))],['บัญชี',t.account_name],['ติดต่อ',t.donor_contact],['หมายเหตุ',t.note],['ผู้บันทึก',t.created_by_name||t.created_by_email],['Transaction ID',t.transaction_id]]
  :[['ประเภท',t.is_donation?'บริจาค':inc?'เงินเข้า':'เงินออก'],['หมวดหมู่',t.category],['บัญชี',t.account_name],['วันที่',fmtDate(t.created_at)],['หมายเหตุ',t.note],['ผู้บันทึก',t.created_by_name||t.created_by_email],['Transaction ID',t.transaction_id]];
 const ev=!don||t.evidence_uuid;
 $('detailBody').innerHTML='<div class="dt-amt '+k+'">'+(inc?'+':'-')+'฿'+money(t.amount)+'</div><div class="dt-title">'+esc(don?t.donor_name:t.details)+'</div>'+rows.filter(r=>r[1]).map(r=>'<div class="kv"><span>'+r[0]+'</span><b>'+esc(r[1])+'</b></div>').join('')
  +(ev?'<button class="cta" onclick="openEvidence(\''+esc(t.transaction_uuid||t.uuid)+'\')">ดูหลักฐาน / สลิป</button>':'');
 $('detail').classList.remove('hidden')}
function closeDetail(){hideModal('detail')}

// ---- record transaction (2 steps) ----
const txPad=Pad({disp:$('txDisp'),hidden:$('amount'),pad:$('txPad'),quick:$('txQuick'),next:$('txNext'),visible:()=>curPage==='transaction'&&!$('txStep1').classList.contains('hidden')});
function goTx(n){$('txStep1').classList.toggle('hidden',n!==1);$('txStep2').classList.toggle('hidden',n!==2);replay($('txStep'+n),n===2?'step-fwd':'step-back');if(n===2)$('txRecap').textContent='฿'+money($('amount').value);window.scrollTo(0,0)}
$('txNext').onclick=()=>{if(Number($('amount').value)>0)goTx(2)};
$('txForm').addEventListener('submit',async e=>{
 e.preventDefault();if(!(Number($('amount').value)>0)){goTx(1);return}
 const f=$('evidence').files[0];if(!f){$('txStatus').textContent='กรุณาแนบหลักฐาน';return}
 if(f.size>10*1024*1024){$('txStatus').textContent='ไฟล์ต้องไม่เกิน 10 MB';return}
 $('saveBtn').disabled=true;$('txStatus').textContent='กำลังบันทึก…';
 try{const form=new FormData();form.append('accountUuid',$('account').value);form.append('type',$('type').value);form.append('categoryUuid',$('category').value);form.append('amount',$('amount').value);form.append('details',$('details').value);form.append('note',$('note').value);form.append('evidence',f,f.name);
  const result=await api('/budget/transactions',{method:'POST',body:form});const d=await result.json();if(!result.ok)throw new Error(d.error||'บันทึกไม่สำเร็จ');
  $('txForm').reset();txPad.reset();resetType();setPreview();updateCats();goTx(1);$('txStatus').textContent='';showReceipt(d.transaction,d.verificationUrl);lastDash=0;loadDashboard()}
 catch(err){$('txStatus').textContent=err.message}finally{$('saveBtn').disabled=false}});

function setPreview(){const f=$('evidence').files[0],box=$('preview');if(!f){box.classList.add('hidden');box.innerHTML='';return}
 const thumb=f.type.startsWith('image/')?'<img alt="" src="'+URL.createObjectURL(f)+'">':'<div class="pdf">PDF</div>';
 box.innerHTML=thumb+'<div class="meta"><div>'+esc(f.name)+'</div><small>'+(f.size/1048576).toFixed(2)+' MB</small></div><button type="button" class="secondary small" id="rmFile">ลบ</button>';box.classList.remove('hidden');$('txStatus').textContent='';
 $('rmFile').onclick=()=>{$('evidence').value='';$('evidenceCam').value='';setPreview()}}
$('evidence').addEventListener('change',()=>{$('evidenceCam').value='';setPreview()});
$('evidenceCam').addEventListener('change',()=>{const f=$('evidenceCam').files[0];if(!f)return;const dt=new DataTransfer();dt.items.add(f);$('evidence').files=dt.files;setPreview()});
// QR: local generator (qrcode-generator) drawn onto a canvas
function drawQR(canvas,text,size){
 if(typeof qrcode!=='function')return false;
 const q=qrcode(0,'M');q.addData(text);q.make();const n=q.getModuleCount(),quiet=2,cell=Math.max(1,Math.floor(size/(n+quiet*2))),px=cell*(n+quiet*2);
 canvas.width=canvas.height=px;const x=canvas.getContext('2d');x.fillStyle='#fff';x.fillRect(0,0,px,px);x.fillStyle='#171212';
 for(let r=0;r<n;r++)for(let c=0;c<n;c++)if(q.isDark(r,c))x.fillRect((c+quiet)*cell,(r+quiet)*cell,cell,cell);
 canvas.style.width=canvas.style.height=Math.min(px,size)+'px';return true}
let lastReceipt=null;
function showReceipt(t,url){
 const acc=(meta.accounts.find(a=>a.uuid===t.accountUuid)||{}).name||t.accountUuid;
 lastReceipt={id:t.transactionId,account:acc,typeLabel:t.type==='income'?'เงินเข้า':'เงินออก',type:t.type,amount:t.amount,details:t.details,when:new Date().toLocaleString('th-TH',{day:'numeric',month:'long',year:'numeric',hour:'2-digit',minute:'2-digit'}),url};
 $('receiptBody').innerHTML='<p><b>Transaction ID:</b> '+esc(t.transactionId)+'</p><p><b>บัญชี:</b> '+esc(acc)+'</p><p><b>ประเภท:</b> '+lastReceipt.typeLabel+'</p><p><b>จำนวน:</b> ฿'+money(t.amount)+'</p><p><b>รายละเอียด:</b> '+esc(t.details)+'</p><p class="muted">UUID: '+esc(t.uuid)+'</p>';
 $('receipt').classList.remove('hidden');
 try{if(!drawQR($('qr'),url,200))console.warn('QR library not loaded')}catch(e){console.error('QR failed',e)}}
function wrapText(ctx,text,maxW){const out=[];String(text).split('\n').forEach(par=>{let line='';for(const ch of par){const t=line+ch;if(ctx.measureText(t).width>maxW&&line){out.push(line);line=ch}else line=t}out.push(line)});return out}
async function saveReceiptImage(){
 const r=lastReceipt;if(!r)return;
 try{await Promise.all([document.fonts.load('700 30px "Noto Sans Thai"'),document.fonts.load('400 26px "Noto Sans Thai"')])}catch(e){}
 const S=2,W=720,P=48,F='"Noto Sans Thai",system-ui,sans-serif',inc=r.type==='income';
 const c=document.createElement('canvas'),x=c.getContext('2d');
 const rows=[['Transaction ID',r.id],['บัญชี',r.account],['ประเภท',r.typeLabel],['วันที่',r.when]];
 x.font='400 26px '+F;const labelW=190,valW=W-P*2-labelW;
 const laid=rows.map(([k,v])=>({k,lines:wrapText(x,v,valW)}));
 const rowsH=laid.reduce((s,r)=>s+Math.max(1,r.lines.length)*38+22,0);
 const QR=260,H=170+120+rowsH+40+QR+96;
 c.width=W*S;c.height=H*S;x.scale(S,S);
 x.fillStyle='#fff';x.fillRect(0,0,W,H);
 const g=x.createLinearGradient(0,0,W,170);g.addColorStop(0,'#e53935');g.addColorStop(1,'#b71c1c');x.fillStyle=g;x.fillRect(0,0,W,170);
 x.fillStyle='#fff';x.textBaseline='alphabetic';x.font='700 38px '+F;x.fillText('ใบรับรายการ',P,82);x.font='400 24px '+F;x.globalAlpha=.85;x.fillText('Budget · English Education',P,122);x.globalAlpha=1;
 x.textAlign='center';x.fillStyle=inc?'#15803d':'#171212';x.font='800 64px '+F;x.fillText((inc?'+ ':'- ')+'฿'+money(r.amount),W/2,262);x.textAlign='left';
 let y=300;
 laid.forEach(row=>{x.strokeStyle='#efe6e5';x.lineWidth=2;x.beginPath();x.moveTo(P,y);x.lineTo(W-P,y);x.stroke();y+=44;
  x.fillStyle='#82787a';x.font='400 26px '+F;x.fillText(row.k,P,y);x.fillStyle='#171212';x.font='600 26px '+F;
  row.lines.forEach((ln,i)=>{x.fillText(ln,P+labelW,y+i*38)});y+=Math.max(0,row.lines.length-1)*38+16});
 y+=26;
 const qc=document.createElement('canvas');const ok=drawQR(qc,r.url,QR*S);
 if(ok){x.imageSmoothingEnabled=false;x.drawImage(qc,(W-QR)/2,y,QR,QR);x.imageSmoothingEnabled=true}
 y+=QR+40;x.textAlign='center';x.fillStyle='#82787a';x.font='400 24px '+F;x.fillText('สแกน QR เพื่อตรวจสอบรายการ',W/2,y);
 const blob=await new Promise(res=>c.toBlob(res,'image/png'));if(!blob)return toast('สร้างภาพไม่สำเร็จ',1);
 const file=new File([blob],'receipt-'+r.id+'.png',{type:'image/png'});
 const canShare=!!(navigator.canShare&&navigator.canShare({files:[file]}));
 // iPhone can only save to Photos via the share sheet; elsewhere download directly.
 if(IS_IOS&&canShare){try{await navigator.share({files:[file],title:'ใบรับรายการ '+r.id});return}catch(e){if(e&&e.name==='AbortError')return}}
 try{const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=file.name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),4000);toast('บันทึกภาพแล้ว');return}catch(e){}
 if(canShare){try{await navigator.share({files:[file]})}catch(e){}}}
function closeReceipt(){hideModal('receipt')}

// ---- transactions list ----
let repType='',repQ='';
async function loadReport(){
 const p=new URLSearchParams();if($('from').value)p.set('from',$('from').value);if($('to').value)p.set('to',$('to').value);
 if(!reportRows.length)$('reportCards').innerHTML='<div class="skeleton"></div><div class="skeleton"></div><div class="skeleton"></div>';
 let r;try{r=await api('/budget/report?'+p)}catch(e){$('reportCards').innerHTML=failBox('เชื่อมต่อเซิร์ฟเวอร์ไม่ได้','loadReport()');return}if(!r.ok){$('reportCards').innerHTML=failBox(await errMsg(r),'loadReport()');return}
 const d=await r.json();reportRows=d.transactions||[];renderReport()}
function renderReport(){const af=$('filterAccount').value;let rows=reportRows;
 if(af)rows=rows.filter(x=>x.account_uuid===af);
 if(repType==='donation')rows=rows.filter(x=>x.is_donation);else if(repType==='income')rows=rows.filter(x=>x.type==='income'&&!x.is_donation);else if(repType)rows=rows.filter(x=>x.type===repType);
 const q=repQ.trim().toLowerCase();if(q)rows=rows.filter(x=>[x.transaction_id,x.details,x.account_name,x.category,x.note,x.created_by_name,x.created_by_email].join(' ').toLowerCase().includes(q));
 lists.rep=rows;$('reportCards').innerHTML=groupedHtml(rows,'rep','created_at')||'<div class="empty">ไม่พบรายการ</div>';$('repCount').textContent=rows.length+' รายการ'}
$('filterAccount').addEventListener('change',renderReport);
$('repSearch').addEventListener('input',e=>{repQ=e.target.value;renderReport()});
$('filtBtn').addEventListener('click',()=>$('filterPanel').classList.toggle('hidden'));
$('repChips').addEventListener('click',e=>{const b=e.target.closest('.chip');if(!b)return;repType=b.dataset.v;document.querySelectorAll('#repChips .chip').forEach(x=>x.classList.toggle('on',x===b));renderReport()});

async function openEvidence(uuid){const w=window.open('','_blank');const r=await api('/budget/transactions/'+encodeURIComponent(uuid)+'/evidence');if(!r.ok){if(w)w.close();return toast('ไม่สามารถเปิดหลักฐานได้',1)}const u=URL.createObjectURL(await r.blob());if(w)w.location=u;else location.href=u}
async function exportExcel(){try{await needXlsx()}catch(e){return toast(e.message,1)}if(!reportRows.length)await loadReport();const rows=reportRows.map(x=>({'Transaction ID':x.transaction_id,'Transaction UUID':x.transaction_uuid,'Account UUID':x.account_uuid,'Account':x.account_name,'Date':x.created_at,'Type':x.is_donation?'donation':x.type,'Category':x.category,'Amount':x.amount,'Details':x.details,'Note':x.note||'','Created By':x.created_by_name||x.created_by_email,'Created By Email':x.created_by_email,'Status':x.status}));const wb=XLSX.utils.book_new(),ws=XLSX.utils.json_to_sheet(rows);XLSX.utils.book_append_sheet(wb,ws,'Transactions');XLSX.writeFile(wb,'budget-report-'+new Date().toISOString().slice(0,10)+'.xlsx')}
let _thFonts;
async function loadThaiFonts(doc){
 if(!_thFonts){const b64=async u=>{const r=await fetch(u);if(!r.ok)throw new Error('โหลดฟอนต์ไม่สำเร็จ');const buf=new Uint8Array(await r.arrayBuffer());let bin='';for(let i=0;i<buf.length;i+=0x8000)bin+=String.fromCharCode.apply(null,buf.subarray(i,i+0x8000));return btoa(bin)};
  _thFonts={n:await b64('/assets/fonts/Sarabun-Regular.ttf'),b:await b64('/assets/fonts/Sarabun-Bold.ttf')}}
 doc.addFileToVFS('Sarabun-Regular.ttf',_thFonts.n);doc.addFont('Sarabun-Regular.ttf','Sarabun','normal');
 doc.addFileToVFS('Sarabun-Bold.ttf',_thFonts.b);doc.addFont('Sarabun-Bold.ttf','Sarabun','bold');doc.setFont('Sarabun','normal')}
async function exportPdf(){try{await needPdf()}catch(e){return toast(e.message,1)}if(!reportRows.length)await loadReport();
 const {jsPDF}=window.jspdf,doc=new jsPDF({orientation:'landscape'});
 try{await loadThaiFonts(doc)}catch(e){return toast(e.message,1)}
 const tl=x=>x.is_donation?'บริจาค':x.type==='income'?'เงินเข้า':'เงินออก',dt=d=>{try{return new Date(d).toLocaleString('th-TH',{day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'})}catch(e){return d}};
 doc.setFontSize(18);doc.setFont('Sarabun','bold');doc.text('รายงานรายการงบประมาณ (Budget)',14,15);doc.setFont('Sarabun','normal');doc.setFontSize(11);doc.text('พิมพ์เมื่อ '+dt(new Date()),14,22);
 doc.autoTable({startY:28,head:[['Transaction ID','บัญชี','ประเภท','หมวดหมู่','จำนวนเงิน','รายละเอียด','ผู้บันทึก','วันที่']],body:reportRows.map(x=>[x.transaction_id,x.account_name,tl(x),x.category,money(x.amount),x.details,x.created_by_name||x.created_by_email,dt(x.created_at)]),styles:{font:'Sarabun',fontSize:9,cellPadding:2},headStyles:{font:'Sarabun',fontStyle:'bold',fillColor:[15,118,110]},columnStyles:{4:{halign:'right'}}});
 doc.save('budget-report-'+new Date().toISOString().slice(0,10)+'.pdf')}
async function loadAdmin(){if(!me.isAdmin)return;loadCats();const r=await api('/budget/admin/users');if(!r.ok){$('users').innerHTML=failBox(await errMsg(r),'loadAdmin()');return}const d=await r.json();$('users').innerHTML=(d.users||[]).map(x=>'<div class="kv-row"><span>'+esc(x.email)+'<br><small>'+esc(x.student_id||'ไม่ได้ผูกรหัสนักศึกษา')+'</small></span><b>'+(x.enabled?'Enabled':'Disabled')+'</b></div>').join('')||'<p>ยังไม่มีผู้ใช้</p>'}
$('accountForm').addEventListener('submit',async e=>{e.preventDefault();const r=await api('/budget/admin/accounts',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:$('newAccount').value,description:$('accountDesc').value})});if(!r.ok)return toast(await errMsg(r),1);e.target.reset();await loadMeta();toast('เพิ่มบัญชีแล้ว')});
$('categoryForm').addEventListener('submit',async e=>{e.preventDefault();const r=await api('/budget/admin/categories',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:$('newCategory').value,type:$('newCategoryType').value})});if(!r.ok)return toast(await errMsg(r),1);e.target.reset();await Promise.all([loadMeta(),loadCats()]);toast('เพิ่มหมวดหมู่แล้ว')});
$('userForm').addEventListener('submit',async e=>{e.preventDefault();const accounts=[...$('newUserAccount').querySelectorAll('input:checked')].map(x=>x.value);const r=await api('/budget/admin/users',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:$('newUserEmail').value,studentId:$('newStudentId').value,displayName:$('newUserName').value,accountUuids:accounts})});if(!r.ok)return toast(await errMsg(r),1);e.target.reset();await loadAdmin();toast('เปิดสิทธิ์แล้ว')});
window.addEventListener('DOMContentLoaded',init);
// ---- admin: categories (list / rename / change type / hide) ----
let cats=[];
const TYPE_LABEL={income:'เงินเข้า',expense:'เงินออก',both:'ทั้งสองประเภท'},RESERVED_CAT='เงินบริจาค';
async function loadCats(){
 let r;try{r=await api('/budget/admin/categories')}catch(e){$('catList').innerHTML=failBox('เชื่อมต่อเซิร์ฟเวอร์ไม่ได้','loadCats()');return}
 if(!r.ok){$('catList').innerHTML=failBox(await errMsg(r),'loadCats()');return}
 cats=(await r.json()).categories||[];renderCats()}
function renderCats(){
 $('catList').innerHTML=cats.map((c,i)=>{const sys=c.name===RESERVED_CAT,off=!c.active;
  return '<div class="cat-row'+(off?' off':'')+'"><div class="cm"><b>'+esc(c.name)+'</b><small><span class="pill-t '+esc(c.type)+'">'+TYPE_LABEL[c.type]+'</span> · ใช้ '+Number(c.uses||0)+' รายการ'+(off?' · ซ่อนอยู่':'')+(sys?' · หมวดหมู่ระบบ':'')+'</small></div>'
  +(sys?'':'<button class="round sm" onclick="editCat('+i+')" aria-label="แก้ไข">'+'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>'+'</button><button class="secondary small" onclick="toggleCat('+i+')">'+(off?'แสดง':'ซ่อน')+'</button>')+'</div>'}).join('')||'<div class="empty">ยังไม่มีหมวดหมู่</div>'}
function editCat(i){const c=cats[i];if(!c)return;$('catEditId').value=c.uuid;$('catEditName').value=c.name;$('catEditType').value=c.type;openModal('catEdit');setTimeout(()=>$('catEditName').focus(),250)}
async function patchCat(uuid,body){
 const r=await api('/budget/admin/categories/'+encodeURIComponent(uuid),{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
 if(!r.ok){toast(await errMsg(r),1);return false}
 await Promise.all([loadCats(),loadMeta()]);return true}
async function toggleCat(i){const c=cats[i];if(!c)return;if(await patchCat(c.uuid,{active:c.active?0:1}))toast(c.active?'ซ่อนหมวดหมู่แล้ว':'แสดงหมวดหมู่แล้ว')}
$('catEditForm').addEventListener('submit',async e=>{e.preventDefault();const b=$('catEditSave');b.disabled=true;
 try{if(await patchCat($('catEditId').value,{name:$('catEditName').value,type:$('catEditType').value})){hideModal('catEdit');toast('บันทึกหมวดหมู่แล้ว')}}finally{b.disabled=false}});


// ---- Donations ----
let donRows=[],donM='',donQ='';
const donPad=Pad({disp:$('donDisp'),hidden:$('donAmount'),pad:$('donPad'),quick:$('donQuick'),next:$('donNext'),visible:()=>curPage==='donation'&&!$('donStep1').classList.contains('hidden')&&!$('donForm').classList.contains('hidden')});
function toggleDonForm(force){const f=$('donForm'),show=force===undefined?f.classList.contains('hidden'):force;
 f.classList.toggle('hidden',!show);$('donMain').classList.toggle('hidden',show);$('fab').classList.toggle('gone',show);
 if(show){goDon(1);if(!$('donDate').value)$('donDate').value=todayStr()}window.scrollTo(0,0)}
function goDon(n){$('donStep1').classList.toggle('hidden',n!==1);$('donStep2').classList.toggle('hidden',n!==2);replay($('donStep'+n),n===2?'step-fwd':'step-back');
 if(n===2){$('donRecap').textContent='฿'+money($('donAmount').value);$('donRecapM').textContent=mLabel($('donMethod').value)}window.scrollTo(0,0)}
$('donNext').onclick=()=>{if(Number($('donAmount').value)>0)goDon(2)};
function setDonMethod(m){$('donMethod').value=m;document.querySelectorAll('[data-method]').forEach(x=>x.classList.toggle('on',x.dataset.method===m));$('donReq').textContent=m==='promptpay'?'* บังคับ':'(ไม่บังคับสำหรับเงินสด)'}
document.querySelectorAll('[data-method]').forEach(b=>b.addEventListener('click',()=>setDonMethod(b.dataset.method)));
$('donAnon').addEventListener('change',()=>{const a=$('donAnon').checked;$('donName').required=!a;$('donName').disabled=a;if(a)$('donName').value=''});
function setDonPreview(){const f=$('donFile').files[0],box=$('donPreview');if(!f){box.classList.add('hidden');box.innerHTML='';return}
 const thumb=f.type.startsWith('image/')?'<img alt="" src="'+URL.createObjectURL(f)+'">':'<div class="pdf">PDF</div>';
 box.innerHTML=thumb+'<div class="meta"><div>'+esc(f.name)+'</div><small>'+(f.size/1048576).toFixed(2)+' MB</small></div><button type="button" class="secondary small" id="donRm">ลบ</button>';box.classList.remove('hidden');$('donStatus').textContent='';
 $('donRm').onclick=()=>{$('donFile').value='';$('donCam').value='';setDonPreview()}}
$('donFile').addEventListener('change',()=>{$('donCam').value='';setDonPreview()});
$('donCam').addEventListener('change',()=>{const f=$('donCam').files[0];if(!f)return;const dt=new DataTransfer();dt.items.add(f);$('donFile').files=dt.files;setDonPreview()});
$('donForm').addEventListener('submit',async e=>{
 e.preventDefault();if(!(Number($('donAmount').value)>0)){goDon(1);return}
 const f=$('donFile').files[0],m=$('donMethod').value,st=$('donStatus');
 if(m==='promptpay'&&!f){st.textContent='กรุณาแนบสลิป PromptPay';return}
 if(f&&f.size>10*1024*1024){st.textContent='ไฟล์ต้องไม่เกิน 10 MB';return}
 $('donSave').disabled=true;st.textContent='กำลังบันทึก…';
 try{const form=new FormData();form.append('method',m);form.append('amount',$('donAmount').value);form.append('donorName',$('donName').value);if($('donAnon').checked)form.append('anonymous','1');form.append('donorContact',$('donContact').value);form.append('donatedAt',$('donDate').value);form.append('accountUuid',$('donAccount').value);form.append('note',$('donNote').value);if(f)form.append('evidence',f,f.name);
  const r=await api('/budget/donations',{method:'POST',body:form});const d=await r.json();if(!r.ok)throw new Error(d.error||'บันทึกไม่สำเร็จ');
  $('donForm').reset();donPad.reset();setDonMethod('cash');setDonPreview();$('donName').disabled=false;st.textContent='';toggleDonForm(false);
  showReceipt({transactionId:d.donation.transactionId,accountUuid:d.donation.accountUuid,type:'income',amount:d.donation.amount,details:'บริจาคโดย '+d.donation.donorName+' ('+mLabel(d.donation.method)+')',uuid:d.donation.uuid},d.verificationUrl);
  loadDonations();lastDash=0;loadDashboard()}catch(err){st.textContent=err.message}finally{$('donSave').disabled=false}});
async function loadDonations(){
 if(!donRows.length)$('donList').innerHTML='<div class="skeleton"></div><div class="skeleton"></div>';
 let r;try{r=await api('/budget/donations')}catch(e){$('donList').innerHTML=failBox('เชื่อมต่อเซิร์ฟเวอร์ไม่ได้','loadDonations()');return}if(!r.ok){$('donList').innerHTML=failBox(await errMsg(r),'loadDonations()');return}
 const d=await r.json();donRows=d.donations||[];const t=d.totals||{};
 $('donTotal').textContent='฿'+money(t.all);
 $('donPills').innerHTML='<span class="pn don">เงินสด ฿'+money(t.cash)+'</span><span class="pn don">PromptPay ฿'+money(t.promptpay)+'</span>';
 renderDonations()}
function renderDonations(){const q=donQ.trim().toLowerCase();
 const rows=donRows.filter(x=>(!donM||x.method===donM)&&(!q||String(x.donor_name).toLowerCase().includes(q)));
 lists.don=rows;$('donList').innerHTML=groupedHtml(rows,'don','donated_at')||'<div class="empty">ยังไม่มีรายการบริจาค</div>'}
$('donSearch').addEventListener('input',e=>{donQ=e.target.value;renderDonations()});
$('donChips').addEventListener('click',e=>{const b=e.target.closest('.chip');if(!b)return;donM=b.dataset.v;document.querySelectorAll('#donChips .chip').forEach(x=>x.classList.toggle('on',x===b));renderDonations()});

// ---- Admin notifications (bell + Web Push) ----
let notifTimer,notifUnread=-1,notifData=null;
function startNotifs(){$('bellBtn').classList.remove('hidden');loadNotifs();clearInterval(notifTimer);notifTimer=setInterval(()=>{if(!document.hidden)loadNotifs()},60000);document.addEventListener('visibilitychange',()=>{if(!document.hidden)loadNotifs()})}
function setBadge(n){const b=$('bellBadge');b.textContent=n>99?'99+':n;b.classList.toggle('hidden',!n);try{n?navigator.setAppBadge&&navigator.setAppBadge(n):navigator.clearAppBadge&&navigator.clearAppBadge()}catch(e){}}
async function loadNotifs(){
 let r;try{r=await api('/budget/notifications')}catch(e){return}if(!r.ok)return;
 const d=await r.json();notifData=d;
 if(notifUnread>=0&&d.unread>notifUnread&&$('notif').classList.contains('hidden')){const n=(d.notifications||[]).find(x=>x.unread);if(n)toast('🔔 '+n.title)}
 notifUnread=d.unread;setBadge(d.unread);if(!$('notif').classList.contains('hidden'))renderNotifs()}
function renderNotifs(){const d=notifData||{notifications:[]};
 $('notifList').innerHTML=(d.notifications||[]).map(n=>'<button class="notif '+(n.kind==='donation'?'donation':esc(n.type))+(n.unread?' unread':'')+'" onclick="closeNotifs();showPage(\''+(n.kind==='donation'?'donation':'audit')+'\')"><b>'+esc(n.title)+'</b><div class="nb">'+esc(n.body)+'</div><small>'+esc(fmtDate(n.created_at))+' · '+esc(n.transaction_id||'')+'</small></button>').join('')||'<div class="empty">ยังไม่มีการแจ้งเตือน</div>';
 renderPushBox()}
async function openNotifs(){$('notif').classList.remove('hidden');await loadNotifs();renderNotifs();
 if((notifData?.unread||0)>0){try{await api('/budget/notifications/read',{method:'POST'})}catch(e){}notifUnread=0;setBadge(0)}}
function closeNotifs(){hideModal('notif');if(notifData){(notifData.notifications||[]).forEach(n=>n.unread=false)}}
const b64uBytes=s=>{s=s.replace(/-/g,'+').replace(/_/g,'/');const p='='.repeat((4-s.length%4)%4),bin=atob(s+p);return Uint8Array.from(bin,c=>c.charCodeAt(0))};
async function renderPushBox(){const box=$('pushBox'),p=notifData?.push||{};
 const ios=/iphone|ipad|ipod/i.test(navigator.userAgent),standalone=matchMedia('(display-mode: standalone)').matches||navigator.standalone;
 const set=(t,btn)=>{box.innerHTML='<span>'+t+'</span>'+(btn||'');};
 if(TEST)return set('โหมดทดสอบ: ไม่มีการแจ้งเตือนบนมือถือ');
 if(!('serviceWorker' in navigator)||!('PushManager' in window)||!('Notification' in window))return set(ios&&!standalone?'iPhone: เพิ่มแอปไปยังหน้าจอโฮมก่อน จึงจะเปิดการแจ้งเตือนได้':'เบราว์เซอร์นี้ไม่รองรับการแจ้งเตือนบนมือถือ');
 if(!p.configured)return set('ยังไม่ได้ตั้งค่าการแจ้งเตือนบนมือถือบนเซิร์ฟเวอร์ (VAPID keys)');
 if(Notification.permission==='denied')return set('การแจ้งเตือนถูกบล็อก — เปิดได้ในการตั้งค่าเบราว์เซอร์/ระบบ');
 let sub=null;try{sub=await (await navigator.serviceWorker.ready).pushManager.getSubscription()}catch(e){}
 if(sub&&p.subscribed)set('เปิดการแจ้งเตือนบนอุปกรณ์นี้แล้ว','<button class="secondary small" onclick="disablePush()">ปิด</button>');
 else set('รับแจ้งเตือนบนมือถือเมื่อมีรายการใหม่ แม้ปิดแอปอยู่','<button class="primary small" onclick="enablePush()">เปิด</button>')}
async function enablePush(){
 try{const perm=await Notification.requestPermission();if(perm!=='granted')return toast('ไม่ได้รับอนุญาตการแจ้งเตือน',1);
  const reg=await navigator.serviceWorker.ready;let sub=await reg.pushManager.getSubscription();
  if(!sub)sub=await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:b64uBytes(notifData.push.publicKey)});
  const r=await api('/budget/push/subscribe',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(sub.toJSON())});
  if(!r.ok)throw new Error((await r.json()).error||'ลงทะเบียนไม่สำเร็จ');
  toast('เปิดการแจ้งเตือนแล้ว');await loadNotifs()}catch(e){toast(e.message||'เปิดการแจ้งเตือนไม่สำเร็จ',1)}}
async function disablePush(){
 try{const reg=await navigator.serviceWorker.ready,sub=await reg.pushManager.getSubscription();
  if(sub){await api('/budget/push/unsubscribe',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({endpoint:sub.endpoint})});await sub.unsubscribe()}
  toast('ปิดการแจ้งเตือนแล้ว');await loadNotifs()}catch(e){toast('ปิดไม่สำเร็จ',1)}}

// ---- PWA ----
if('serviceWorker' in navigator)addEventListener('load',()=>navigator.serviceWorker.register('/sw.js').catch(()=>{}));
let deferredInstall;
const standalone=matchMedia('(display-mode: standalone)').matches||navigator.standalone;
addEventListener('beforeinstallprompt',e=>{e.preventDefault();deferredInstall=e;if(!standalone&&!IS_MOBILE)$('installBox').classList.remove('hidden');if(!$('gate').classList.contains('hidden'))updateGate()});
$('installBtn').addEventListener('click',async()=>{if(deferredInstall){deferredInstall.prompt();await deferredInstall.userChoice;deferredInstall=null}$('installBox').classList.add('hidden')});
addEventListener('appinstalled',()=>$('installBox').classList.add('hidden'));
