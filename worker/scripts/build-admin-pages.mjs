// The admin version of lotto / QR check / AKA lives at /admin/<system>/. It is the system's own page and script in "admin mode"
// (only the admin tabs), so the admin pages are generated from camps/<system>/index.html and never drift.
//   node scripts/build-admin-pages.mjs           write camps/admin/<system>/index.html
//   node scripts/build-admin-pages.mjs --check   fail when a generated page is missing or different (ignoring ?v= hashes)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const camps = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'camps');
export const SYSTEMS = ['lotto', 'qrcheck', 'aka'];
const strip = (s) => s.replace(/\?v=[^"]*"/g, '"');

export function generate(sys) {
  let html = fs.readFileSync(path.join(camps, sys, 'index.html'), 'utf8');
  html = html.replace(/<!-- og:start -->[\s\S]*?<!-- og:end -->\n?/, '');   // admin pages have no public link preview
  html = html.replace(/<script src="\/assets\/brand-bar\.js[^>]*><\/script>\n?/, '');   // the admin shell has its own menu
  html = html.replace(/(<link rel="stylesheet" href="\/assets\/theme\.css[^>]*>)/, '$1\n<link rel="stylesheet" href="/admin/shell.css?v=0">');
  html = html.replace('</head>', '<script src="/admin/shell.js?v=0" defer></script>\n</head>');
  html = html.replace(/(src|href)="\.\//g, `$1="/${sys}/`);
  html = html.replace('<meta charset="utf-8">', '<meta charset="utf-8">\n<script>window.ADMIN_MODE=true;</script>');
  html = html.replace(/<title>([^<]*)<\/title>/, (m, t) => `<title>แอดมิน · ${t}</title>`);
  return html;
}
export function target(sys) { return path.join(camps, 'admin', sys, 'index.html'); }

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const check = process.argv.includes('--check');
  let bad = 0;
  for (const sys of SYSTEMS) {
    const want = generate(sys), file = target(sys);
    if (check) {
      if (!fs.existsSync(file) || strip(fs.readFileSync(file, 'utf8')) !== strip(want)) { bad++; console.error(`out of date: camps/admin/${sys}/index.html`); }
    } else { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, want); }
  }
  if (check && bad) { console.error('\nRun: cd worker && npm run stamp'); process.exit(1); }
  console.log(check ? 'admin pages are current' : `generated ${SYSTEMS.length} admin pages`);
}
