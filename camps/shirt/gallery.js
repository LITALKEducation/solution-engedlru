// /shirt/ — public gallery of the camp-shirt designs: no sign-in, shows who designed each one (name + class group). Voting happens at /student/shirt.
(function () {
  'use strict';
  var API = window.CAMPS_API || 'https://engedlru-api.stnetworld.workers.dev';
  var $ = function (id) { return document.getElementById(id); };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var short = function (ms) { return new Date(ms).toLocaleString('th-TH', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }); };
  var span = function (a, b) { return a == null || b == null ? '—' : short(a) + '\n→ ' + short(b); };
  var name = function (d) { return d.title || d.designer; };
  var IC = { up: '<path d="M12 16V4M7 9l5-5 5 5M4 20h16"/>', vote: '<path d="M12 21s-7-4.5-9.5-9A5.5 5.5 0 0112 6a5.5 5.5 0 019.5 6c-2.5 4.5-9.5 9-9.5 9z"/>', lock: '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 018 0v3"/>', img: '<rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="9" cy="9" r="2"/><path d="M21 15l-5-5L5 21"/>', warn: '<path d="M12 3l10 18H2zM12 10v5M12 18v.01"/>' };
  var ic = function (n) { return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + IC[n] + '</svg>'; };
  var ST = { unset: ['ยังไม่กำหนดวัน', ''], before: ['ยังไม่ถึงเวลา', ''], open: ['เปิดอยู่', 'on'], after: ['ปิดแล้ว', 'done'] };
  var data = null, list = [], idx = -1;
  // before the vote results are public the order is shuffled (stable for this visit), so the first uploads are not always on top
  function seed() { try { var s = sessionStorage.getItem('shirtSeed'); if (!s) { s = String(Math.floor(Math.random() * 4294967296)); sessionStorage.setItem('shirtSeed', s); } return +s; } catch (e) { return 12345; } }
  function shuffled(arr) { var a = arr.slice(), t = seed(), rnd = function () { t += 0x6D2B79F5; var r = Math.imul(t ^ (t >>> 15), 1 | t); r ^= r + Math.imul(r ^ (r >>> 7), 61 | r); return ((r ^ (r >>> 14)) >>> 0) / 4294967296; }; for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(rnd() * (i + 1)), x = a[i]; a[i] = a[j]; a[j] = x; } return a; }
  function step(icon, st, label, a, b) { var v = ST[st] || ST.unset; return '<div class="gstep ' + v[1] + '" role="group" aria-label="' + label + ' ' + v[0] + '"><span class="gbub">' + ic(icon) + '<i class="gdot"></i></span><b class="glbl">' + label + '</b><span class="gchip">' + v[0] + '</span><span class="gdates">' + esc(span(a, b)) + '</span></div>'; }
  function state(icon, text, extra) { return '<div class="gstate">' + ic(icon) + '<span>' + text + '</span>' + (extra || '') + '</div>'; }
  function render() {
    var d = data, smp = d.sample && d.sample.image;
    $('gSampleSec').classList.toggle('hidden', !smp); if (smp) $('gSampleImg').src = smp;
    var sc = d.schedule || {};
    $('gInfo').innerHTML = step('up', d.submit, 'ส่งผลงาน', sc.submitFrom, sc.submitTo) + '<span class="gbar" aria-hidden="true"></span>' + step('vote', d.vote, 'โหวต', sc.voteFrom, sc.voteTo);
    $('gCount').textContent = d.galleryPublic && d.designs.length ? d.designs.length : '';
    if (!d.galleryPublic) { list = []; $('gGrid').innerHTML = state('lock', 'ผลงานจะแสดงเมื่อแอดมินเปิดให้ดู'); return; }
    if (!d.designs.length) { list = []; $('gGrid').innerHTML = state('img', 'ยังไม่มีผลงานที่ส่งเข้ามา'); return; }
    list = d.resultsPublic ? d.designs.slice().sort(function (a, b) { return (b.votes || 0) - (a.votes || 0); }) : shuffled(d.designs);
    $('gGrid').innerHTML = list.map(function (x, i) {
      var top = d.resultsPublic && i < 3 && (x.votes || 0) > 0;
      return '<figure class="gc' + (top && i === 0 ? ' top' : '') + '"><button type="button" class="gimg" data-i="' + i + '" aria-label="ขยายรูป ' + esc(name(x)) + '"><img loading="lazy" src="' + esc(x.image) + '" alt=""></button>'
        + (d.resultsPublic ? '<span class="grank' + (top ? ' r' + (i + 1) : '') + '">#' + (i + 1) + '</span><span class="gvotes"><svg viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" aria-hidden="true">' + IC.vote + '</svg>' + (x.votes || 0) + '</span>' : '')
        + '<figcaption><b>' + esc(x.designer) + '</b><span>' + esc(x.classGroup) + '</span></figcaption></figure>';
    }).join('');
  }
  function draw() {
    var d = list[idx]; if (!d) return;
    $('gBoxT').textContent = name(d); $('gBoxW').textContent = 'ออกแบบโดย ' + d.designer + ' · ' + d.classGroup;
    $('gBoxM').innerHTML = '<img src="' + esc(d.image) + '" alt="' + esc(name(d)) + '">';
    $('gBoxN').textContent = (idx + 1) + ' / ' + list.length; $('gPrev').disabled = idx <= 0; $('gNext').disabled = idx >= list.length - 1;
  }
  function openBox(i) { idx = i; if (!list[idx]) return; draw(); $('gBox').classList.remove('hidden'); document.documentElement.style.overflow = 'hidden'; $('gBoxX').focus(); }
  function closeBox() { $('gBox').classList.add('hidden'); document.documentElement.style.overflow = ''; var b = document.querySelector('.gimg[data-i="' + idx + '"]'); idx = -1; if (b) b.focus(); }
  function go(n) { if (idx < 0) return; var j = idx + n; if (j < 0 || j >= list.length) return; idx = j; draw(); }
  $('gGrid').addEventListener('click', function (e) { var b = e.target.closest('.gimg'); if (b) openBox(+b.dataset.i); });
  $('gBox').addEventListener('click', function (e) { if (e.target === $('gBox') || e.target.closest('#gBoxX')) return closeBox(); if (e.target.closest('#gPrev')) return go(-1); if (e.target.closest('#gNext')) return go(1); });
  document.addEventListener('keydown', function (e) { if (idx < 0) return; if (e.key === 'Escape') closeBox(); else if (e.key === 'ArrowLeft') go(-1); else if (e.key === 'ArrowRight') go(1); });
  var tx = null; $('gBoxM').addEventListener('touchstart', function (e) { tx = e.touches[0].clientX; }, { passive: true });
  $('gBoxM').addEventListener('touchend', function (e) { if (tx == null) return; var dx = e.changedTouches[0].clientX - tx; tx = null; if (Math.abs(dx) > 50) go(dx < 0 ? 1 : -1); }, { passive: true });
  function load() {
    fetch(API + '/camps/shirt/gallery').then(function (r) { if (!r.ok) throw new Error('http'); return r.json(); }).then(function (d) { data = d; render(); })
      .catch(function () { $('gGrid').innerHTML = state('warn', 'โหลดผลงานไม่สำเร็จ', '<button type="button" class="btn sm" id="gRetry">ลองใหม่</button>'); var b = $('gRetry'); if (b) b.onclick = load; });
  }
  load();
})();
