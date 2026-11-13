(() => {
// This system has its OWN Auth0 application (SPA) and callback /qrcheck/. Paste its Client ID below (see camps/README.md → "One Auth0 application per system").
const API='https://engedlru-api.stnetworld.workers.dev', DOMAIN=window.QRCHECK_AUTH0_DOMAIN||'auth.litalkeducation.com', CLIENT=window.QRCHECK_AUTH0_CLIENT_ID||'PGqozL94LzOwstm4pD39W5kvalYRiK7w', REDIRECT=location.origin+'/qrcheck/';   // Allowed Callback + Logout URLs must list it
const $=id=>document.getElementById(id), esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let auth=null, isAdmin=false;
function toast(s){const t=$('toast');t.textContent=s;t.classList.add('show');setTimeout(()=>t.classList.remove('show'),3000)}
async function token(){return auth.getTokenSilently()}
async function api(path,opt={}){let t=await token(),r=await fetch(API+path,{...opt,headers:{...(opt.headers||{}),Authorization:'Bearer '+t}});if(r.status===401){t=await auth.getTokenSilently({cacheMode:'off'});r=await fetch(API+path,{...opt,headers:{...(opt.headers||{}),Authorization:'Bearer '+t}})}return r}
async function data(path,opt){const r=await api(path,opt),d=await r.json().catch(()=>({error:'ตอบกลับจากเซิร์ฟเวอร์ไม่ถูกต้อง'}));if(!r.ok)throw Object.assign(new Error(d.error||'เกิดข้อผิดพลาด'),{status:r.status,data:d});return d}
const post=(path,body)=>data(path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
function fmt(s){return s?new Date(s.replace(' ','T')+'Z').toLocaleString('th-TH',{dateStyle:'medium',timeStyle:'short'}):'—'}
async function init(){
 try{
  auth=await auth0.createAuth0Client({domain:DOMAIN,clientId:CLIENT,cacheLocation:'localstorage',useRefreshTokens:true,authorizationParams:{redirect_uri:REDIRECT}});
  if(location.search.includes('code=')||location.search.includes('error=')){try{await auth.handleRedirectCallback()}finally{history.replaceState({},document.title,REDIRECT)}}
  if(!await auth.isAuthenticated()){$('login').classList.remove('hidden');$('account').textContent='ยังไม่ได้เข้าสู่ระบบ';return}
  const u=await auth.getUser();$('account').innerHTML=esc(u.email||'เข้าสู่ระบบแล้ว')+' · <button id="logoutBtn" class="linkbtn" type="button">ออก</button>';$('logoutBtn').onclick=signOut;
  const access=await data('/camps/lotto/scanner/me'); isAdmin=!!access.isAdmin;
  $('login').classList.add('hidden');$('app').classList.remove('hidden');
  if(isAdmin)refreshStats();else $('stats').classList.add('hidden');
 }catch(e){
  if(['login_required','missing_refresh_token','invalid_grant','consent_required','interaction_required'].includes(e.error)){$('login').classList.remove('hidden');$('account').textContent='เซสชันหมดอายุ';return}
  $('login').classList.remove('hidden');
  if(e.status===403){$('login').querySelector('p').textContent='บัญชีนี้ยังไม่ได้รับมอบหมายให้เป็นเจ้าหน้าที่สแกน หรือไม่มีสิทธิ์ผู้ดูแล';$('account').innerHTML='ไม่มีสิทธิ์ · <button id="logoutBtn" class="linkbtn" type="button">เปลี่ยนบัญชี</button>';$('logoutBtn').onclick=signOut}
  else{$('login').querySelector('p').textContent=e.message||'ไม่สามารถเชื่อมต่อระบบได้';$('account').textContent='เกิดข้อผิดพลาด'}}
}
// sign out and come back through the Google account chooser
function signOut(){try{sessionStorage.setItem('chooseGoogle','1')}catch(e){}auth.logout({logoutParams:{returnTo:REDIRECT}})}
$('loginBtn').onclick=()=>{const ap={connection:'google-oauth2'};try{if(sessionStorage.getItem('chooseGoogle')){ap.prompt='select_account';sessionStorage.removeItem('chooseGoogle')}}catch(e){}auth.loginWithRedirect({authorizationParams:ap})};
async function refreshStats(){try{const d=await data('/camps/lotto/admin/overview');$('stats').innerHTML=[['รายชื่อทั้งหมด',d.total],['เช็คชื่อแล้ว',d.checked],['ยังไม่เช็คชื่อ',d.remaining],['เปิดของขวัญแล้ว',d.gifts||0]].map(([l,n])=>'<div class="stat"><span>'+l+'</span><b>'+n+'</b></div>').join('')}catch(e){/* stats are optional */}}
// popup after every scan: the draw number in huge type + the student's Auth0 (Google) photo
function showPopup({kind,student,picture,message,id,banner,giftClosed}){
 const m=$('scanModal');m.classList.remove('hidden','success','duplicate','error','checked','unchecked');m.classList.add(kind);$('spAction').classList.add('hidden');$('spAction').onclick=null;$('giftBtn').classList.add('hidden');$('giftBtn').classList.remove('opening');$('giftBtn').onclick=null;$('spNumber').classList.remove('hidden','reveal');$('spLabel').classList.remove('hidden');$('spLabel').textContent='เลขจับสลาก';
 const num=$('spNumber');
 if(kind==='error'){$('spBanner').textContent=banner||('✕ ตรวจสอบไม่ได้');$('spName').textContent=message||'เกิดข้อผิดพลาด';$('spMeta').textContent=id?'รหัสที่สแกน: '+id:'';num.textContent='';$('spAvatar').innerHTML='';}
 else{
  $('spBanner').textContent=({duplicate:'! สแกนไปแล้ว · ตัดสิทธิ์แล้ว',checked:'✕ เช็คแล้ว · ตัดสิทธิ์แล้ว',unchecked:'✓ ยังไม่ได้เช็ค · ใช้สิทธิ์ได้'})[kind]||'✓ ตรวจสอบสำเร็จ · ตัดสิทธิ์แล้ว';
  const n=String(student.draw_number||'');num.textContent=n;num.className='sp-number'+(n.length>8?' xlong':n.length>5?' long':'');
  if(banner)$('spBanner').textContent=banner;
  if(giftClosed){$('giftBtn').classList.remove('hidden');num.classList.add('hidden');$('spLabel').classList.add('hidden')}
  $('spName').textContent=student.student_name;
  $('spMeta').textContent='รหัส '+student.student_id+(kind==='duplicate'||kind==='checked'?' · สแกนเมื่อ '+fmt(student.checked_at)+' โดย '+(student.checked_by||'—'):'');
  const av=$('spAvatar');av.innerHTML='';const initial=[...String(student.student_name||'?').replace(/^(นางสาว|นาย|นาง|น\.ส\.|เด็กชาย|เด็กหญิง)\s*/,'')][0]||'?';
  if(picture){const img=new Image();img.alt='';img.referrerPolicy='no-referrer';img.onerror=()=>{av.textContent=initial};img.src=picture;av.appendChild(img)}else av.textContent=initial;
 }
 $('spClose').focus();
}
// camera + manual input
let restartCam=null;
function closePopup(){const m=$('scanModal');m.classList.add('hidden');const r=restartCam;restartCam=null;if(r)r();else $('scanId').focus()}
$('spClose').onclick=closePopup;
$('scanModal').addEventListener('click',e=>{if(e.target===$('scanModal'))closePopup()});
document.addEventListener('keydown',e=>{if(!$('scanModal').classList.contains('hidden')&&(e.key==='Escape'||(e.key==='Enter'&&e.target.id!=='giftBtn')))closePopup()});
let cam=null;
const showCam=(on)=>{$('startScan').classList.toggle('hidden',on);$('stopScan').classList.toggle('hidden',!on)};
const stopCam=async()=>{if(cam){try{await cam.stop()}catch(e){}cam=null}showCam(false)};
async function onValue(v,fromCamera){const id=String(v||'').trim();return $('vAuto').checked?handleVerifyAuto(id,fromCamera):handleVerify(id,fromCamera)}
$('manualScan').onclick=()=>onValue($('scanId').value,false);$('scanId').addEventListener('keydown',e=>{if(e.key==='Enter')onValue(e.target.value,false)});
$('startScan').onclick=async()=>{if(!window.Html5Qrcode){toast('โหลดเครื่องมือสแกนไม่สำเร็จ กรุณารีเฟรช');return}
 try{cam=new Html5Qrcode('reader');await cam.start({facingMode:'environment'},{fps:10,qrbox:{width:240,height:240}},async text=>{await stopCam();restartCam=()=>$('startScan').click();await onValue(text,true)},()=>{});showCam(true)}
 catch(e){toast('เปิดกล้องไม่ได้ กรุณาอนุญาตการใช้กล้องหรือกรอกรหัสแทน')}};
$('stopScan').onclick=stopCam;
$('vAuto').onchange=()=>{$('modePill').textContent=$('vAuto').checked?'เช็คชื่อ + ของขวัญ':'ตรวจสอบเท่านั้น'};
// scan -> found in the database? -> check in -> tap the gift box to reveal the draw number
async function handleVerifyAuto(value,fromCamera){
 const id=String(value||'').trim();$('scanId').value=id;const box=$('scanResult');
 try{
  let first=false,student,picture;
  try{const d=await post('/camps/lotto/admin/scan',{studentId:id});student=d.student;picture=d.picture;first=true}
  catch(e){if(e.status===409&&e.data?.student){student=e.data.student;picture=e.data.picture}else throw e}
  presentGift(student,picture,first);
  if(isAdmin)refreshStats();
 }catch(e){const nf=e.status===404;box.className='result error';box.textContent=e.message;showPopup({kind:'error',message:e.message,id,banner:nf?'✕ ไม่พบในฐานข้อมูล':null});toast(e.message)}
}
function giftCard(x,opened,first){
 const box=$('scanResult');box.className='result '+(opened||!first?'duplicate':'success');
 box.innerHTML='<b>พบในฐานข้อมูล · '+(first?'เช็คชื่อสำเร็จ':'เช็คชื่อไปแล้ว')+(opened?' · เปิดของขวัญแล้ว':' · ยังไม่เปิดของขวัญ')+'</b>'+esc(x.student_name)+'<small>รหัส '+esc(x.student_id)+(opened?' · เลขจับสลาก '+esc(x.draw_number):'')+'</small>'+(x.checked_at?'<small>เช็คชื่อ '+esc(fmt(x.checked_at))+' · '+esc(x.checked_by||'—')+'</small>':'')+(opened?'<small>เปิดของขวัญ '+esc(fmt(x.gift_opened_at))+' · '+esc(x.gift_opened_by||'—')+'</small>':'')}
function presentGift(student,picture,first){
 const opened=!!student.gift_opened_at;
 giftCard(student,opened,first);
 showPopup({kind:opened||!first?'duplicate':'success',student,picture,giftClosed:!opened,banner:opened?'🎁 เปิดของขวัญไปแล้ว · เช็คชื่อแล้ว':first?'✓ พบในฐานข้อมูล · เช็คชื่อสำเร็จ':'! พบในฐานข้อมูล · เช็คชื่อไปแล้ว (ยังไม่เปิดของขวัญ)'});
 if(opened){$('spMeta').textContent='รหัส '+student.student_id+' · เปิดเมื่อ '+fmt(student.gift_opened_at)+' โดย '+(student.gift_opened_by||'—')}
 else{$('spMeta').textContent='รหัส '+student.student_id;const g=$('giftBtn');g.disabled=false;g.focus();g.onclick=async()=>{g.disabled=true;
  try{const d=await post('/camps/lotto/scanner/gift/open',{studentId:student.student_id});g.classList.add('opening');
   setTimeout(()=>{g.classList.add('hidden');const n=String(d.student.draw_number||'');const num=$('spNumber');num.textContent=n;num.className='sp-number reveal'+(n.length>8?' xlong':n.length>5?' long':'');$('spLabel').classList.remove('hidden');$('spLabel').textContent='🎉 เลขจับสลากของคุณ';
    $('spBanner').textContent=d.firstTime?'🎁 เปิดของขวัญแล้ว!':'🎁 เปิดของขวัญไปแล้ว';$('spMeta').textContent='รหัส '+d.student.student_id+' · เปิดเมื่อ '+fmt(d.student.gift_opened_at)+' โดย '+(d.student.gift_opened_by||'—');giftCard(d.student,true,first);$('spClose').focus();if(isAdmin)refreshStats();},650)}
  catch(e){g.disabled=false;toast(e.message)}}}
}
// read-only: is this QR already checked in?
async function handleVerify(value,fromCamera){
 const id=String(value||'').trim();$('scanId').value=id;const box=$('scanResult');
 try{
  const d=await data('/camps/lotto/scanner/verify?studentId='+encodeURIComponent(id)),x=d.student;
  box.className='result '+(d.checked?'checked':'unchecked');
  box.innerHTML='<b>'+(d.checked?'เช็คแล้ว · ตัดสิทธิ์แล้ว':'ยังไม่ได้เช็ค · ใช้สิทธิ์ได้')+'</b>'+esc(x.student_name)+'<small>รหัส '+esc(x.student_id)+' · เลขจับสลาก '+esc(x.draw_number)+'</small>'+(d.checked?'<small>เวลา '+esc(fmt(x.checked_at))+' · เจ้าหน้าที่ '+esc(x.checked_by||'—')+'</small>':'');
  showPopup({kind:d.checked?'checked':'unchecked',student:x,picture:d.picture});
  if(!d.checked){const act=$('spAction');act.classList.remove('hidden');act.onclick=async()=>{act.disabled=true;try{$('scanModal').classList.add('hidden');restartCam=null;await handleVerifyAuto(x.student_id,false)}finally{act.disabled=false}}}
 }catch(e){box.className='result error';box.textContent=e.message;showPopup({kind:'error',message:e.message,id});toast(e.message)}
}
init();
})();
