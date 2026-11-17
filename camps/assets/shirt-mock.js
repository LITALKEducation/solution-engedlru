// The camp-shirt mock-up shared by /hr/shirt, /admin/hr/shirt and the public gallery /shirt/: a design shown on the admin's sample shirt picture
// (placed in its print area) or, when no sample was uploaded, on a built-in T-shirt drawing. Plain script, no dependencies.
(function () {
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var COLORS = [['white', 'ขาว', '#ffffff', '#cfcfd6'], ['black', 'ดำ', '#202023', '#000000'], ['red', 'แดง', '#c62828', '#8f1b1b'], ['navy', 'กรมท่า', '#1e2f5a', '#12204a'], ['grey', 'เทา', '#a3a2a8', '#7c7b81']];
  // sample = { image: url | null, area: {x,y,w,h} } (percent of the picture); src = the design picture ('' = just the shirt)
  function mock(sample, src, color, areaOverride) {
    if (sample && sample.image) {
      var a = areaOverride || sample.area;
      return '<div class="shmockimg" role="img" aria-label="ตัวอย่างลายบนเสื้อ"><img class="shbase" src="' + esc(sample.image) + '" alt="">' + (src ? '<img class="shdesign" src="' + esc(src) + '" alt="" style="left:' + a.x + '%;top:' + a.y + '%;width:' + a.w + '%;height:' + a.h + '%">' : '') + '</div>';
    }
    var c = COLORS.filter(function (x) { return x[0] === color; })[0] || COLORS[0];
    return '<svg class="shmock" viewBox="0 0 300 300" role="img" aria-label="ตัวอย่างลายบนเสื้อสี' + c[1] + '"><path d="M96 22 L18 58 L44 120 L76 104 L76 282 L224 282 L224 104 L256 120 L282 58 L204 22 Q150 66 96 22 Z" fill="' + c[2] + '" stroke="' + c[3] + '" stroke-width="3" stroke-linejoin="round"/>'
      + '<path d="M96 22 Q150 66 204 22" fill="none" stroke="' + c[3] + '" stroke-width="5" stroke-linecap="round"/><path d="M76 104 L76 282 M224 104 L224 282" stroke="' + c[3] + '" stroke-opacity=".18" stroke-width="2"/>'
      + (src ? '<image href="' + esc(src) + '" x="98" y="86" width="104" height="118" preserveAspectRatio="xMidYMid meet"/>' : '') + '</svg>';
  }
  window.ShirtMock = { mock: mock, COLORS: COLORS };
})();
