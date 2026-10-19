// Checksums gelden voor opgeslagen bytes, inclusief lokale, nog niet gecommitte wijzigingen.
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { SETTINGS } from '../src/settings.js';

export const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
export const fileHash = (file) => sha256(readFileSync(file));
export const readJson = (file) => JSON.parse(readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
export function sourceHash(root = process.cwd(), release = false) {
  const files = ['build.mjs', 'package.json', '.node-version', '.nvmrc', 'pnpm-lock.yaml', 'vendor/xlsx.full.min.js', 'vendor/package.json', 'vendor/LICENSE-SheetJS.txt'];
  const dirs = ['src', 'tools'];
  if (release) {
    files.push('docs/Releasecontract.json', 'docs/Windows-acceptatie.md');
    dirs.push('test', '.github');
  }
  function walk(dir) {
    for (const entry of readdirSync(path.join(root, dir), { withFileTypes: true })) {
      const file = path.posix.join(dir, entry.name);
      if (entry.isDirectory()) walk(file);
      else if (entry.isFile()) files.push(file);
      else throw new Error('Symbolische koppelingen zijn geen geldige releasebron.');
    }
  }
  dirs.forEach(walk);
  const hash = createHash('sha256');
  for (const file of files.sort()) hash.update(file).update('\0').update(readFileSync(path.join(root, file)));
  return hash.digest('hex');
}
export function checkDate(value, now = Date.now()) {
  const time = typeof value === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?Z$/.test(value) ? Date.parse(value) : NaN;
  if (!Number.isFinite(time) || new Date(time).toISOString().slice(0, 19) !== value.slice(0, 19) || time > now || now - time > SETTINGS.release.bewijsMaxDagen * 86400000) throw new Error('Bewijsdatum ontbreekt, is ongeldig, ligt in de toekomst of is verouderd.');
}
export function requireEqual(actual, expected, message) {
  if (actual !== expected) throw new Error(message);
}
export function localOutput(dir) {
  const root = realpathSync('dist');
  const resolved = path.resolve(dir);
  if (!resolved.startsWith(root + path.sep)) throw new Error('Uitvoer moet onder dist/ blijven.');
  // Ook bestaande bovenliggende symlinks mogen niet buiten dist/ schrijven.
  let parent = resolved;
  for (;;) {
    try { if (!realpathSync(parent).startsWith(root + path.sep) && realpathSync(parent) !== root) throw new Error('Uitvoer verlaat dist/.'); break; }
    catch (error) { if (error.code !== 'ENOENT') throw error; parent = path.dirname(parent); }
  }
  return resolved;
}
