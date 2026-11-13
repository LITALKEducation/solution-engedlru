(() => {
// This app has its OWN Auth0 application (SPA). Paste its Client ID below (see camps/README.md → "One Auth0 application per system").
const API='https://engedlru-api.stnetworld.workers.dev', DOMAIN=window.LOTTO_AUTH0_DOMAIN||'auth.litalkeducation.com', CLIENT=window.LOTTO_AUTH0_CLIENT_ID||'PGqozL94LzOwstm4pD39W5kvalYRiK7w', REDIRECT=location.origin+'/lotto/';   // this app's own Auth0 callback (Allowed Callback + Logout URLs must list it)
const $=id=>document.getElementById(id), esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let auth=null, scanner=null, rows=[], isAdmin=false;
function toast(s){const t=$('toast');t.textContent=s;t.classList.add('show');setTimeout(()=>t.classList.remove('show'),3000)}
async function token(){return auth.getTokenSilently()}
async function api(path,opt={}){let t=await token(),r=await fetch(API+path,{...opt,headers:{...(opt.headers||{}),Authorization:'Bearer '+t}});if(r.status===401){t=await auth.getTokenSilently({cacheMode:'off'});r=await fetch(API+path,{...opt,headers:{...(opt.headers||{}),Authorization:'Bearer '+t}})}return r}
async function data(path,opt){const r=await api(path,opt),d=await r.json().catch(()=>({error:'เกิดข้อผิดพลาด กรุณาลองใหม่'}));if(!r.ok)throw Object.assign(new Error(d.error||'เกิดข้อผิดพลาด'),{status:r.status,data:d});return d}
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
  if(!isAdmin){document.querySelector('[data-tab="students"]').classList.add('hidden');document.querySelector('[data-tab="scanners"]').classList.add('hidden');$('stats').classList.add('hidden');}
  else{await refresh();await refreshStats();}
 }catch(e){if(['login_required','missing_refresh_token','invalid_grant','consent_required','interaction_required'].includes(e.error)){$('login').classList.remove('hidden');$('account').textContent='เซสชันหมดอายุ';return}if(e.status===403){$('login').classList.remove('hidden');$('login').querySelector('p').textContent='บัญชีนี้ยังไม่มีสิทธิ์ใช้งาน ลองเปลี่ยนบัญชี หรือแจ้งแอดมิน';$('account').innerHTML='ไม่มีสิทธิ์ · <button id="logoutBtn" class="linkbtn" type="button">เปลี่ยนบัญชี</button>';$('logoutBtn').onclick=signOut}else{$('login').classList.remove('hidden');$('login').querySelector('p').textContent=e.message||'เชื่อมต่อไม่ได้ ลองใหม่อีกครั้ง';$('account').textContent='เกิดข้อผิดพลาด'}}
}
// sign out (Auth0 clears the session shared with /hr/ and /budget/) and come back through the Google account chooser
function signOut(){try{sessionStorage.setItem('chooseGoogle','1')}catch(e){}auth.logout({logoutParams:{returnTo:REDIRECT}})}
$('loginBtn').onclick=()=>{{const ap={connection:'google-oauth2'};try{if(sessionStorage.getItem('chooseGoogle')){ap.prompt='select_account';sessionStorage.removeItem('chooseGoogle')}}catch(e){}auth.loginWithRedirect({authorizationParams:ap})}};
async function refreshStats(){try{const d=await data('/camps/lotto/admin/overview');$('stats').innerHTML=[['รายชื่อทั้งหมด',d.total],['เช็คชื่อแล้ว',d.checked],['ยังไม่เช็คชื่อ',d.remaining],['เปิดของขวัญแล้ว',d.gifts||0]].map(([l,n])=>'<div class="stat"><span>'+l+'</span><b>'+n+'</b></div>').join('')}catch(e){toast(e.message)}}
async function refreshScanners(){try{const d=await data('/camps/lotto/admin/scanners');$('scannerList').innerHTML=(d.scanners||[]).length?'<table><thead><tr><th>อีเมลเจ้าหน้าที่</th><th>เพิ่มเมื่อ</th><th>จัดการ</th></tr></thead><tbody>'+d.scanners.map(x=>'<tr><td data-label="อีเมลเจ้าหน้าที่">'+esc(x.email)+'</td><td data-label="เพิ่มเมื่อ">'+esc(fmt(x.created_at))+'</td><td class="act-cell"><button class="secondary" data-remove-scanner="'+esc(x.email)+'">เอาออก</button></td></tr>').join('')+'</tbody></table>':'<p class="empty">ยังไม่มีใครในรายชื่อ</p>';$('scannerList').querySelectorAll('[data-remove-scanner]').forEach(b=>b.onclick=async()=>{if(!confirm('เอา '+b.dataset.removeScanner+' ออก?'))return;try{await data('/camps/lotto/admin/scanners/'+encodeURIComponent(b.dataset.removeScanner),{method:'DELETE'});await refreshScanners();toast('เอาออกแล้ว')}catch(e){toast(e.message)}})}catch(e){toast(e.message)}}
$('scannerForm').onsubmit=async e=>{e.preventDefault();try{await post('/camps/lotto/admin/scanners',{email:$('scannerEmail').value});$('scannerForm').reset();await refreshScanners();toast('เพิ่มแล้ว')}catch(e){toast(e.message)}};
async function refresh(q=''){try{const d=await data('/camps/lotto/admin/students'+(q?'?q='+encodeURIComponent(q):''));rows=d.students||[];renderTable('studentTable',rows,true);renderTable('verifyTable',rows,false)}catch(e){toast(e.message)}}
function renderTable(id,list,manage){const el=$(id);if(!list.length){el.innerHTML='<p class="empty">ไม่พบรายชื่อ</p>';return}
el.innerHTML='<table><thead><tr><th>รหัสนักศึกษา</th><th>ชื่อ-นามสกุล</th><th>เลขจับสลาก</th><th>สถานะ</th><th>เวลาที่สแกน</th><th>เจ้าหน้าที่</th>'+(manage?'<th>จัดการ</th>':'')+'</tr></thead><tbody>'+list.map(x=>'<tr><td data-label="รหัสนักศึกษา">'+esc(x.student_id)+'</td><td data-label="ชื่อ-นามสกุล">'+esc(x.student_name)+'</td><td data-label="เลขจับสลาก"><b>'+esc(x.draw_number)+'</b></td><td data-label="สถานะ"><span class="status '+(x.checked_at?'yes':'no')+'">'+(x.checked_at?'เช็คชื่อแล้ว':'ยังไม่เช็คชื่อ')+'</span>'+(x.gift_opened_at?' <span class="status gift" title="เปิดของขวัญแล้ว">🎁 เปิดแล้ว</span>':'')+'</td><td data-label="เวลาที่สแกน">'+esc(fmt(x.checked_at))+'</td><td data-label="เจ้าหน้าที่">'+esc(x.checked_by||'—')+'</td>'+(manage?'<td class="act-cell"><div class="actions"><button class="secondary" data-qr="'+esc(x.student_id)+'">QR</button><button class="secondary" data-edit="'+esc(x.student_id)+'">แก้ไข</button>'+(x.checked_at?'':'<button class="secondary" data-del="'+esc(x.student_id)+'">ลบ</button>')+'</div></td>':'')+'</tr>').join('')+'</tbody></table>';
el.querySelectorAll('[data-qr]').forEach(b=>b.onclick=()=>showQr(rows.find(x=>x.student_id===b.dataset.qr)));
el.querySelectorAll('[data-edit]').forEach(b=>b.onclick=()=>{const x=rows.find(x=>x.student_id===b.dataset.edit);$('studentId').value=x.student_id;$('studentName').value=x.student_name;$('drawNumber').value=x.draw_number;document.querySelector('[data-tab="students"]').click();window.scrollTo({top:0,behavior:'smooth'})});
el.querySelectorAll('[data-del]').forEach(b=>b.onclick=async()=>{if(!confirm('ลบรายชื่อนี้ใช่หรือไม่?'))return;try{await data('/camps/lotto/admin/students/'+encodeURIComponent(b.dataset.del),{method:'DELETE'});toast('ลบรายชื่อแล้ว');await refresh();await refreshStats()}catch(e){toast(e.message)}});
}
function showQr(x){if(!x)return;$('qrTitle').textContent='QR Code · '+x.student_name;$('qrCaption').textContent=x.student_id+' · เลขจับสลาก '+x.draw_number;$('qrCanvas').innerHTML='';$('qrModal').classList.remove('hidden');new QRCode($('qrCanvas'),{text:x.student_id,width:220,height:220,correctLevel:QRCode.CorrectLevel.M})}
$('closeQr').onclick=()=>$('qrModal').classList.add('hidden');$('printQr').onclick=()=>window.print();
$('studentForm').onsubmit=async e=>{e.preventDefault();try{const d=await post('/camps/lotto/admin/students',{studentId:$('studentId').value,name:$('studentName').value,drawNumber:$('drawNumber').value});toast(d.created?'เพิ่มรายชื่อแล้ว':'อัปเดตข้อมูลแล้ว');$('studentForm').reset();await refresh();await refreshStats()}catch(e){toast(e.message)}};
// ---- roster import: Excel / CSV file or pasted text ----
// RFC-4180-lite reader (quotes, "" escapes, newlines in quotes, BOM, , ; or tab) -> array of cell arrays
function readRows(text){
 const src=String(text||'').replace(/^﻿/,''),first=(src.split(/\r?\n/).find(l=>l.trim())||'');
 const cnt=c=>first.split(c).length-1,delim=cnt('\t')>0&&cnt('\t')>=Math.max(cnt(','),cnt(';'))?'\t':cnt(';')>cnt(',')?';':',';
 const rows=[];let row=[],cell='',q=false;
 const endCell=()=>{row.push(cell.normalize('NFC').replace(/[​-‍⁠﻿]/g,'').replace(/[   　]/g,' ').replace(/[ \t]+/g,' ').trim());cell=''};
 const endRow=()=>{endCell();if(row.some(c=>c!==''))rows.push(row);row=[]};
 for(let i=0;i<src.length;i++){const ch=src[i];
  if(q){if(ch==='"'){if(src[i+1]==='"'){cell+='"';i++}else q=false}else cell+=ch}
  else if(ch==='"'&&cell==='')q=true;else if(ch===delim)endCell();else if(ch==='\n')endRow();else if(ch!=='\r')cell+=ch}
 if(cell!==''||row.length)endRow();
 return rows}
const thDigits=s=>String(s||'').replace(/[๐-๙]/g,c=>String(c.charCodeAt(0)-0x0e50));
// header names (Thai or English, any order, spaces ignored); without a header the order is id, name, draw number
const HEAD={id:/^(รหัส|รหัสนักศึกษา|รหัสประจำตัว|รหัสประจำตัวนักศึกษา|เลขประจำตัว|เลขประจำตัวนักศึกษา|studentid|student_id|id|code)$/i,name:/^(ชื่อ|ชื่อ-?นามสกุล|ชื่อและนามสกุล|ชื่อสกุล|name|fullname|firstname)$/i,last:/^(นามสกุล|สกุล|lastname|surname)$/i,prefix:/^(คำนำหน้า|คำนำหน้าชื่อ|title|prefix)$/i,draw:/^(เลขจับสลาก|เลขสลาก|หมายเลขสลาก|หมายเลข|เลข|ลำดับสลาก|draw|drawnumber|draw_number|number|ticket)$/i};
function parseCsv(text){
 const rows=readRows(text);if(!rows.length)return[];
 const keyed={};rows[0].forEach((c,i)=>{const k=c.replace(/\s+/g,'');for(const n in HEAD)if(HEAD[n].test(k)&&keyed[n]===undefined)keyed[n]=i});
 const numericFirst=/^\d{6,12}$/.test(thDigits(rows[0][0]).replace(/^[a-z]{2}/i,'').replace(/@.*$/,''));
 const hasHead=!numericFirst&&Object.keys(keyed).length>=2;
 const col=hasHead?{id:keyed.id??-1,name:keyed.name??-1,last:keyed.last??-1,prefix:keyed.prefix??-1,draw:keyed.draw??-1}:{id:0,name:1,last:-1,prefix:-1,draw:2};
 return(hasHead?rows.slice(1):rows).map(c=>{
  const pre=col.prefix>=0?c[col.prefix]||'':'',last=col.last>=0?c[col.last]||'':'';
  return{studentId:thDigits(c[col.id]),name:((pre&&pre.length>4&&!/\.$/.test(pre)?pre+' ':pre)+(c[col.name]||'')+(last?' '+last:'')).trim(),drawNumber:thDigits(c[col.draw])}})}
let xlsxP=null;
function loadXlsx(){if(window.XLSX)return Promise.resolve(window.XLSX);return xlsxP||(xlsxP=new Promise((res,rej)=>{const el=document.createElement('script');el.src='/lotto/vendor/xlsx.mini.min.js';el.onload=()=>res(window.XLSX);el.onerror=()=>{xlsxP=null;rej(new Error('load'))};document.head.appendChild(el)}))}
$('csvFile').onchange=async e=>{
 const f=e.target.files&&e.target.files[0];if(!f)return;
 if(f.size>5*1024*1024){toast('ไฟล์ใหญ่เกิน 5 MB');e.target.value='';return}
 const buf=await f.arrayBuffer(),u8=new Uint8Array(buf,0,Math.min(4,buf.byteLength));let text;
 const isExcel=/\.(xlsx|xls)$/i.test(f.name)||(u8[0]===0x50&&u8[1]===0x4b)||(u8[0]===0xd0&&u8[1]===0xcf);
 if(isExcel){try{const X=await loadXlsx(),wb=X.read(buf,{type:'array'}),ws=wb.Sheets[wb.SheetNames[0]];if(!ws)throw new Error('empty');text=X.utils.sheet_to_csv(ws,{FS:',',RS:'\n',blankrows:false})}catch(err){toast('อ่านไฟล์ไม่ได้ ลองบันทึกเป็น .xlsx หรือ CSV แล้วเลือกใหม่');e.target.value='';return}}
 else if(u8[0]===0xff&&u8[1]===0xfe)text=new TextDecoder('utf-16le').decode(buf);
 else if(u8[0]===0xfe&&u8[1]===0xff)text=new TextDecoder('utf-16be').decode(buf);
 else{try{text=new TextDecoder('utf-8',{fatal:true}).decode(buf)}catch(x){try{text=new TextDecoder('windows-874').decode(buf)}catch(y){text=new TextDecoder().decode(buf)}}}
 $('csvInput').value=text;const n=parseCsv(text).length;$('csvName').textContent=f.name+' · '+n+' รายชื่อ — ตรวจสอบแล้วกด “นำเข้ารายชื่อ”';$('importRes').textContent='';e.target.value=''};
$('tplBtn').onclick=async()=>{try{const X=await loadXlsx(),ws=X.utils.aoa_to_sheet([['รหัสนักศึกษา','ชื่อ-นามสกุล','เลขจับสลาก'],['6740102220','สมชาย ใจดี','001'],['6840100001','สมหญิง รักเรียน','002']]);ws['!cols']=[{wch:16},{wch:26},{wch:14}];const wb=X.utils.book_new();X.utils.book_append_sheet(wb,ws,'รายชื่อ');X.writeFile(wb,'lotto-students-template.xlsx')}catch(e){toast('ดาวน์โหลดไม่สำเร็จ ลองใหม่อีกครั้ง')}};
$('importBtn').onclick=async()=>{const btn=$('importBtn');try{
 const students=parseCsv($('csvInput').value);if(!students.length){toast('เลือกไฟล์หรือวางรายชื่อก่อน');return}
 if(students.length>1000){toast('นำเข้าได้ครั้งละไม่เกิน 1,000 รายชื่อ');return}
 btn.disabled=true;const d=await post('/camps/lotto/admin/students/import',{students});
 $('importRes').innerHTML='✓ นำเข้าสำเร็จ <b>'+d.imported+'</b> รายชื่อ'+(d.errors.length?' · ข้าม <b>'+d.errors.length+'</b> แถว:<div class="err">'+d.errors.slice(0,30).map(x=>'แถว '+esc(x.row||x.studentId||'')+': '+esc(x.error)).join('<br>')+'</div>':'');
 toast('นำเข้าสำเร็จ '+d.imported+' รายชื่อ'+(d.errors.length?' · ผิดพลาด '+d.errors.length+' แถว':''));
 if(!d.errors.length){$('csvInput').value='';$('csvName').textContent=''}
 await refresh();await refreshStats()}catch(e){toast(e.message)}finally{btn.disabled=false}};
let cameraScan=false;
async function handleScan(value,fromCamera){cameraScan=!!fromCamera;const id=String(value||'').trim();$('scanId').value=id;try{const d=await post('/camps/lotto/admin/scan',{studentId:id});showScanResult(d.student,false,d.picture)}catch(e){if(e.status===409&&e.data?.student)showScanResult(e.data.student,true,e.data.picture);else{$('scanResult').className='result error';$('scanResult').textContent=e.message;showPopup({kind:'error',message:e.message,id});toast(e.message)}}}
function showScanResult(x,duplicate,picture){$('scanResult').className='result '+(duplicate?'duplicate':'success');$('scanResult').innerHTML='<b>'+(duplicate?'สแกนไปแล้ว':'เช็คชื่อสำเร็จ')+'</b>'+esc(x.student_name)+'<small>รหัส '+esc(x.student_id)+' · เลขจับสลาก '+esc(x.draw_number)+'</small><small>เวลา '+esc(fmt(x.checked_at))+' · เจ้าหน้าที่ '+esc(x.checked_by)+'</small>';showPopup({kind:duplicate?'duplicate':'success',student:x,picture});if(isAdmin){refreshStats();refresh($('search').value)}}
// popup after every scan: the draw number in huge type + the student's Auth0 (Google) photo
function showPopup({kind,student,picture,message,id,banner,giftClosed}){
 const m=$('scanModal');m.classList.remove('hidden','success','duplicate','error','checked','unchecked');m.classList.add(kind);$('spAction').classList.add('hidden');$('spAction').onclick=null;$('giftBtn').classList.add('hidden');$('giftBtn').classList.remove('opening');$('giftBtn').onclick=null;$('spNumber').classList.remove('hidden','reveal');$('spLabel').classList.remove('hidden');$('spLabel').textContent='เลขจับสลาก';
 const num=$('spNumber');
 if(kind==='error'){$('spBanner').textContent=banner||(m.dataset.verify==='1'?'✕ ตรวจสอบไม่ได้':'✕ สแกนไม่สำเร็จ');$('spName').textContent=message||'เกิดข้อผิดพลาด';$('spMeta').textContent=id?'รหัสที่สแกน: '+id:'';num.textContent='';$('spAvatar').innerHTML='';}
 else{
  $('spBanner').textContent=({duplicate:'! สแกนไปแล้ว',checked:'✕ เช็คชื่อไปแล้ว',unchecked:'✓ ยังไม่ได้เช็คชื่อ'})[kind]||'✓ เช็คชื่อสำเร็จ';
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
// camera + manual input, used by both the check-in tab and the verify tab
let restartCam=null;
function closePopup(){const m=$('scanModal');m.classList.add('hidden');const r=restartCam;restartCam=null;if(r)r();}
$('spClose').onclick=closePopup;
$('scanModal').addEventListener('click',e=>{if(e.target===$('scanModal'))closePopup()});
document.addEventListener('keydown',e=>{if(!$('scanModal').classList.contains('hidden')&&(e.key==='Escape'||(e.key==='Enter'&&e.target.id!=='giftBtn')))closePopup()});
const stoppers=[];
function bindScanner({readerId,startId,stopId,inputId,goId,view,onValue}){
 let cam=null;
 const show=(on)=>{$(startId).classList.toggle('hidden',on);$(stopId).classList.toggle('hidden',!on)};
 const stop=async()=>{if(cam){try{await cam.stop()}catch(e){}cam=null}show(false)};
 stoppers.push(stop);
 $(goId).onclick=()=>onValue($(inputId).value,false);$(inputId).addEventListener('keydown',e=>{if(e.key==='Enter')onValue(e.target.value,false)});
 $(startId).onclick=async()=>{if(!window.Html5Qrcode){toast('โหลดตัวสแกนไม่สำเร็จ ลองรีเฟรชหน้า');return}
  try{cam=new Html5Qrcode(readerId);await cam.start({facingMode:'environment'},{fps:10,qrbox:{width:240,height:240}},async text=>{await stop();restartCam=()=>{if(!$(view).classList.contains('hidden'))$(startId).click()};await onValue(text,true)},()=>{});show(true)}
  catch(e){toast('เปิดกล้องไม่ได้ ลองอนุญาตกล้อง หรือกรอกรหัสแทน')}};
 $(stopId).onclick=stop;
}
function setVerifyMode(on){$('scanModal').dataset.verify=on?'1':''}
bindScanner({readerId:'reader',startId:'startScan',stopId:'stopScan',inputId:'scanId',goId:'manualScan',view:'view-scan',onValue:(v,cam)=>{setVerifyMode(false);return handleScan(v,cam)}});
bindScanner({readerId:'vReader',startId:'vStart',stopId:'vStop',inputId:'vId',goId:'vGo',view:'view-verify',onValue:(v,cam)=>{setVerifyMode(true);return $('vAuto').checked?handleVerifyAuto(v,cam):handleVerify(v,cam)}});
$('vAuto').onchange=()=>{$('vModePill').textContent=$('vAuto').checked?'เช็คชื่อ + ของขวัญ':'ตรวจสอบเท่านั้น'};
// scan -> found in the database? -> check in -> tap the gift box to reveal the draw number
async function handleVerifyAuto(value,fromCamera){
 const id=String(value||'').trim();$('vId').value=id;const box=$('vResult');
 try{
  let first=false,student,picture;
  try{const d=await post('/camps/lotto/admin/scan',{studentId:id});student=d.student;picture=d.picture;first=true}
  catch(e){if(e.status===409&&e.data?.student){student=e.data.student;picture=e.data.picture}else throw e}
  presentGift(student,picture,first);
  if(isAdmin){refreshStats();refresh($('search').value)}
 }catch(e){const nf=e.status===404;box.className='result error';box.textContent=e.message;showPopup({kind:'error',message:e.message,id,banner:nf?'✕ ไม่พบรายชื่อนี้':null});toast(e.message)}
}
function giftCard(x,opened,first){
 const box=$('vResult');box.className='result '+(opened||!first?'duplicate':'success');
 box.innerHTML='<b>พบรายชื่อ · '+(first?'เช็คชื่อสำเร็จ':'เช็คชื่อไปแล้ว')+(opened?' · เปิดของขวัญแล้ว':' · ยังไม่เปิดของขวัญ')+'</b>'+esc(x.student_name)+'<small>รหัส '+esc(x.student_id)+(opened?' · เลขจับสลาก '+esc(x.draw_number):'')+'</small>'+(x.checked_at?'<small>เช็คชื่อ '+esc(fmt(x.checked_at))+' · '+esc(x.checked_by||'—')+'</small>':'')+(opened?'<small>เปิดของขวัญ '+esc(fmt(x.gift_opened_at))+' · '+esc(x.gift_opened_by||'—')+'</small>':'')}
function presentGift(student,picture,first){
 const opened=!!student.gift_opened_at;
 giftCard(student,opened,first);
 showPopup({kind:opened||!first?'duplicate':'success',student,picture,giftClosed:!opened,banner:opened?'🎁 เปิดของขวัญไปแล้ว · เช็คชื่อแล้ว':first?'✓ พบรายชื่อ · เช็คชื่อสำเร็จ':'! พบรายชื่อ · เช็คชื่อไปแล้ว (ยังไม่เปิดของขวัญ)'});
 if(opened){$('spMeta').textContent='รหัส '+student.student_id+' · เปิดเมื่อ '+fmt(student.gift_opened_at)+' โดย '+(student.gift_opened_by||'—')}
 else{$('spMeta').textContent='รหัส '+student.student_id;const g=$('giftBtn');g.disabled=false;g.focus();g.onclick=async()=>{g.disabled=true;
  try{const d=await post('/camps/lotto/scanner/gift/open',{studentId:student.student_id});g.classList.add('opening');
   setTimeout(()=>{g.classList.add('hidden');const n=String(d.student.draw_number||'');const num=$('spNumber');num.textContent=n;num.className='sp-number reveal'+(n.length>8?' xlong':n.length>5?' long':'');$('spLabel').classList.remove('hidden');$('spLabel').textContent='🎉 เลขจับสลากของคุณ';
    $('spBanner').textContent=d.firstTime?'🎁 เปิดของขวัญแล้ว!':'🎁 เปิดของขวัญไปแล้ว';$('spMeta').textContent='รหัส '+d.student.student_id+' · เปิดเมื่อ '+fmt(d.student.gift_opened_at)+' โดย '+(d.student.gift_opened_by||'—');giftCard(d.student,true,first);$('spClose').focus();if(isAdmin){refreshStats();refresh($('search').value)}},650)}
  catch(e){g.disabled=false;toast(e.message)}}}
}
// read-only: is this QR already checked in?
async function handleVerify(value,fromCamera){
 const id=String(value||'').trim();$('vId').value=id;const box=$('vResult');
 try{
  const d=await data('/camps/lotto/scanner/verify?studentId='+encodeURIComponent(id)),x=d.student;
  box.className='result '+(d.checked?'checked':'unchecked');
  box.innerHTML='<b>'+(d.checked?'เช็คชื่อไปแล้ว':'ยังไม่ได้เช็คชื่อ')+'</b>'+esc(x.student_name)+'<small>รหัส '+esc(x.student_id)+' · เลขจับสลาก '+esc(x.draw_number)+'</small>'+(d.checked?'<small>เวลา '+esc(fmt(x.checked_at))+' · เจ้าหน้าที่ '+esc(x.checked_by||'—')+'</small>':'');
  showPopup({kind:d.checked?'checked':'unchecked',student:x,picture:d.picture});
  if(!d.checked){const act=$('spAction');act.classList.remove('hidden');act.onclick=async()=>{act.disabled=true;try{$('scanModal').classList.add('hidden');restartCam=null;setVerifyMode(false);await handleScan(x.student_id,false);await handleVerify(x.student_id,false)}finally{act.disabled=false}}}
 }catch(e){box.className='result error';box.textContent=e.message;showPopup({kind:'error',message:e.message,id});toast(e.message)}
}
$('refresh').onclick=()=>refresh($('search').value);$('search').oninput=()=>{clearTimeout(window.__searchTimer);window.__searchTimer=setTimeout(()=>refresh($('search').value),250)};$('verifyBtn').onclick=async()=>{if(isAdmin){await refresh($('verifySearch').value);return}try{const d=await data('/camps/lotto/scanner/lookup?q='+encodeURIComponent($('verifySearch').value));renderTable('verifyTable',d.students||[],false)}catch(e){toast(e.message)}};
document.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>{stoppers.forEach(f=>f());document.querySelectorAll('[data-tab]').forEach(x=>x.classList.toggle('active',x===b));document.querySelectorAll('.view').forEach(x=>x.classList.add('hidden'));$('view-'+b.dataset.tab).classList.remove('hidden');if(b.dataset.tab==='verify'){if(isAdmin)refresh($('verifySearch').value);else $('verifyBtn').click()}if(b.dataset.tab==='scanners')refreshScanners()});
init();
})();
