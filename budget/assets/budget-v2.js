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
const fmtDate=d=>{try{return new Date(d).toLocaleString('th-TH',{day:'numeric',month:'short',year:'2-digit',hour:'2-digit',minute:'2-digit'})}catch(e){return d}};
function updateOnline(){$('offline').classList.toggle('hidden',navigator.onLine)}
addEventListener('online',updateOnline);addEventListener('offline',updateOnline);
async function init(){
 updateOnline();
 try{
  auth0Client=await auth0.createAuth0Client({domain:AUTH_DOMAIN,clientId:CLIENT_ID,cacheLocation:'localstorage',useRefreshTokens:true,authorizationParams:{redirect_uri:location.origin+location.pathname}});
  if(location.search.includes('code=')||location.search.includes('error=')){await auth0Client.handleRedirectCallback();history.replaceState({},document.title,location.pathname);}
  if(!await auth0Client.isAuthenticated()){show('login');return}
  const token=await auth0Client.getTokenSilently(); const r=await fetch(API+'/budget/me',{headers:{Authorization:'Bearer '+token}});
  if(!r.ok){show('denied');return}
  me=await r.json(); $('userName').textContent=me.name||me.email||''; if(me.isAdmin)$('adminNav').classList.remove('hidden'); show('app'); await loadMeta(); const q=new URLSearchParams(location.search).get('page'); if(q==='transaction')showPage('transaction'); await loadDashboard();
 }catch(e){console.error(e);show('login')}
}
function show(id){['loading','login','denied','app'].forEach(x=>$(x).classList.toggle('hidden',x!==id))}
async function login(){await auth0Client.loginWithRedirect()}
async function logout(){await auth0Client.logout({logoutParams:{returnTo:location.origin+location.pathname}})}
async function token(){return auth0Client.getTokenSilently()}
async function api(path,opt={}){const t=await token();opt.headers={...(opt.headers||{}),Authorization:'Bearer '+t};return fetch(API+path,opt)}
function showPage(p){document.querySelectorAll('.page').forEach(x=>x.classList.add('hidden'));$('page-'+p).classList.remove('hidden');document.querySelectorAll('nav button').forEach(x=>x.classList.toggle('active',x.dataset.page===p));window.scrollTo(0,0);if(p==='audit')loadReport();if(p==='admin')loadAdmin()}
async function loadMeta(){
 const r=await api('/budget/meta');meta=await r.json();
 const accounts=meta.accounts||[],cats=meta.categories||[];
 $('account').innerHTML=accounts.map(x=>'<option value="'+esc(x.uuid)+'">'+esc(x.name)+'</option>').join('');
 $('filterAccount').innerHTML='<option value="">ทุกบัญชี</option>'+accounts.map(x=>'<option value="'+esc(x.uuid)+'">'+esc(x.name)+'</option>').join('');
 $('newUserAccount').innerHTML=accounts.map(x=>'<label><input type="checkbox" value="'+esc(x.uuid)+'"> '+esc(x.name)+'</label>').join('');
 updateCats();
}
document.querySelectorAll('.seg button').forEach(b=>b.addEventListener('click',()=>{$('type').value=b.dataset.type;document.querySelectorAll('.seg button').forEach(x=>x.classList.toggle('on',x===b));updateCats()}));
function resetType(){$('type').value='expense';document.querySelectorAll('.seg button').forEach(x=>x.classList.toggle('on',x.dataset.type==='expense'))}
function updateCats(){const cats=(meta?.categories||[]).filter(x=>x.type===$('type').value||x.type==='both');$('category').innerHTML=cats.map(x=>'<option value="'+esc(x.uuid)+'">'+esc(x.name)+'</option>').join('')}
function money(n){return Number(n||0).toLocaleString('th-TH',{minimumFractionDigits:2,maximumFractionDigits:2})}
async function loadDashboard(){
 if(!$('summary').innerHTML)$('summary').innerHTML='<div class="skeleton" style="height:110px"></div><div class="skeleton"></div>';
 let r;try{r=await api('/budget/dashboard')}catch(e){toast('โหลดข้อมูลไม่สำเร็จ',1);return}if(!r.ok){toast('โหลดข้อมูลไม่สำเร็จ',1);return}const d=await r.json();
 $('summary').innerHTML='<div class="hero"><small>ยอดคงเหลือรวม</small><b>฿'+money(d.totals.balance)+'</b></div><div class="stats"><div class="stat in"><small><i class="dot"></i>เงินเข้า</small><b>฿'+money(d.totals.income)+'</b></div><div class="stat out"><small><i class="dot"></i>เงินออก</small><b>฿'+money(d.totals.expense)+'</b></div></div>';
 $('accounts').innerHTML=(d.accounts||[]).map(a=>'<div class="account-row"><span><b>'+esc(a.name)+'</b><br><small>'+esc(a.currency)+'</small></span><strong>฿'+money(a.balance)+'</strong></div>').join('')||'<p>ยังไม่มีบัญชี</p>';
 $('recent').innerHTML=(d.recent||[]).map(t=>'<div class="recent-row"><span><b>'+esc(t.transaction_id)+'</b><br><small>'+esc(t.account_name)+' · '+esc(t.category)+'</small></span><strong class="money '+t.type+'">'+(t.type==='income'?'+':'-')+'฿'+money(t.amount)+'</strong></div>').join('')||'<p>ยังไม่มีรายการ</p>';
}
$('txForm').addEventListener('submit',async e=>{
 e.preventDefault();const f=$('evidence').files[0];if(!f){$('txStatus').textContent='กรุณาแนบหลักฐาน';return}
 if(f.size>10*1024*1024){$('txStatus').textContent='ไฟล์ต้องไม่เกิน 10 MB';return}
 $('saveBtn').disabled=true;$('txStatus').style.color='';$('txStatus').textContent='กำลังบันทึก…';
 try{const form=new FormData();form.append('accountUuid',$('account').value);form.append('type',$('type').value);form.append('categoryUuid',$('category').value);form.append('amount',$('amount').value);form.append('details',$('details').value);form.append('note',$('note').value);form.append('evidence',f,f.name);const result=await api('/budget/transactions',{method:'POST',body:form});const d=await result.json();if(!result.ok)throw new Error(d.error||'บันทึกไม่สำเร็จ');$('txForm').reset();resetType();setPreview();updateCats();showReceipt(d.transaction,d.verificationUrl);$('txStatus').textContent='';loadDashboard()}catch(err){$('txStatus').style.color='var(--out)';$('txStatus').textContent=err.message}finally{$('saveBtn').disabled=false}
});
function setPreview(){const f=$('evidence').files[0],box=$('preview');if(!f){box.classList.add('hidden');box.innerHTML='';return}
 const thumb=f.type.startsWith('image/')?'<img alt="" src="'+URL.createObjectURL(f)+'">':'<div class="pdf">PDF</div>';
 box.innerHTML=thumb+'<div class="meta"><div>'+esc(f.name)+'</div><small>'+(f.size/1048576).toFixed(2)+' MB</small></div><button type="button" class="secondary small" id="rmFile">ลบ</button>';box.classList.remove('hidden');$('txStatus').textContent='';
 $('rmFile').onclick=()=>{$('evidence').value='';$('evidenceCam').value='';setPreview()}}
$('evidence').addEventListener('change',()=>{$('evidenceCam').value='';setPreview()});
$('evidenceCam').addEventListener('change',()=>{const f=$('evidenceCam').files[0];if(!f)return;const dt=new DataTransfer();dt.items.add(f);$('evidence').files=dt.files;setPreview()});
function showReceipt(t,url){$('receiptBody').innerHTML='<p><b>Transaction ID:</b> '+esc(t.transactionId)+'</p><p><b>บัญชี:</b> '+esc((meta.accounts.find(a=>a.uuid===t.accountUuid)||{}).name||t.accountUuid)+'</p><p><b>ประเภท:</b> '+(t.type==='income'?'เงินเข้า':'เงินออก')+'</p><p><b>จำนวน:</b> ฿'+money(t.amount)+'</p><p><b>รายละเอียด:</b> '+esc(t.details)+'</p><p class="muted">UUID: '+esc(t.uuid)+'</p>';$('receipt').classList.remove('hidden');if(window.QRCode)QRCode.toCanvas($('qr'),url,{width:180,margin:1})}
function closeReceipt(){$('receipt').classList.add('hidden')}
async function loadReport(){
 const p=new URLSearchParams();if($('from').value)p.set('from',$('from').value);if($('to').value)p.set('to',$('to').value);$('reportCards').innerHTML='<div class="skeleton"></div><div class="skeleton"></div><div class="skeleton"></div>';let r;try{r=await api('/budget/report?'+p)}catch(e){toast('โหลดข้อมูลไม่สำเร็จ',1);return}if(!r.ok){toast('โหลดข้อมูลไม่สำเร็จ',1);return}const d=await r.json();reportRows=d.transactions||[];renderReport();
}
function renderReport(){const af=$('filterAccount').value,tf=$('filterType').value;let rows=reportRows;if(af)rows=rows.filter(x=>x.account_uuid===af);if(tf)rows=rows.filter(x=>x.type===tf);$('reportCards').innerHTML=rows.map(t=>'<div class="tx"><div class="tx-top"><div><div class="tx-id">'+esc(t.transaction_id)+'</div><small>'+esc(fmtDate(t.created_at))+'</small></div><div class="tx-amt money '+t.type+'">'+(t.type==='income'?'+':'-')+'฿'+money(t.amount)+'</div></div><div class="tx-det">'+esc(t.details)+'</div><div class="tx-meta"><span class="pill">'+esc(t.account_name)+'</span><span class="pill">'+esc(t.category)+'</span></div><div class="tx-foot"><small>'+esc(t.created_by_email)+'</small><button class="secondary small" onclick="openEvidence(\''+esc(t.transaction_uuid)+'\')">หลักฐาน</button></div></div>').join('')||'<div class="empty">ไม่พบรายการ</div>';
 $('reportRows').innerHTML=rows.map(t=>'<tr><td><b>'+esc(t.transaction_id)+'</b></td><td>'+esc(t.account_name)+'</td><td>'+esc(t.type==='income'?'เงินเข้า':'เงินออก')+'</td><td>'+esc(t.category)+'</td><td>฿'+money(t.amount)+'</td><td>'+esc(t.details)+'</td><td>'+esc(t.created_by_email)+'</td><td>'+esc(t.created_at)+'</td><td><button class="secondary small" onclick="openEvidence(\''+esc(t.transaction_uuid)+'\')">เปิด</button></td></tr>').join('')}
$('filterAccount').addEventListener('change',renderReport);$('filterType').addEventListener('change',renderReport);
async function openEvidence(uuid){const w=window.open('','_blank');const r=await api('/budget/transactions/'+encodeURIComponent(uuid)+'/evidence');if(!r.ok){if(w)w.close();return toast('ไม่สามารถเปิดหลักฐานได้',1)}const u=URL.createObjectURL(await r.blob());if(w)w.location=u;else location.href=u}
async function exportExcel(){try{await needXlsx()}catch(e){return toast(e.message,1)}if(!reportRows.length)await loadReport();const rows=reportRows.map(x=>({'Transaction ID':x.transaction_id,'Transaction UUID':x.transaction_uuid,'Account UUID':x.account_uuid,'Account':x.account_name,'Date':x.created_at,'Type':x.type,'Category':x.category,'Amount':x.amount,'Details':x.details,'Note':x.note||'','Created By':x.created_by_email,'Status':x.status}));const wb=XLSX.utils.book_new(),ws=XLSX.utils.json_to_sheet(rows);XLSX.utils.book_append_sheet(wb,ws,'Transactions');XLSX.writeFile(wb,'budget-report-'+new Date().toISOString().slice(0,10)+'.xlsx')}
async function exportPdf(){try{await needPdf()}catch(e){return toast(e.message,1)}if(!reportRows.length)await loadReport();const {jsPDF}=window.jspdf,doc=new jsPDF({orientation:'landscape'});doc.setFontSize(16);doc.text('Budget Transaction Report',14,15);doc.setFontSize(9);doc.text(new Date().toLocaleString('en-GB'),14,22);doc.autoTable({startY:28,head:[['Transaction ID','Account','Type','Category','Amount','Details','Created By','Date']],body:reportRows.map(x=>[x.transaction_id,x.account_name,x.type,x.category,money(x.amount),x.details,x.created_by_email,x.created_at]),styles:{fontSize:7},headStyles:{fillColor:[17,24,39]}});doc.save('budget-report-'+new Date().toISOString().slice(0,10)+'.pdf')}
async function loadAdmin(){if(!me.isAdmin)return;const r=await api('/budget/admin/users');const d=await r.json();$('users').innerHTML=(d.users||[]).map(x=>'<div class="account-row"><span>'+esc(x.email)+'<br><small>'+esc(x.student_id||'ไม่ได้ผูกรหัสนักศึกษา')+'</small></span><b>'+(x.enabled?'Enabled':'Disabled')+'</b></div>').join('')||'<p>ยังไม่มีผู้ใช้</p>'}
$('accountForm').addEventListener('submit',async e=>{e.preventDefault();const r=await api('/budget/admin/accounts',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:$('newAccount').value,description:$('accountDesc').value})});if(!r.ok)return toast((await r.json()).error,1);e.target.reset();await loadMeta();toast('เพิ่มบัญชีแล้ว')});
$('categoryForm').addEventListener('submit',async e=>{e.preventDefault();const r=await api('/budget/admin/categories',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:$('newCategory').value,type:$('newCategoryType').value})});if(!r.ok)return toast((await r.json()).error,1);e.target.reset();await loadMeta();toast('เพิ่มหมวดหมู่แล้ว')});
$('userForm').addEventListener('submit',async e=>{e.preventDefault();const accounts=[...$('newUserAccount').querySelectorAll('input:checked')].map(x=>x.value);const r=await api('/budget/admin/users',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:$('newUserEmail').value,studentId:$('newStudentId').value,displayName:$('newUserName').value,accountUuids:accounts})});if(!r.ok)return toast((await r.json()).error,1);e.target.reset();await loadAdmin();toast('เปิดสิทธิ์แล้ว')});
window.addEventListener('DOMContentLoaded',init);

// ---- PWA ----
if('serviceWorker' in navigator)addEventListener('load',()=>navigator.serviceWorker.register('/sw.js').catch(()=>{}));
let deferredInstall;
const standalone=matchMedia('(display-mode: standalone)').matches||navigator.standalone;
addEventListener('beforeinstallprompt',e=>{e.preventDefault();deferredInstall=e;if(!standalone)$('installBox').classList.remove('hidden')});
$('installBtn').addEventListener('click',async()=>{if(deferredInstall){deferredInstall.prompt();await deferredInstall.userChoice;deferredInstall=null}$('installBox').classList.add('hidden')});
addEventListener('appinstalled',()=>$('installBox').classList.add('hidden'));
if(!standalone&&/iphone|ipad|ipod/i.test(navigator.userAgent)){$('installText').textContent='iPhone: แตะปุ่มแชร์ แล้วเลือก “เพิ่มไปยังหน้าจอโฮม”';$('installBtn').classList.add('hidden');$('installBox').classList.remove('hidden')}
