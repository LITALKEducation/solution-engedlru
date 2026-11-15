// Cache busting for camps pages: every local `<script src="x.js?v=...">` / `<link href="x.css?v=...">` carries a short hash of the
// file's content, so a browser can never keep an old copy after the file changes.
//   node scripts/stamp-assets.mjs          rewrite the ?v= values (run it after editing a .js / .css file)
//   node scripts/stamp-assets.mjs --check  fail when a value is out of date (used by `npm run check` and CI)
// camps/budget/ is left alone (its service worker has its own version).
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const camps = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'camps');
const check = process.argv.includes('--check');
const walk = (d, out = []) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); e.isDirectory() ? (e.name !== 'budget' && walk(p, out)) : out.push(p); } return out; };
const RE = /((?:src|href)=")([^"?#]+\.(?:js|css))\?v=([^"]*)"/g;
let stale = 0, changed = 0;
for (const f of walk(camps).filter((x) => x.endsWith('.html'))) {
  const html = fs.readFileSync(f, 'utf8');
  const out = html.replace(RE, (m, pre, ref, v) => {
    if (/^https?:|^\/\//.test(ref)) return m;
    const file = ref.startsWith('/') ? path.join(camps, ref) : path.resolve(path.dirname(f), ref);
    if (!fs.existsSync(file)) return m;
    const h = crypto.createHash('sha1').update(fs.readFileSync(file)).digest('hex').slice(0, 8);
    if (h !== v) { stale++; console.log(`${check ? 'out of date' : 'updated'}: ${path.relative(camps, f)} ${ref} ?v=${v} -> ${h}`); }
    return `${pre}${ref}?v=${h}"`;
  });
  if (!check && out !== html) { fs.writeFileSync(f, out); changed++; }
}
if (check && stale) { console.error(`\n${stale} asset version(s) out of date. Run: cd worker && npm run stamp`); process.exit(1); }
console.log(check ? 'asset versions are current' : `stamped ${changed} page(s)`);
