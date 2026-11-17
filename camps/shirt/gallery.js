// /shirt/ — public gallery of the camp-shirt designs: no sign-in, shows who designed each one (name + class group). Voting happens at /hr/shirt.
(function () {
  'use strict';
  var API = window.CAMPS_API || 'https://engedlru-api.stnetworld.workers.dev';
  var $ = function (id) { return document.getElementById(id); };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var when = function (ms) { return new Date(ms).toLocaleString('th-TH', { dateStyle: 'long', timeStyle: 'short' }); };
  var range = function (a, b) { return a == null || b == null ? 'ยังไม่กำหนดวัน' : when(a) + ' – ' + when(b); };
  var name = function (d) { return d.title || ('แบบของ ' + d.designer); };
  var who = function (d) { return '<p class="shwho">ออกแบบโดย <b>' + esc(d.designer) + '</b> · ' + esc(d.classGroup) + '</p>'; };
  var data = null, view = 'mock', color = 'white', current = null;
  function mock(src, c) { return window.ShirtMock.mock(data.sample, src, c || 'white'); }
  function render() {
    var d = data, list = d.designs.slice();
    if (d.resultsPublic) list.sort(function (a, b) { return (b.votes || 0) - (a.votes || 0); });
    $('gCount').textContent = d.galleryPublic ? '(' + list.length + ' แบบ)' : '';
    var st = { before: 'ยังไม่ถึงเวลา', open: 'เปิดอยู่', after: 'ปิดแล้ว', unset: 'ยังไม่กำหนดวัน' };
    $('gInfo').innerHTML = '<span><b>รับผลงาน</b> · ' + st[d.submit] + ' · ' + esc(range(d.schedule.submitFrom, d.schedule.submitTo)) + '</span><span><b>โหวต</b> · ' + st[d.vote] + ' · ' + esc(range(d.schedule.voteFrom, d.schedule.voteTo)) + '</span>';
    if (!d.galleryPublic) { $('gGrid').innerHTML = '<p>ผลงานจะแสดงเมื่อแอดมินเปิดให้ดู</p>'; return; }
    if (!list.length) { $('gGrid').innerHTML = '<p>ยังไม่มีผลงานที่ส่งเข้ามา</p>'; return; }
    $('gGrid').innerHTML = list.map(function (x, i) {
      return '<figure class="shcard"><button type="button" class="shimg" data-id="' + esc(x.id) + '" aria-label="ขยายรูป ' + esc(name(x)) + '">' + mock(x.image, 'white') + '</button><figcaption><span class="t">' + (d.resultsPublic ? '<span class="rank">#' + (i + 1) + '</span>' : '') + esc(name(x)) + '</span>' + who(x) + (x.description ? '<p>' + esc(x.description) + '</p>' : '') + (d.resultsPublic ? '<p class="shvotes"><b>' + (x.votes || 0) + '</b> โหวต</p>' : '') + '</figcaption></figure>';
    }).join('');
  }
  function drawBox() {
    var d = current; if (!d) return;
    var hasSample = !!(data.sample && data.sample.image);
    $('gBoxT').textContent = name(d); $('gBoxW').innerHTML = '<span class="shwho">ออกแบบโดย <b>' + esc(d.designer) + '</b> · ' + esc(d.classGroup) + '</span>';
    $('gBoxM').innerHTML = '<div class="gtabs" role="tablist"><button type="button" role="tab" data-v="mock" class="' + (view === 'mock' ? 'on' : '') + '">บนเสื้อ</button><button type="button" role="tab" data-v="img" class="' + (view === 'img' ? 'on' : '') + '">รูปต้นฉบับ</button></div>' + (view === 'mock' ? mock(d.image, color) : '<img src="' + esc(d.image) + '" alt="' + esc(name(d)) + '">');
    $('gDots').innerHTML = view === 'mock' && !hasSample ? window.ShirtMock.COLORS.map(function (c) { return '<button type="button" class="gdot' + (c[0] === color ? ' on' : '') + '" data-c="' + c[0] + '" aria-label="เสื้อสี' + c[1] + '" aria-pressed="' + (c[0] === color) + '" style="background:' + c[2] + '"></button>'; }).join('') : '';
  }
  function openBox(id) { current = data.designs.filter(function (x) { return x.id === id; })[0]; if (!current) return; view = 'mock'; color = 'white'; drawBox(); $('gBox').classList.remove('hidden'); $('gBoxX').focus(); }
  function closeBox() { $('gBox').classList.add('hidden'); current = null; }
  $('gGrid').addEventListener('click', function (e) { var b = e.target.closest('.shimg'); if (b) openBox(b.dataset.id); });
  $('gBox').addEventListener('click', function (e) {
    if (e.target === $('gBox') || e.target.closest('#gBoxX')) return closeBox();
    var t = e.target.closest('.gtabs button'); if (t) { view = t.dataset.v; drawBox(); return; }
    var c = e.target.closest('.gdot'); if (c) { color = c.dataset.c; drawBox(); }
  });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && current) closeBox(); });
  function load() {
    var tries = 0;
    (function go() {
      if (!window.ShirtMock) { if (++tries < 50) return setTimeout(go, 100); }
      fetch(API + '/camps/shirt/gallery').then(function (r) { if (!r.ok) throw new Error('http'); return r.json(); }).then(function (d) { data = d; render(); })
        .catch(function () { $('gGrid').innerHTML = '<p>โหลดผลงานไม่สำเร็จ <button type="button" class="btn sm" id="gRetry">ลองใหม่</button></p>'; var b = $('gRetry'); if (b) b.onclick = load; });
    })();
  }
  load();
})();
