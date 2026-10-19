// Controleert het werkelijke distributiebestand, inclusief CSP-hashes en ingebakken bibliotheek.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import vm from 'node:vm';
const hash = (s) => createHash('sha256').update(s).digest('base64');
assert.deepEqual(readFileSync('index.html'), readFileSync('dist/Lead-ontdubbelaar.html'), 'de hoofdpagina is exact dezelfde zelfstandige productie-HTML');
const vendor = readFileSync('vendor/xlsx.full.min.js');
assert.equal(createHash('sha256').update(vendor).digest('hex'), 'cc015130aa8521e7f088f88898eba949ccdcbfb38df0bd129b44b7273c3a6f41');
for (const dev of [false, true]) {
  const html = readFileSync(`dist/Lead-ontdubbelaar${dev ? '.dev' : ''}.html`, 'utf8');
  const csp = html.match(/http-equiv="Content-Security-Policy"\s+content="([^"]+)"/)[1];
  assert.ok(csp.includes("default-src 'none'"));
  assert.ok(csp.includes(dev ? "connect-src 'self'" : "connect-src 'none'"));
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  const styles = [...html.matchAll(/<style>([\s\S]*?)<\/style>/g)].map((m) => m[1]);
  assert.equal(scripts.length, 2); assert.equal(styles.length, 1);
  for (const code of [...scripts, ...styles]) assert.ok(csp.includes(`'sha256-${hash(code)}'`), 'CSP-hash komt overeen');
  const context = vm.createContext({});
  vm.runInContext(scripts[0], context);
  assert.equal(context.XLSX.version, '0.20.3');
  new vm.Script(scripts[1]);
  const markup = html.replace(/<script>[\s\S]*?<\/script>/g, '').replace(/<style>[\s\S]*?<\/style>/g, '');
  assert.doesNotMatch(markup, /\s(?:src|href|style)\s*=/i, 'geen externe bronnen of inline stijlen');
  assert.doesNotMatch(html, /__(?:SCRIPT_HASHES|STYLE_HASHES|VERSION|STYLES|VENDOR|APP)__/, 'geen achtergebleven placeholders');
}
console.log('Hoofdpagina, productie- en ontwikkel-HTML: CSP, hashes, bibliotheek en offline bronnen OK.');
