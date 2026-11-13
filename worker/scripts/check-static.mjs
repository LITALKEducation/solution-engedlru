// Fast repo sanity checks that need no network or secrets (run by CI and `npm run check`):
//  1. every .js under worker/src and camps (except vendored libraries) parses;
//  2. every local <script src>, <link href>, <a href> and <img src> in camps/**/*.html points to a file that exists
//     (extensionless pages such as /hr/quota -> quota.html and folders -> index.html count);
//  3. worker/migrations file names are unique, numbered and contain no destructive-looking edits to old files (git check lives in check-migrations.yml).
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const walk = (dir, out = []) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name === '.git') continue;
    const p = path.join(dir, e.name);
    e.isDirectory() ? walk(p, out) : out.push(p);
  }
  return out;
};
const errors = [];

// 1. syntax
const js = [...walk(path.join(root, 'worker/src')), ...walk(path.join(root, 'camps'))].filter((f) => f.endsWith('.js') && !f.includes(`${path.sep}vendor${path.sep}`));
for (const f of js) {
  try { execFileSync(process.execPath, ['--check', f], { stdio: 'pipe' }); }
  catch (e) { errors.push(`syntax error in ${path.relative(root, f)}:\n${String(e.stderr || e.message).split('\n').slice(0, 4).join('\n')}`); }
}

// 2. local references in camps html
const camps = path.join(root, 'camps');
const exists = (urlPath) => {
  const p = path.join(camps, urlPath.replace(/^\/+/, ''));
  if (!p.startsWith(camps)) return false;
  return [p, p + '.html', path.join(p, 'index.html')].some((c) => fs.existsSync(c) && fs.statSync(c).isFile());
};
const redirects = fs.existsSync(path.join(camps, '_redirects')) ? fs.readFileSync(path.join(camps, '_redirects'), 'utf8').split('\n').map((l) => l.trim().split(/\s+/)[0]).filter((s) => s && !s.startsWith('#')) : [];
for (const f of walk(camps).filter((x) => x.endsWith('.html'))) {
  const html = fs.readFileSync(f, 'utf8'), rel = path.relative(root, f);
  const re = /\b(?:src|href)=["']([^"'#]+)(?:#[^"']*)?["']/g; let m;
  while ((m = re.exec(html))) {
    let u = m[1].split('?')[0];
    if (/^(https?:|\/\/|mailto:|tel:|data:|javascript:)/i.test(u)) continue;
    if (u.startsWith('.')) u = path.posix.join('/' + path.relative(camps, path.dirname(f)).split(path.sep).join('/'), u);
    if (u === '/' || exists(u)) continue;
    if (redirects.some((r) => r === u || (r.endsWith('*') && u.startsWith(r.slice(0, -1))))) continue;
    errors.push(`${rel}: broken reference ${m[1]}`);
  }
}

// 2b. every page must load the in-app browser guard first (the public receipt verification page is the one exception)
for (const f of walk(camps).filter((x) => x.endsWith('.html'))) {
  const rel = path.relative(camps, f).split(path.sep).join('/');
  if (rel.startsWith('budget/verify/')) continue;
  if (!fs.readFileSync(f, 'utf8').includes('/assets/inapp-guard.js')) errors.push(`camps/${rel}: missing <script src="/assets/inapp-guard.js"> (pages must not open inside in-app browsers)`);
}

// 3. migrations
const mig = fs.readdirSync(path.join(root, 'worker/migrations')).filter((f) => f.endsWith('.sql'));
for (const f of mig) if (!/^\d{4}_[a-z0-9_]+\.sql$/.test(f)) errors.push(`migration name should look like 0010_description.sql: ${f}`);
if (new Set(mig).size !== mig.length) errors.push('duplicate migration file names');

// 4. one Auth0 application per system: report (not fail) while two systems still share a Client ID
const ids = { budget: 'camps/budget/assets/budget-v2.js', hr: 'camps/hr/hr.js', lotto: 'camps/lotto/app.js' };
const found = {};
for (const [name, f] of Object.entries(ids)) {
  const m = /AUTH0_CLIENT_ID\s*\|\|\s*'([A-Za-z0-9]{20,})'/.exec(fs.readFileSync(path.join(root, f), 'utf8'));
  if (!m) errors.push(`${f}: could not find the Auth0 client id (expected window.<APP>_AUTH0_CLIENT_ID || '<id>')`); else found[name] = m[1];
}
const byId = {}; for (const [n, id] of Object.entries(found)) (byId[id] ||= []).push(n);
for (const [id, names] of Object.entries(byId)) if (names.length > 1) console.warn(`! ${names.join(', ')} still share the Auth0 client id ${id.slice(0, 6)}… — create one Auth0 application per system (camps/README.md)`);

if (errors.length) { console.error(errors.map((e) => '✗ ' + e).join('\n')); process.exit(1); }
console.log(`ok: ${js.length} scripts parse, camps html references resolve, ${mig.length} migrations named correctly`);
