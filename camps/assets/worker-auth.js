// Drop-in replacement for auth0-spa-js: the same few calls the Camps pages use, but the login itself runs on the Worker (/auth/*), so
// Auth0 only needs the Worker's callback + logout URL. The session ({access token, refresh token, expiry, user}) lives in localStorage
// and is shared by every Camps page, so signing in once covers HR, AKA, lottery, QR check and the budget app.
(() => {
'use strict';
const API = window.CAMPS_API || 'https://engedlru-api.stnetworld.workers.dev';
const KEY = 'camps.session.v1', SKEW = 60000;
const usable = (s) => !!(s && s.at && (s.rt || s.exp > Date.now()));   // without a refresh token a session only lasts until its access token expires
const read = () => { try { const s = JSON.parse(localStorage.getItem(KEY) || 'null'); return usable(s) ? s : null; } catch (e) { return null; } };
let memory = null;   // copy kept in the page too, for browsers that block storage (the session then lasts until the page closes)
const write = (s) => { memory = s; try { s ? localStorage.setItem(KEY, JSON.stringify(s)) : localStorage.removeItem(KEY); } catch (e) { /* storage blocked */ } };
const get = () => { const r = read(); if (r) return r; try { localStorage.getItem(KEY); return null; } catch (e) { return usable(memory) ? memory : null; } };
const gone = (msg) => Object.assign(new Error(msg || 'login_required'), { error: 'login_required', authGone: true });
const fromTokens = (d, old) => ({ at: d.access_token, rt: d.refresh_token || (old && old.rt), exp: Date.now() + (Number(d.expires_in) || 86400) * 1000, user: d.user || (old && old.user) || null });
const BIND = 'camps.login.bind';
const newBind = () => { const a = new Uint8Array(24); crypto.getRandomValues(a); return btoa(String.fromCharCode(...a)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); };
const post = (path, body) => fetch(API + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const lock = (fn) => (navigator.locks && navigator.locks.request ? navigator.locks.request('camps-auth-refresh', fn) : fn());   // two tabs must not refresh with the same (rotating) refresh token
let inflight = null;
async function refresh(stale) {
  if (inflight) return inflight;
  inflight = lock(async () => {
    const cur = get(); if (!cur) throw gone();
    if (stale && cur.at !== stale) return cur.at;                       // another tab already refreshed
    if (!stale && cur.exp - Date.now() > SKEW) return cur.at;
    if (!cur.rt) { write(null); throw gone(); }                         // no refresh token and the access token is (nearly) out: sign in again
    let r;
    try { r = await post('/auth/refresh', { refresh_token: cur.rt }); } catch (e) { throw new Error('เชื่อมต่อไม่ได้'); }   // offline: keep the session
    if (r.status === 401) { write(null); throw gone(); }
    if (!r.ok) throw new Error('เซิร์ฟเวอร์เข้าสู่ระบบไม่ว่าง ลองใหม่อีกครั้ง');
    const next = fromTokens(await r.json(), cur); write(next); return next.at;
  }).finally(() => { inflight = null; });
  return inflight;
}
function createAuth0Client() {
  return Promise.resolve({
    isAuthenticated: async () => !!get(),
    getUser: async () => { const s = get(); return s ? s.user || undefined : undefined; },
    async getTokenSilently(o) {
      const s = get(); if (!s) throw gone();
      if (o && o.cacheMode === 'off') return refresh(s.at);
      return s.exp - Date.now() > SKEW ? s.at : refresh();
    },
    async handleRedirectCallback() {
      const q = new URLSearchParams(location.search), err = q.get('error'), code = q.get('code');
      history.replaceState({}, document.title, location.pathname + location.hash);   // never leave ?code= / ?error= in the address bar
      if (err) throw Object.assign(new Error(q.get('error_description') || err), { error: err, error_description: q.get('error_description') || '' });
      if (!code) throw Object.assign(new Error('ไม่พบรหัสเข้าสู่ระบบ'), { error: 'invalid_request' });
      let bind = ''; try { bind = sessionStorage.getItem(BIND) || ''; sessionStorage.removeItem(BIND); } catch (e) { /* ignore */ }
      const r = await post('/auth/exchange', { code, bind }), d = await r.json().catch(() => ({}));
      if (!r.ok || !d.access_token) throw Object.assign(new Error(d.error_description || 'เข้าสู่ระบบไม่สำเร็จ ลองใหม่อีกครั้ง'), { error: d.error || 'invalid_grant' });
      const s = fromTokens(d); write(s);
      return { appState: { returnTo: location.pathname } };
    },
    async loginWithRedirect(o) {
      const ap = (o && o.authorizationParams) || {}, back = (o && o.appState && o.appState.returnTo) || location.pathname;
      const bind = newBind(); try { sessionStorage.setItem(BIND, bind); } catch (e) { /* ignore */ }
      const q = new URLSearchParams({ returnTo: location.origin + back, bind });
      if (ap.connection) q.set('connection', ap.connection);
      if (ap.prompt === 'select_account') q.set('prompt', 'select_account');
      location.assign(API + '/auth/login?' + q);
      await new Promise(() => {});   // the page is leaving
    },
    async logout(o) {
      write(null);
      const to = (o && o.logoutParams && o.logoutParams.returnTo) || location.origin + location.pathname;
      location.assign(API + '/auth/logout?' + new URLSearchParams({ returnTo: to }));
      await new Promise(() => {});
    }
  });
}
window.auth0 = { createAuth0Client };
})();
