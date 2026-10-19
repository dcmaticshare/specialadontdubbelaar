// Bouwt dist/Lead-ontdubbelaar.html: CSS, SheetJS en de eigen code in één bestand, met versienummer en builddatum.
// Gebruik: node build.mjs
import { readFileSync, writeFileSync, mkdirSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

// --dev: testversie die fetch naar dezelfde server toelaat (connect-src 'self'), alleen om de tool
// in een browser automatisch te testen. De gewone build verbiedt elke netwerkverbinding.
const DEV = process.argv.includes('--dev');

const root = path.dirname(fileURLToPath(import.meta.url));
const read = (p) => readFileSync(path.join(root, p), 'utf8');
const pkg = JSON.parse(read('package.json'));
const version = pkg.version;
const epoch = process.env.SOURCE_DATE_EPOCH;
if (epoch !== undefined && !/^\d+$/.test(epoch)) throw new Error('SOURCE_DATE_EPOCH moet een geheel aantal seconden zijn.');
const buildDate = new Date(epoch === undefined ? Date.now() : Number(epoch) * 1000).toISOString().slice(0, 10);

// ---- mini-bundler: ES-modules uit src/ naar één gewoon script (geen import/export in het eindbestand)
const modules = new Map();
const order = [];
function resolveRel(from, rel) { return path.posix.normalize(path.posix.join(path.posix.dirname(from), rel)); }
function transform(code, p, deps) {
  const exportsNames = [];
  let out = code.replace(/^import\s*\{([^}]*)\}\s*from\s*['"]([^'"]+)['"];?/gm, (m, names, rel) => {
    const t = resolveRel(p, rel); deps.push(t);
    const list = names.split(',').map((s) => s.trim()).filter(Boolean).map((s) => s.replace(/\s+as\s+/, ': '));
    return `const { ${list.join(', ')} } = __require(${JSON.stringify(t)});`;
  });
  out = out.replace(/^import\s*\*\s*as\s+(\w+)\s*from\s*['"]([^'"]+)['"];?/gm, (m, name, rel) => {
    const t = resolveRel(p, rel); deps.push(t);
    return `const ${name} = __require(${JSON.stringify(t)});`;
  });
  out = out.replace(/^export\s+(async\s+function|function|class|const|let|var)\s+([A-Za-z_$][\w$]*)/gm, (m, kind, name) => {
    exportsNames.push(name); return `${kind} ${name}`;
  });
  out = out.replace(/^export\s*\{([^}]*)\};?/gm, (m, names) => names.split(',').map((s) => s.trim()).filter(Boolean)
    .map((s) => { const [a, b] = s.split(/\s+as\s+/); return `exports.${b || a} = ${a};`; }).join(' '));
  if (/^\s*import\s/m.test(out) || /^\s*export\s/m.test(out)) throw new Error(`Onverwerkte import/export in ${p}`);
  return `__define(${JSON.stringify(p)}, function (exports, __require) {\n${out}\n${exportsNames.map((n) => `exports.${n} = ${n};`).join('\n')}\n});\n`;
}
function load(p) {
  if (modules.has(p)) return;
  modules.set(p, null);
  const deps = [];
  const code = transform(read(p), p, deps);
  for (const d of deps) load(d);
  modules.set(p, code);
  order.push(p);
}
const entry = 'src/ui/app.js';
load(entry);

const license = read('vendor/LICENSE-SheetJS.txt');
const build = { version, date: buildDate, sheetjs: '0.20.3', license };
const app = [
  '(function () {',
  "'use strict';",
  `window.__LO_BUILD__ = ${JSON.stringify(build)};`,
  'const __modules = Object.create(null); const __cache = Object.create(null);',
  'function __define(name, fn) { __modules[name] = fn; }',
  'function __require(name) { if (__cache[name]) return __cache[name]; if (!__modules[name]) throw new Error("Module ontbreekt: " + name); const m = __cache[name] = {}; __modules[name](m, __require); return m; }',
  ...order.map((p) => modules.get(p)),
  `__require(${JSON.stringify(entry)});`,
  '})();',
].join('\n');

// syntaxcontrole van het samengevoegde script
try { new vm.Script(app, { filename: 'Lead-ontdubbelaar.js' }); } catch (e) { console.error('Syntaxfout in de gebundelde code:', e.message); process.exit(1); }

// in een <script> mag geen "</script" voorkomen
const safe = (js) => js.replace(/<\/script/gi, '<\\/script').replace(/<!--/g, '<\\!--');
const vendor = safe(read('vendor/xlsx.full.min.js'));
const appSafe = safe(app);
const styles = read('src/styles.css');
const hash = (s) => `'sha256-${createHash('sha256').update(s, 'utf8').digest('base64')}'`;

let html = read('src/index.html');
if (DEV) html = html.replace("connect-src 'none'", "connect-src 'self'");
html = html.replace(/__SCRIPT_HASHES__/g, `${hash(vendor)} ${hash(appSafe)}`)
  .replace(/__STYLE_HASHES__/g, hash(styles))
  .replace(/__VERSION__/g, version)
  .replace('__STYLES__', () => styles)
  .replace('__VENDOR__', () => vendor)
  .replace('__APP__', () => appSafe);
html = `<!-- Lead-ontdubbelaar ${version}, gebouwd op ${buildDate}. Bevat SheetJS Community Edition ${build.sheetjs} (Apache 2.0). -->\n` + html;

mkdirSync(path.join(root, 'dist'), { recursive: true });
const out = path.join(root, 'dist', DEV ? 'Lead-ontdubbelaar.dev.html' : 'Lead-ontdubbelaar.html');
writeFileSync(out, html);
const kb = Math.round(statSync(out).size / 1024);
console.log(`Gebouwd: ${path.relative(root, out)} (${kb} kB), versie ${version}, ${buildDate}, ${order.length} modules${DEV ? ' [DEV, connect-src self]' : ''}`);
