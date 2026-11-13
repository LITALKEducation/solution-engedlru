(() => {
// This app has its OWN Auth0 application (SPA). Paste its Client ID below (see camps/README.md → "One Auth0 application per system").
const API='https://engedlru-api.stnetworld.workers.dev', DOMAIN=window.LOTTO_AUTH0_DOMAIN||'auth.litalkeducation.com', CLIENT=window.LOTTO_AUTH0_CLIENT_ID||'PGqozL94LzOwstm4pD39W5kvalYRiK7w', REDIRECT=location.origin+'/lotto/';   // this app's own Auth0 callback (Allowed Callback + Logout URLs must list it)
const $=id=>document.getElementById(id), esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let auth=null, rows=[], isAdmin=false;
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
  if(!isAdmin){   // scan-only officers work in the QR check system, this page is for admins
   $('login').classList.remove('hidden');$('loginBtn').classList.add('hidden');
   $('login').innerHTML='<h2>บัญชีนี้เป็นเจ้าหน้าที่สแกน</h2><p>การสแกน QR และเช็คชื่ออยู่ที่ระบบเช็ค QR หน้านี้สำหรับผู้ดูแลจัดการรายชื่อ</p><a class="primary btnlink" href="/qrcheck/">ไปที่ระบบเช็ค QR ›</a>';return}
  $('login').classList.add('hidden');$('app').classList.remove('hidden');
  await refresh();await refreshStats();
 }catch(e){if(['login_required','missing_refresh_token','invalid_grant','consent_required','interaction_required'].includes(e.error)){$('login').classList.remove('hidden');$('account').textContent='เซสชันหมดอายุ';return}if(e.status===403){$('login').classList.remove('hidden');$('login').querySelector('p').textContent='บัญชีนี้ยังไม่ได้รับมอบหมายให้เป็นเจ้าหน้าที่สแกน หรือไม่มีสิทธิ์ผู้ดูแล';$('account').innerHTML='ไม่มีสิทธิ์ · <button id="logoutBtn" class="linkbtn" type="button">เปลี่ยนบัญชี</button>';$('logoutBtn').onclick=signOut}else{$('login').classList.remove('hidden');$('login').querySelector('p').textContent=e.message||'ไม่สามารถเชื่อมต่อระบบได้';$('account').textContent='เกิดข้อผิดพลาด'}}
}
// sign out (Auth0 clears the session shared with /hr/ and /budget/) and come back through the Google account chooser
function signOut(){try{sessionStorage.setItem('chooseGoogle','1')}catch(e){}auth.logout({logoutParams:{returnTo:REDIRECT}})}
$('loginBtn').onclick=()=>{{const ap={connection:'google-oauth2'};try{if(sessionStorage.getItem('chooseGoogle')){ap.prompt='select_account';sessionStorage.removeItem('chooseGoogle')}}catch(e){}auth.loginWithRedirect({authorizationParams:ap})}};
async function refreshStats(){try{const d=await data('/camps/lotto/admin/overview');$('stats').innerHTML=[['รายชื่อทั้งหมด',d.total],['เช็คชื่อแล้ว',d.checked],['ยังไม่เช็คชื่อ',d.remaining],['เปิดของขวัญแล้ว',d.gifts||0]].map(([l,n])=>'<div class="stat"><span>'+l+'</span><b>'+n+'</b></div>').join('')}catch(e){toast(e.message)}}
async function refreshScanners(){try{const d=await data('/camps/lotto/admin/scanners');$('scannerList').innerHTML=(d.scanners||[]).length?'<table><thead><tr><th>อีเมลเจ้าหน้าที่</th><th>เพิ่มเมื่อ</th><th>จัดการ</th></tr></thead><tbody>'+d.scanners.map(x=>'<tr><td data-label="อีเมลเจ้าหน้าที่">'+esc(x.email)+'</td><td data-label="เพิ่มเมื่อ">'+esc(fmt(x.created_at))+'</td><td class="act-cell"><button class="secondary" data-remove-scanner="'+esc(x.email)+'">ถอนสิทธิ์</button></td></tr>').join('')+'</tbody></table>':'<p class="empty">ยังไม่มีเจ้าหน้าที่ที่ได้รับมอบหมาย</p>';$('scannerList').querySelectorAll('[data-remove-scanner]').forEach(b=>b.onclick=async()=>{if(!confirm('ถอนสิทธิ์ '+b.dataset.removeScanner+' ?'))return;try{await data('/camps/lotto/admin/scanners/'+encodeURIComponent(b.dataset.removeScanner),{method:'DELETE'});await refreshScanners();toast('ถอนสิทธิ์แล้ว')}catch(e){toast(e.message)}})}catch(e){toast(e.message)}}
$('scannerForm').onsubmit=async e=>{e.preventDefault();try{await post('/camps/lotto/admin/scanners',{email:$('scannerEmail').value});$('scannerForm').reset();await refreshScanners();toast('เพิ่มเจ้าหน้าที่แล้ว')}catch(e){toast(e.message)}};
async function refresh(q=''){try{const d=await data('/camps/lotto/admin/students'+(q?'?q='+encodeURIComponent(q):''));rows=d.students||[];renderTable('studentTable',rows,true);renderTable('verifyTable',rows,false)}catch(e){toast(e.message)}}
function renderTable(id,list,manage){const el=$(id);if(!list.length){el.innerHTML='<p class="empty">ไม่พบรายชื่อ</p>';return}
el.innerHTML='<table><thead><tr><th>รหัสนักศึกษา</th><th>ชื่อ-นามสกุล</th><th>เลขจับสลาก</th><th>สถานะ</th><th>เวลาที่สแกน</th><th>เจ้าหน้าที่</th>'+(manage?'<th>จัดการ</th>':'')+'</tr></thead><tbody>'+list.map(x=>'<tr><td data-label="รหัสนักศึกษา">'+esc(x.student_id)+'</td><td data-label="ชื่อ-นามสกุล">'+esc(x.student_name)+'</td><td data-label="เลขจับสลาก"><b>'+esc(x.draw_number)+'</b></td><td data-label="สถานะ"><span class="status '+(x.checked_at?'yes':'no')+'">'+(x.checked_at?'ตัดสิทธิ์แล้ว':'ยังไม่ตัดสิทธิ์')+'</span>'+(x.gift_opened_at?' <span class="status gift" title="เปิดของขวัญแล้ว">🎁 เปิดแล้ว</span>':'')+'</td><td data-label="เวลาที่สแกน">'+esc(fmt(x.checked_at))+'</td><td data-label="เจ้าหน้าที่">'+esc(x.checked_by||'—')+'</td>'+(manage?'<td class="act-cell"><div class="actions"><button class="secondary" data-qr="'+esc(x.student_id)+'">QR</button><button class="secondary" data-edit="'+esc(x.student_id)+'">แก้ไข</button>'+(x.checked_at?'':'<button class="secondary" data-del="'+esc(x.student_id)+'">ลบ</button>')+'</div></td>':'')+'</tr>').join('')+'</tbody></table>';
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
 if(isExcel){try{const X=await loadXlsx(),wb=X.read(buf,{type:'array'}),ws=wb.Sheets[wb.SheetNames[0]];if(!ws)throw new Error('empty');text=X.utils.sheet_to_csv(ws,{FS:',',RS:'\n',blankrows:false})}catch(err){toast('อ่านไฟล์ Excel ไม่ได้ ลองบันทึกเป็น .xlsx หรือ CSV อีกครั้ง');e.target.value='';return}}
 else if(u8[0]===0xff&&u8[1]===0xfe)text=new TextDecoder('utf-16le').decode(buf);
 else if(u8[0]===0xfe&&u8[1]===0xff)text=new TextDecoder('utf-16be').decode(buf);
 else{try{text=new TextDecoder('utf-8',{fatal:true}).decode(buf)}catch(x){try{text=new TextDecoder('windows-874').decode(buf)}catch(y){text=new TextDecoder().decode(buf)}}}
 $('csvInput').value=text;const n=parseCsv(text).length;$('csvName').textContent=f.name+' · '+n+' รายชื่อ — ตรวจสอบแล้วกด “นำเข้ารายชื่อ”';$('importRes').textContent='';e.target.value=''};
$('tplBtn').onclick=async()=>{try{const X=await loadXlsx(),ws=X.utils.aoa_to_sheet([['รหัสนักศึกษา','ชื่อ-นามสกุล','เลขจับสลาก'],['6740102220','สมชาย ใจดี','001'],['6840100001','สมหญิง รักเรียน','002']]);ws['!cols']=[{wch:16},{wch:26},{wch:14}];const wb=X.utils.book_new();X.utils.book_append_sheet(wb,ws,'รายชื่อ');X.writeFile(wb,'lotto-students-template.xlsx')}catch(e){toast('สร้างไฟล์ตัวอย่างไม่ได้')}};
$('importBtn').onclick=async()=>{const btn=$('importBtn');try{
 const students=parseCsv($('csvInput').value);if(!students.length){toast('เลือกไฟล์หรือวางรายชื่อก่อน');return}
 if(students.length>1000){toast('นำเข้าได้ครั้งละไม่เกิน 1,000 รายชื่อ');return}
 btn.disabled=true;const d=await post('/camps/lotto/admin/students/import',{students});
 $('importRes').innerHTML='✓ นำเข้าสำเร็จ <b>'+d.imported+'</b> รายชื่อ'+(d.errors.length?' · ข้าม <b>'+d.errors.length+'</b> แถว:<div class="err">'+d.errors.slice(0,30).map(x=>'แถว '+esc(x.row||x.studentId||'')+': '+esc(x.error)).join('<br>')+'</div>':'');
 toast('นำเข้าสำเร็จ '+d.imported+' รายชื่อ'+(d.errors.length?' · ผิดพลาด '+d.errors.length+' แถว':''));
 if(!d.errors.length){$('csvInput').value='';$('csvName').textContent=''}
 await refresh();await refreshStats()}catch(e){toast(e.message)}finally{btn.disabled=false}};
$('refresh').onclick=()=>refresh($('search').value);$('search').oninput=()=>{clearTimeout(window.__searchTimer);window.__searchTimer=setTimeout(()=>refresh($('search').value),250)};$('verifyBtn').onclick=async()=>{if(isAdmin){await refresh($('verifySearch').value);return}try{const d=await data('/camps/lotto/scanner/lookup?q='+encodeURIComponent($('verifySearch').value));renderTable('verifyTable',d.students||[],false)}catch(e){toast(e.message)}};
document.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>{document.querySelectorAll('[data-tab]').forEach(x=>x.classList.toggle('active',x===b));document.querySelectorAll('.view').forEach(x=>x.classList.add('hidden'));$('view-'+b.dataset.tab).classList.remove('hidden');if(b.dataset.tab==='verify')refresh($('verifySearch').value);if(b.dataset.tab==='scanners')refreshScanners()});
init();
})();
