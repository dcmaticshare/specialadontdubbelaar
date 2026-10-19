// Tijdelijke downloads, screenshots en proefbestanden horen uitsluitend in een eigen werkmap.
import { lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const projectRoot = fileURLToPath(new URL('..', import.meta.url));

export function safeDirectory(root, relative) {
  const base = realpathSync(root);
  const target = path.resolve(base, relative);
  if (!target.startsWith(base + path.sep)) throw new Error('Werkmap moet binnen het project blijven.');
  let current = base;
  for (const part of path.relative(base, target).split(path.sep)) {
    current = path.join(current, part);
    try { mkdirSync(current); } catch (error) { if (error.code !== 'EEXIST') throw error; }
    if (!lstatSync(current).isDirectory() || lstatSync(current).isSymbolicLink()) throw new Error('Geen symbolische koppelingen in een harnesswerkmap.');
  }
  return target;
}

function owner(dir) {
  try {
    if (!lstatSync(dir).isDirectory() || lstatSync(path.join(dir, '.harness.json')).isSymbolicLink()) return null;
    const info = JSON.parse(readFileSync(path.join(dir, '.harness.json'), 'utf8'));
    return info.versie === 1 && Number.isInteger(info.pid) && info.pid > 0 ? info : null;
  } catch { return null; }
}

function alive(pid) {
  try { process.kill(pid, 0); return true; }
  catch (error) { return error.code !== 'ESRCH'; } // Bij twijfel, bijvoorbeeld EPERM, niets verwijderen.
}

export function abandonedWorkspaces(root = projectRoot) {
  const base = safeDirectory(root, 'dist/.harness-tmp');
  return readdirSync(base).map((name) => path.join(base, name)).filter((dir) => {
    const info = owner(dir);
    return info && !alive(info.pid);
  });
}

export async function withHarnessWorkspace(label, work, { root = projectRoot } = {}) {
  if (!/^[a-z][a-z0-9-]*$/.test(label)) throw new Error('Ongeldige naam voor een harnesswerkmap.');
  // Ook na SIGKILL of een herstart verdwijnen achtergelaten werkmappen bij de volgende run.
  for (const dir of abandonedWorkspaces(root)) rmSync(dir, { recursive: true, force: true });
  const base = safeDirectory(root, 'dist/.harness-tmp');
  const dir = mkdtempSync(path.join(base, label + '-'));
  writeFileSync(path.join(dir, '.harness.json'), JSON.stringify({ versie: 1, pid: process.pid }));
  const cleanup = () => {
    // Controleer de bovenliggende map opnieuw: nooit via een vervangen symlink opruimen.
    if (safeDirectory(root, 'dist/.harness-tmp') !== base) throw new Error('Harnesswerkmap is verplaatst.');
    rmSync(dir, { recursive: true, force: true });
  };
  const onExit = () => { try { cleanup(); } catch (error) { console.error(`Opruimen mislukt: ${error.message}`); process.exitCode = 1; } };
  const onInt = () => process.exit(130);
  const onTerm = () => process.exit(143);
  process.once('exit', onExit); process.once('SIGINT', onInt); process.once('SIGTERM', onTerm);
  try { return await work(dir); }
  finally {
    try { cleanup(); }
    finally { process.off('exit', onExit); process.off('SIGINT', onInt); process.off('SIGTERM', onTerm); }
  }
}
