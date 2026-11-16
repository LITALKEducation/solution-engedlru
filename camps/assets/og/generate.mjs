// Draws the default link-preview images (1200 x 630) in the same "bold red blocks" style as the site: camps/assets/og/<key>.png
//   node camps/assets/og/generate.mjs        (needs Playwright + Chromium; not part of CI, the PNGs are committed)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
const here = path.dirname(fileURLToPath(import.meta.url)), camps = path.resolve(here, '..', '..');
const { chromium } = createRequire(import.meta.url)('playwright');
const { OG_PAGES } = await import(pathToFileURL(path.join(camps, '..', 'worker', 'src', 'lib', 'og-pages.js')).href);
// big word, small tag, and the number shown in the corner (same numbering as the admin tiles)
const ART = {
  home: { big: 'Camps', tag: 'กิจกรรมค่าย', n: '' },
  hr: { big: 'เลือกฝ่าย', tag: 'นักศึกษา', n: '01' },
  aka: { big: 'ตั้งชื่อ AKA', tag: 'นักศึกษา', n: '02' },
  lotto: { big: 'จับสลาก', tag: 'เจ้าหน้าที่', n: '03' },
  qrcheck: { big: 'เช็ก QR', tag: 'เจ้าหน้าที่', n: '04' },
  survey: { big: 'แบบสำรวจโรงเรียน', tag: 'ผู้ที่ได้รับมอบหมาย', n: '05' }
};
const font = (w, f) => `@font-face{font-family:T;font-weight:${w};src:url(${pathToFileURL(path.join(camps, 'assets', 'fonts', f)).href})}`;
const logo = pathToFileURL(path.join(camps, 'assets', 'logo-english-education.png')).href;
const html = (a) => `<!doctype html><meta charset="utf-8"><style>${font(400, 'SarabunTH-Regular.ttf')}${font(700, 'SarabunTH-Bold.ttf')}
*{box-sizing:border-box;margin:0}body{width:1200px;height:630px;background:#c62828;color:#fff;font-family:T,sans-serif;position:relative;overflow:hidden}
.card{position:absolute;right:70px;top:70px;width:300px;height:300px;background:#fff;border-radius:18px;box-shadow:14px 14px 0 #8f1b1b;display:grid;place-items:center;color:#c62828;font-weight:700;font-size:150px;line-height:1.4}
.tag{position:absolute;left:80px;top:84px;background:#fff;color:#c62828;font-weight:700;font-size:34px;line-height:1.6;padding:2px 22px;border-radius:8px}
.big{position:absolute;left:80px;right:420px;top:170px;font-weight:700;font-size:${a.big.length > 9 ? 92 : 124}px;line-height:1.35;overflow-wrap:anywhere}
.bar{position:absolute;left:0;right:0;bottom:0;height:130px;background:#fff;display:flex;align-items:center;justify-content:space-between;padding:0 80px;color:#171212}
.bar b{font-size:40px;line-height:1.5}.bar span{font-size:30px;color:#4f4445;line-height:1.5}.bar img{height:74px}
</style><div class="tag">${a.tag}</div><div class="big">${a.big}</div>${a.n ? `<div class="card">${a.n}</div>` : ''}
<div class="bar"><div><b>Camps · English Education LRU</b><br><span>คณะครุศาสตร์ สาขาวิชาภาษาอังกฤษ</span></div><img src="${logo}" alt=""></div>`;
const b = await chromium.launch(), p = await b.newPage({ viewport: { width: 1200, height: 630 } });
for (const key of Object.keys(OG_PAGES)) {
  const tmp = path.join(here, `.${key}.html`); fs.writeFileSync(tmp, html(ART[key]));
  await p.goto(pathToFileURL(tmp).href); await p.evaluate(() => document.fonts.ready); await p.waitForTimeout(200);
  await p.screenshot({ path: path.join(here, key + '.png'), clip: { x: 0, y: 0, width: 1200, height: 630 } }); fs.unlinkSync(tmp);
  console.log('wrote', key + '.png');
}
await b.close();
