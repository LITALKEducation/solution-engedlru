// Browser shim (camps/assets/worker-auth.js) checks: runs the real file against fake window / localStorage / fetch.
import fs from 'node:fs';import vm from 'node:vm';
let pass=0,failn=0;const ok=(c,m)=>{if(c)pass++;else{failn++;console.log('  FAIL:',m)}};
const src=fs.readFileSync(new URL('../../camps/assets/worker-auth.js',import.meta.url),'utf8');
function boot(){const store=new Map(),calls=[],nav=[];let refreshN=0,mode='ok';
 const win={CAMPS_API:'https://api.x'};
 const ss=new Map();const ctx={window:win,navigator:{},sessionStorage:{getItem:k=>ss.has(k)?ss.get(k):null,setItem:(k,v)=>ss.set(k,String(v)),removeItem:k=>ss.delete(k)},crypto:{getRandomValues:a=>{for(let i=0;i<a.length;i++)a[i]=(i*7+3)%256;return a}},Uint8Array,btoa:(x)=>Buffer.from(x,'latin1').toString('base64'),localStorage:{getItem:k=>store.has(k)?store.get(k):null,setItem:(k,v)=>store.set(k,String(v)),removeItem:k=>store.delete(k)},
  location:{origin:'https://enged.sorasukt.com',pathname:'/student/choose',search:'',hash:'',assign:u=>nav.push(u)},history:{replaceState:(a,b,u)=>{ctx.location.search='';ctx.location.replaced=u}},document:{title:''},
  fetch:async(u,o)=>{calls.push([u,o&&JSON.parse(o.body)]);const j=(x,s=200)=>({ok:s<300,status:s,json:async()=>x});
   if(u.endsWith('/auth/exchange'))return JSON.parse(o.body).code==='good'?j({access_token:'A1',refresh_token:'R1',expires_in:3600,user:{email:'e@lru.ac.th',picture:'https://p'}}):j({error:'invalid_grant'},400);
   if(u.endsWith('/auth/refresh')){if(mode==='revoked')return j({error:'invalid_grant'},401);if(mode==='down')throw new Error('net');if(mode==='5xx')return j({},503);await new Promise(r=>setTimeout(r,20));refreshN++;return j({access_token:'A'+(refreshN+1),refresh_token:'R'+(refreshN+1),expires_in:3600})}
   return j({},404)},URLSearchParams,Date,Promise,JSON,Object,Error,setTimeout};
 vm.createContext(ctx);vm.runInContext(src,ctx);return {ctx,store,calls,nav,ss,set:m=>mode=m,sdk:win.auth0}}
const mk=async(b)=>b.sdk.createAuth0Client({domain:'d',clientId:'c'});
let b=boot(),a=await mk(b);
ok(await a.isAuthenticated()===false,'not authenticated at first');
let e=null;try{await a.getTokenSilently()}catch(x){e=x}ok(e&&e.error==='login_required','getTokenSilently without a session throws login_required');
b.ctx.location.search='?code=good&state=x';const cb=await a.handleRedirectCallback();
ok(cb.appState.returnTo==='/student/choose'&&b.ctx.location.replaced==='/student/choose','callback keeps the page, strips ?code=');
ok(await a.isAuthenticated()&&(await a.getUser()).picture==='https://p'&&await a.getTokenSilently()==='A1','session stored, user + token available');
b.ctx.location.search='?code=bad';e=null;try{await a.handleRedirectCallback()}catch(x){e=x}ok(e&&e.error==='invalid_grant','bad code -> error');
b.ctx.location.search='?error=access_denied&error_description=no';e=null;try{await a.handleRedirectCallback()}catch(x){e=x}ok(e&&e.error==='access_denied'&&e.message==='no','?error= -> thrown');
// forced refresh (token rejected by the API); parallel calls refresh once
const [t1,t2,t3]=await Promise.all([a.getTokenSilently({cacheMode:'off'}),a.getTokenSilently({cacheMode:'off'}),a.getTokenSilently({cacheMode:'off'})]);
ok(t1==='A2'&&t2==='A2'&&t3==='A2'&&b.calls.filter(c=>c[0].endsWith('/auth/refresh')).length===1,'parallel forced refreshes share one request');
ok(b.calls.at(-1)[1].refresh_token==='R1'&&JSON.parse(b.store.get('camps.session.v1')).rt==='R2','rotated refresh token stored');
// another tab already refreshed: stale token -> no new request

// expired token refreshes
const s=JSON.parse(b.store.get('camps.session.v1'));s.exp=Date.now()-1;b.store.set('camps.session.v1',JSON.stringify(s));
const before=b.calls.length;const t=await a.getTokenSilently();ok(t!==s.at&&b.calls.length===before+1,'expired token refreshed');
// outage keeps the session
const s2=JSON.parse(b.store.get('camps.session.v1'));s2.exp=Date.now()-1;b.store.set('camps.session.v1',JSON.stringify(s2));
b.set('down');e=null;try{await a.getTokenSilently()}catch(x){e=x}ok(e&&!e.error&&await a.isAuthenticated(),'network failure: error without signing out');
b.set('5xx');e=null;try{await a.getTokenSilently()}catch(x){e=x}ok(e&&!e.error&&await a.isAuthenticated(),'503: error without signing out');
b.set('revoked');e=null;try{await a.getTokenSilently()}catch(x){e=x}ok(e&&e.error==='login_required'&&await a.isAuthenticated()===false,'revoked refresh token: login_required and session cleared');
// login / logout redirects
b=boot();a=await mk(b);b.ctx.location.search='';a.loginWithRedirect({authorizationParams:{connection:'google-oauth2',prompt:'select_account'},appState:{returnTo:'/admin/hr/live'}});await new Promise(r=>setTimeout(r,5));
const lu=new URL(b.nav[0]);ok(lu.origin==='https://api.x'&&lu.pathname==='/auth/login'&&lu.searchParams.get('returnTo')==='https://enged.sorasukt.com/admin/hr/live'&&lu.searchParams.get('prompt')==='select_account','login goes to the worker with returnTo + prompt');
const bindSent=lu.searchParams.get('bind');ok(bindSent&&bindSent.length>=16&&b.ss.get('camps.login.bind')===bindSent,'login sends a bind value and keeps it in sessionStorage');
b.ctx.location.search='?code=good';await a.handleRedirectCallback();
ok(b.calls.at(-1)[1].bind===bindSent&&!b.ss.has('camps.login.bind'),'exchange sends the bind value, then forgets it');
// no refresh token: the session lasts until the access token expires
b.store.set('camps.session.v1',JSON.stringify({at:'AX',rt:null,exp:Date.now()+3600000,user:null}));ok(await a.isAuthenticated()&&await a.getTokenSilently()==='AX','session without refresh token usable until expiry');
b.store.set('camps.session.v1',JSON.stringify({at:'AX',rt:null,exp:Date.now()-1,user:null}));ok(await a.isAuthenticated()===false,'expired session without refresh token is signed out');
b.store.set('camps.session.v1',JSON.stringify({at:'AX',rt:'R9',exp:Date.now()+3600000,user:null}));
a.logout({logoutParams:{returnTo:'https://enged.sorasukt.com/hr/'}});await new Promise(r=>setTimeout(r,5));
ok(!b.store.has('camps.session.v1')&&new URL(b.nav.at(-1)).pathname==='/auth/logout'&&new URL(b.nav.at(-1)).searchParams.get('returnTo')==='https://enged.sorasukt.com/hr/','logout clears the session and goes through the worker');
console.log(failn?`authshim: ${pass} passed, ${failn} FAILED`:`authshim: ${pass} passed, 0 failed`);process.exit(failn?1:0);
