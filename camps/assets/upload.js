/* Camps · upload indicator.
   Every file upload the pages make (shirt designs, survey photos, budget receipts, department photos, ...) goes through fetch() with a Blob / FormData body.
   This script wraps fetch(): for such a body (over ~20 KB) the request is sent with XMLHttpRequest instead, which reports real upload progress, and a card at the
   bottom of the screen shows what is happening:  uploading (percent + bar + MB)  ->  processing on the server (moving stripes)  ->  done / failed.
   The caller gets an ordinary fetch Response back, so no page code changes. Anything else (JSON, GET, a Request object) goes straight to the original fetch.
   Also asks the browser to confirm before the tab is closed while a file is still going up. Load with `defer`; it fails open (a missing script changes nothing). */
(function () {
  'use strict';
  if (window.__upl || !window.fetch || !window.XMLHttpRequest) return; window.__upl = 1;
  var orig = window.fetch.bind(window), MIN = 20000, jobs = [], card = null, hideT = 0, admin = /^\/admin(\/|$)/.test(location.pathname);
  var css = '#uplCard{position:fixed;left:50%;bottom:calc(env(safe-area-inset-bottom,0px) + 16px);z-index:2147483100;width:min(92vw,380px);transform:translate(-50%,24px);opacity:0;pointer-events:none;'
    + 'background:#fff;color:#171717;border:1px solid #e4e4e7;border-radius:16px;padding:12px 14px;box-shadow:0 8px 28px rgba(0,0,0,.16);font:14px/1.5 "Noto Sans Thai",Inter,system-ui,sans-serif;'
    + 'display:grid;grid-template-columns:36px 1fr;gap:2px 12px;align-items:center;transition:transform .25s cubic-bezier(.22,1,.36,1),opacity .2s}'
    + '#uplCard.uon{transform:translate(-50%,0);opacity:1}'
    + '#uplCard .uic{grid-row:1/4;width:36px;height:36px;border-radius:50%;background:var(--brand,var(--accent,#1b0e86));color:#fff;display:grid;place-items:center;overflow:hidden}'
    + '#uplCard .uic svg{width:20px;height:20px}#uplCard .uup{display:block;animation:uplUp 1.1s ease-in-out infinite}#uplCard .uck,#uplCard .uer{display:none}'
    + '#uplCard .ut{display:flex;justify-content:space-between;gap:8px;font-weight:600}#uplCard .ut span{font-weight:500;color:#6b6b6b;font-variant-numeric:tabular-nums;white-space:nowrap}'
    + '#uplCard .ubar{height:6px;border-radius:99px;background:#ececef;overflow:hidden;grid-column:2}#uplCard .ubar i{display:block;height:100%;width:0;border-radius:99px;background:var(--brand,var(--accent,#1b0e86));transition:width .2s linear}'
    + '#uplCard .unm{grid-column:2;font-size:12px;color:#6b6b6b;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:2px}'
    + '#uplCard.upr .ubar i{width:40%!important;background:repeating-linear-gradient(135deg,var(--brand,var(--accent,#1b0e86)) 0 10px,#8d86d9 10px 20px);background-size:28px 28px;animation:uplMove .8s linear infinite,uplSlide 1.4s ease-in-out infinite}'
    + '#uplCard.uok .uic{background:#16a34a}#uplCard.uok .uup,#uplCard.ubad .uup{display:none}#uplCard.uok .uck{display:block;animation:uplPop .35s cubic-bezier(.22,1,.36,1)}#uplCard.uok .ubar i{width:100%!important;background:#16a34a}'
    + '#uplCard.ubad .uic{background:#dc2626}#uplCard.ubad .uer{display:block}#uplCard.ubad .ubar i{width:100%!important;background:#dc2626}'
    + '@keyframes uplUp{0%,100%{transform:translateY(3px);opacity:.7}50%{transform:translateY(-3px);opacity:1}}@keyframes uplMove{to{background-position:28px 0}}@keyframes uplSlide{0%,100%{margin-left:0}50%{margin-left:60%}}@keyframes uplPop{from{transform:scale(.4)}to{transform:none}}'
    + '@media(prefers-reduced-motion:reduce){#uplCard .uup,#uplCard.upr .ubar i,#uplCard.uok .uck{animation:none}#uplCard{transition:none}}'
    + (admin ? '' : '@media(prefers-color-scheme:dark){#uplCard{background:#18181b;color:#ececef;border-color:#2d2d31;box-shadow:0 8px 28px rgba(0,0,0,.5)}#uplCard .ut span,#uplCard .unm{color:#a1a1aa}#uplCard .ubar{background:#2a2a2e}#uplCard .uic{background:var(--brand,#b9b3ff);color:#18181b}#uplCard.uok .uic{background:#22c55e;color:#052e16}#uplCard.ubad .uic{background:#ef4444;color:#fff}}');
  var ICON = '<svg class="uup" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 19V6"/><path d="M6 11l6-6 6 6"/></svg>'
    + '<svg class="uck" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>'
    + '<svg class="uer" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" aria-hidden="true"><path d="M7 7l10 10M17 7L7 17"/></svg>';
  function mb(n) { return (n / 1048576).toFixed(n < 10485760 ? 1 : 0) + ' MB'; }
  function ensure() {
    if (card) return card;
    var st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
    card = document.createElement('div'); card.id = 'uplCard'; card.setAttribute('role', 'status'); card.setAttribute('aria-live', 'polite');
    card.innerHTML = '<div class="uic">' + ICON + '</div><div class="ut"><b id="uplT"></b><span id="uplS"></span></div><div class="ubar"><i id="uplB"></i></div><div class="unm" id="uplN"></div>';
    document.body.appendChild(card); return card;
  }
  function set(t, s, name) { document.getElementById('uplT').textContent = t; document.getElementById('uplS').textContent = s || ''; document.getElementById('uplN').textContent = name || ''; }
  function render() {   // while at least one file is going up
    var c = ensure(); clearTimeout(hideT); c.className = 'uon'; c.removeAttribute('aria-busy');
    var total = 0, sent = 0, waiting = 0; jobs.forEach(function (j) { total += j.size; sent += j.sent; if (j.done) waiting++; });
    var name = jobs.length === 1 ? jobs[0].name : jobs.length + ' ไฟล์';
    if (waiting === jobs.length) { c.className = 'uon upr'; set('กำลังประมวลผล…', jobs.length > 1 ? waiting + ' ไฟล์' : '', name); return; }
    var pct = total ? Math.min(99, Math.floor(sent / total * 100)) : 0;
    document.getElementById('uplB').style.width = pct + '%';
    set('กำลังอัปโหลด' + (jobs.length > 1 ? ' ' + jobs.length + ' ไฟล์' : ''), pct + '% · ' + mb(sent) + ' / ' + mb(total), name);
  }
  function finish(ok) {   // the last file is through: show the result briefly
    var c = ensure(); c.className = 'uon ' + (ok ? 'uok' : 'ubad');
    set(ok ? 'อัปโหลดสำเร็จ' : 'อัปโหลดไม่สำเร็จ', '', ok ? '' : 'ตรวจสอบอินเทอร์เน็ตแล้วลองใหม่');
    clearTimeout(hideT); hideT = setTimeout(function () { c.className = ''; }, ok ? 1400 : 3200);
  }
  function describe(body) {   // size + the name of the (first) file
    var size = 0, name = 'ไฟล์';
    if (typeof FormData !== 'undefined' && body instanceof FormData) { body.forEach(function (v) { if (v instanceof Blob) { size += v.size; if (name === 'ไฟล์' && v.name) name = v.name; } }); }
    else if (body instanceof Blob) { size = body.size; if (body.name) name = body.name; }
    else if (body instanceof ArrayBuffer || ArrayBuffer.isView(body)) size = body.byteLength;
    else if (typeof body === 'string') size = body.length;
    return { size: size, name: name };
  }
  function viaXhr(url, init, d) {
    return new Promise(function (resolve, reject) {
      var x = new XMLHttpRequest(), job = { size: d.size, sent: 0, name: d.name, done: false };
      x.open(init.method || 'POST', url); x.responseType = 'arraybuffer';
      if (init.credentials === 'include') x.withCredentials = true;
      try { new Headers(init.headers || {}).forEach(function (v, k) { x.setRequestHeader(k, v); }); } catch (e) { /* ignore */ }
      var end = function (ok) { var i = jobs.indexOf(job); if (i >= 0) jobs.splice(i, 1); if (jobs.length) render(); else finish(ok); };
      x.upload.onprogress = function (e) { if (e.lengthComputable) { job.sent = Math.min(job.size, e.loaded / e.total * job.size); render(); } };
      x.upload.onload = function () { job.sent = job.size; job.done = true; render(); };
      x.onload = function () {
        var h = new Headers(); x.getAllResponseHeaders().trim().split(/\r?\n/).forEach(function (l) { var i = l.indexOf(':'); if (i > 0) { try { h.append(l.slice(0, i).trim(), l.slice(i + 1).trim()); } catch (e) { /* ignore */ } } });
        end(x.status >= 200 && x.status < 400);
        resolve(new Response([204, 205, 304].indexOf(x.status) >= 0 ? null : x.response, { status: x.status, statusText: x.statusText, headers: h }));
      };
      x.onerror = x.ontimeout = function () { end(false); reject(new TypeError('Failed to fetch')); };
      x.onabort = function () { end(false); reject(new DOMException('The operation was aborted.', 'AbortError')); };
      if (init.signal) { if (init.signal.aborted) return reject(new DOMException('The operation was aborted.', 'AbortError')); init.signal.addEventListener('abort', function () { x.abort(); }); }
      jobs.push(job); render(); x.send(init.body);
    });
  }
  window.fetch = function (input, init) {
    try {
      if ((typeof input === 'string' || input instanceof URL) && init && init.body && /^(POST|PUT|PATCH)$/i.test(init.method || 'GET')) {
        var d = describe(init.body);
        if (d.size >= MIN && !(typeof init.body === 'string')) return viaXhr(String(input), init, d);   // a big JSON string is not a file: leave it alone
      }
    } catch (e) { /* any doubt: the normal fetch below */ }
    return orig(input, init);
  };
  window.addEventListener('beforeunload', function (e) { if (jobs.length) { e.preventDefault(); e.returnValue = ''; } });
  window.__uplJobs = function () { return jobs.length; };
})();
