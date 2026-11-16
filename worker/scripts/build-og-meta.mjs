// Writes the default link-preview tags (description, Open Graph, Twitter card) into the <head> of every public Camps page, from
// src/lib/og-pages.js. Crawlers (LINE, Facebook, X ...) do not run JavaScript, so these static tags are what they read when the
// Pages Function in camps/functions is not available; the Function swaps in the admin's edits on top of them.
//   node scripts/build-og-meta.mjs           write / update the block between <!-- og:start --> and <!-- og:end -->
//   node scripts/build-og-meta.mjs --check   fail when a page is out of date
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { OG_PAGES, OG_SITE, OG_SITE_NAME, ogDefaultImage, ogPaths } from '../src/lib/og-pages.js';

const camps = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'camps');
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const START = '<!-- og:start -->', END = '<!-- og:end -->';
export function block(key, file) {
  const p = OG_PAGES[key], pagePath = file === 'index.html' || file.endsWith('/index.html') ? p.path : '/' + file.replace(/\.html$/, ''), url = OG_SITE + (OG_PAGES[key].files[0] === file ? p.path : pagePath), img = ogDefaultImage(key);
  return [START,
    `<meta name="description" content="${esc(p.description)}">`,
    '<meta property="og:type" content="website">',
    `<meta property="og:site_name" content="${esc(OG_SITE_NAME)}">`,
    '<meta property="og:locale" content="th_TH">',
    `<meta property="og:title" content="${esc(p.title)}">`,
    `<meta property="og:description" content="${esc(p.description)}">`,
    `<meta property="og:url" content="${esc(url)}">`,
    `<meta property="og:image" content="${esc(img)}">`,
    '<meta property="og:image:width" content="1200">', '<meta property="og:image:height" content="630">',
    '<meta name="twitter:card" content="summary_large_image">',
    `<meta name="twitter:title" content="${esc(p.title)}">`,
    `<meta name="twitter:description" content="${esc(p.description)}">`,
    `<meta name="twitter:image" content="${esc(img)}">`,
    END].join('\n');
}
export function apply(html, key, file) {
  const b = block(key, file);
  if (html.includes(START)) return html.replace(new RegExp(`${START}[\\s\\S]*?${END}`), () => b);
  // a hand-written description tag would duplicate ours
  html = html.replace(/<meta name="description"[^>]*>\n?/, '');
  return html.replace('</head>', () => b + '\n</head>');
}
// only these paths run the Pages Function (camps/functions); every other request is served as a plain static file
export const routes = () => JSON.stringify({ version: 1, include: [...new Set(Object.keys(OG_PAGES).flatMap(ogPaths))].sort(), exclude: [] }, null, 2) + '\n';
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const check = process.argv.includes('--check'); let bad = 0, n = 0;
  for (const [key, p] of Object.entries(OG_PAGES)) for (const file of p.files) {
    const f = path.join(camps, file), html = fs.readFileSync(f, 'utf8'), out = apply(html, key, file); n++;
    if (out !== html) { bad++; if (check) console.error(`out of date: camps/${file}`); else fs.writeFileSync(f, out); }
    const img = path.join(camps, 'assets', 'og', key + '.png');
    if (!fs.existsSync(img)) { bad++; console.error(`missing default image: camps/assets/og/${key}.png`); }
  }
  const rf = path.join(camps, '_routes.json'), want = routes();
  if (!fs.existsSync(rf) || fs.readFileSync(rf, 'utf8') !== want) { bad++; if (check) console.error('out of date: camps/_routes.json'); else fs.writeFileSync(rf, want); }
  if (check && bad) { console.error('\nRun: cd worker && npm run stamp'); process.exit(1); }
  console.log(check ? 'og meta tags are current' : `updated ${bad} of ${n} page(s)`);
}
