const API=window.BUDGET_API||'https://engedlru-api.stnetworld.workers.dev',AUTH_DOMAIN=window.BUDGET_AUTH0_DOMAIN||'litalkeducation.us.auth0.com',CLIENT_ID=window.BUDGET_AUTH0_CLIENT_ID||'PGqozL94LzOwstm4pD39W5kvalYRiK7w';
let auth0Client,me,meta,reportRows=[];
const $=id=>document.getElementById(id);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
async function init(){
 try{
  auth0Client=await auth0.createAuth0Client({domain:AUTH_DOMAIN,clientId:CLIENT_ID,cacheLocation:'localstorage',useRefreshTokens:true,authorizationParams:{redirect_uri:location.origin+location.pathname}});
  if(location.search.includes('code=')||location.search.includes('error=')){await auth0Client.handleRedirectCallback();history.replaceState({},document.title,location.pathname);}
  if(!await auth0Client.isAuthenticated()){show('login');return}
  const token=await auth0Client.getTokenSilently(); const r=await fetch(API+'/budget/me',{headers:{Authorization:'Bearer '+token}});
  if(!r.ok){show('denied');return}
  me=await r.json(); $('userName').textContent=me.name||me.email||''; if(me.isAdmin)$('adminNav').classList.remove('hidden'); show('app'); await loadMeta(); await loadDashboard();
 }catch(e){console.error(e);show('login')}
}
function show(id){['loading','login','denied','app'].forEach(x=>$(x).classList.toggle('hidden',x!==id))}
async function login(){await auth0Client.loginWithRedirect()}
async function logout(){await auth0Client.logout({logoutParams:{returnTo:location.origin+location.pathname}})}
async function token(){return auth0Client.getTokenSilently()}
async function api(path,opt={}){const t=await token();opt.headers={...(opt.headers||{}),Authorization:'Bearer '+t};return fetch(API+path,opt)}
function showPage(p){document.querySelectorAll('.page').forEach(x=>x.classList.add('hidden'));$('page-'+p).classList.remove('hidden');document.querySelectorAll('nav button').forEach(x=>x.classList.toggle('active',x.dataset.page===p));if(p==='audit')loadReport();if(p==='admin')loadAdmin()}
async function loadMeta(){
 const r=await api('/budget/meta');meta=await r.json();
 const accounts=meta.accounts||[],cats=meta.categories||[];
 $('account').innerHTML=accounts.map(x=>'<option value="'+esc(x.uuid)+'">'+esc(x.name)+'</option>').join('');
 $('filterAccount').innerHTML='<option value="">ทุกบัญชี</option>'+accounts.map(x=>'<option value="'+esc(x.uuid)+'">'+esc(x.name)+'</option>').join('');
 $('newUserAccount').innerHTML=accounts.map(x=>'<option value="'+esc(x.uuid)+'">'+esc(x.name)+'</option>').join('');
 updateCats();$('type').onchange=updateCats;
}
function updateCats(){const cats=(meta?.categories||[]).filter(x=>x.type===$('type').value||x.type==='both');$('category').innerHTML=cats.map(x=>'<option value="'+esc(x.uuid)+'">'+esc(x.name)+'</option>').join('')}
function money(n){return Number(n||0).toLocaleString('th-TH',{minimumFractionDigits:2,maximumFractionDigits:2})}
async function loadDashboard(){
 const r=await api('/budget/dashboard');if(!r.ok)return;const d=await r.json();
 $('summary').innerHTML='<div class="stat"><small>ยอดรวม</small><b>฿'+money(d.totals.balance)+'</b></div><div class="stat"><small>เงินเข้า</small><b>฿'+money(d.totals.income)+'</b></div><div class="stat"><small>เงินออก</small><b>฿'+money(d.totals.expense)+'</b></div>';
 $('accounts').innerHTML=(d.accounts||[]).map(a=>'<div class="account-row"><span><b>'+esc(a.name)+'</b><br><small>'+esc(a.currency)+'</small></span><strong>฿'+money(a.balance)+'</strong></div>').join('')||'<p>ยังไม่มีบัญชี</p>';
 $('recent').innerHTML=(d.recent||[]).map(t=>'<div class="recent-row"><span><b>'+esc(t.transaction_id)+'</b><br><small>'+esc(t.account_name)+' · '+esc(t.category)+'</small></span><strong class="money '+t.type+'">'+(t.type==='income'?'+':'-')+'฿'+money(t.amount)+'</strong></div>').join('')||'<p>ยังไม่มีรายการ</p>';
}
function readFile(file){return new Promise((res,rej)=>{const r=new FileReader();r.onload=()=>res(r.result);r.onerror=rej;r.readAsDataURL(file)})}
$('txForm').addEventListener('submit',async e=>{
 e.preventDefault();const f=$('evidence').files[0];if(!f)return;
 if(f.size>10*1024*1024){$('txStatus').textContent='ไฟล์ต้องไม่เกิน 10 MB';return}
 $('saveBtn').disabled=true;$('txStatus').textContent='กำลังบันทึก…';
 try{const result=await api('/budget/transactions',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({accountUuid:$('account').value,type:$('type').value,categoryUuid:$('category').value,amount:$('amount').value,details:$('details').value,note:$('note').value,fileName:f.name,fileMimeType:f.type,fileBase64:await readFile(f)})});const d=await result.json();if(!result.ok)throw new Error(d.error||'บันทึกไม่สำเร็จ');$('txForm').reset();updateCats();showReceipt(d.transaction,d.verificationUrl);loadDashboard()}catch(err){$('txStatus').textContent=err.message}finally{$('saveBtn').disabled=false}
});
function showReceipt(t,url){$('receiptBody').innerHTML='<p><b>Transaction ID:</b> '+esc(t.transactionId)+'</p><p><b>บัญชี:</b> '+esc((meta.accounts.find(a=>a.uuid===t.accountUuid)||{}).name||t.accountUuid)+'</p><p><b>ประเภท:</b> '+(t.type==='income'?'เงินเข้า':'เงินออก')+'</p><p><b>จำนวน:</b> ฿'+money(t.amount)+'</p><p><b>รายละเอียด:</b> '+esc(t.details)+'</p><p class="muted">UUID: '+esc(t.uuid)+'</p>';$('receipt').classList.remove('hidden');if(window.QRCode)QRCode.toCanvas($('qr'),url,{width:190,margin:1})}
function closeReceipt(){$('receipt').classList.add('hidden')}
async function loadReport(){
 const p=new URLSearchParams();if($('from').value)p.set('from',$('from').value);if($('to').value)p.set('to',$('to').value);const r=await api('/budget/report?'+p);if(!r.ok)return;const d=await r.json();reportRows=d.transactions||[];renderReport();
}
function renderReport(){const af=$('filterAccount').value,tf=$('filterType').value;let rows=reportRows;if(af)rows=rows.filter(x=>x.account_uuid===af);if(tf)rows=rows.filter(x=>x.type===tf);$('reportRows').innerHTML=rows.map(t=>'<tr><td><b>'+esc(t.transaction_id)+'</b></td><td>'+esc(t.account_name)+'</td><td>'+esc(t.type==='income'?'เงินเข้า':'เงินออก')+'</td><td>'+esc(t.category)+'</td><td>฿'+money(t.amount)+'</td><td>'+esc(t.details)+'</td><td>'+esc(t.created_by_email)+'</td><td>'+esc(t.created_at)+'</td><td><button class="secondary small" onclick="openEvidence(\''+esc(t.transaction_uuid)+'\')">เปิด</button></td></tr>').join('')}
$('filterAccount').addEventListener('change',renderReport);$('filterType').addEventListener('change',renderReport);
async function openEvidence(uuid){const r=await api('/budget/transactions/'+encodeURIComponent(uuid)+'/evidence');if(!r.ok)return alert('ไม่สามารถเปิดหลักฐานได้');const u=URL.createObjectURL(await r.blob());window.open(u,'_blank')}
async function exportExcel(){if(!reportRows.length)await loadReport();const rows=reportRows.map(x=>({'Transaction ID':x.transaction_id,'Transaction UUID':x.transaction_uuid,'Account UUID':x.account_uuid,'Account':x.account_name,'Date':x.created_at,'Type':x.type,'Category':x.category,'Amount':x.amount,'Details':x.details,'Note':x.note||'','Created By':x.created_by_email,'Status':x.status}));const wb=XLSX.utils.book_new(),ws=XLSX.utils.json_to_sheet(rows);XLSX.utils.book_append_sheet(wb,ws,'Transactions');XLSX.writeFile(wb,'budget-report-'+new Date().toISOString().slice(0,10)+'.xlsx')}
async function exportPdf(){if(!reportRows.length)await loadReport();const {jsPDF}=window.jspdf,doc=new jsPDF({orientation:'landscape'});doc.setFontSize(16);doc.text('Budget Transaction Report',14,15);doc.setFontSize(9);doc.text(new Date().toLocaleString('en-GB'),14,22);doc.autoTable({startY:28,head:[['Transaction ID','Account','Type','Category','Amount','Details','Created By','Date']],body:reportRows.map(x=>[x.transaction_id,x.account_name,x.type,x.category,money(x.amount),x.details,x.created_by_email,x.created_at]),styles:{fontSize:7},headStyles:{fillColor:[17,24,39]}});doc.save('budget-report-'+new Date().toISOString().slice(0,10)+'.pdf')}
async function loadAdmin(){if(!me.isAdmin)return;const r=await api('/budget/admin/users');const d=await r.json();$('users').innerHTML=(d.users||[]).map(x=>'<div class="account-row"><span>'+esc(x.email)+'<br><small>'+esc(x.student_id||'ไม่ได้ผูกรหัสนักศึกษา')+'</small></span><b>'+(x.enabled?'Enabled':'Disabled')+'</b></div>').join('')||'<p>ยังไม่มีผู้ใช้</p>'}
$('accountForm').addEventListener('submit',async e=>{e.preventDefault();const r=await api('/budget/admin/accounts',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:$('newAccount').value,description:$('accountDesc').value})});if(!r.ok)return alert((await r.json()).error);e.target.reset();await loadMeta();alert('เพิ่มบัญชีแล้ว')});
$('categoryForm').addEventListener('submit',async e=>{e.preventDefault();const r=await api('/budget/admin/categories',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:$('newCategory').value,type:$('newCategoryType').value})});if(!r.ok)return alert((await r.json()).error);e.target.reset();await loadMeta();alert('เพิ่มหมวดหมู่แล้ว')});
$('userForm').addEventListener('submit',async e=>{e.preventDefault();const accounts=[...$('newUserAccount').selectedOptions].map(x=>x.value);const r=await api('/budget/admin/users',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:$('newUserEmail').value,studentId:$('newStudentId').value,displayName:$('newUserName').value,accountUuids:accounts})});if(!r.ok)return alert((await r.json()).error);e.target.reset();await loadAdmin();alert('เปิดสิทธิ์แล้ว')});
window.addEventListener('DOMContentLoaded',init);
