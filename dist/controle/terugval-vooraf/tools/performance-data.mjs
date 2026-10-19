// Synthetische invoer voor de prestatiecontrole; nooit echte leadgegevens.
import { SETTINGS } from '../src/settings.js';
const config = SETTINGS.prestaties;
export function btwFor(i) {
  if (!Number.isInteger(i) || i < 0 || i >= Math.max(...config.rijen)) throw new Error('BTW-index buiten het synthetische bereik.');
  const base = config.btwBasis + i * config.btwStap;
  const check = 97 - (base % 97);
  return `BE${String(base).padStart(8, '0')}${String(check).padStart(2, '0')}`.replace(/^BE(\d{4})(\d{3})(\d{3})$/, 'BE$1.$2.$3');
}

export function scenario({ aantal, soort, seed = config.seed }) {
  if (!Number.isInteger(aantal) || aantal < 2 || aantal > Math.max(...config.rijen)) throw new Error('Ongeldig aantal benchmarkrijen.');
  if (!config.scenarios.includes(soort) || !Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) throw new Error('Ongeldig scenario of seed.');
  let state = seed >>> 0;
  const random = (max) => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state % max; };
  const identity = Array.from({ length: aantal }, (_, i) => soort === 'uniek'
    ? i % Math.ceil(aantal * config.uniekAandeel)
    : Math.floor(i / (soort === 'duplicaten' ? config.duplicaatGroep : config.gedeeldeGroep)));
  // Waarheid ligt vast vóór er celinhoud wordt gemaakt; er wordt geen engine geïmporteerd.
  for (let i = identity.length - 1; i > 0; i--) { const j = random(i + 1); [identity[i], identity[j]] = [identity[j], identity[i]]; }
  const header = [...config.kolommen];
  const rows = identity.map((id, row) => {
    const code = (Math.imul(id + 1, 2654435761) >>> 0).toString(36).padStart(7, 'a');
    const name = `${code} Fabelbedrijf${id}`;
    const phoneId = soort === 'gedeeld' ? Math.floor(id * config.gedeeldeGroep / config.telefoonBucket) : id;
    const domain = soort === 'gedeeld' ? `pool${id % config.domeinPools}.invalid` : `bedrijf${id}.invalid`;
    return [random(2) ? name.toUpperCase() + ' BV' : name,
      soort !== 'gedeeld' && id % config.zonderBtwElke === 0 ? '' : btwFor(id),
      `02${String(phoneId).padStart(7, '0')}`, `info${id}@${domain}`, `https://${domain}`,
      `Fabelstraat ${id + 1}`, `=BEWAAR-${seed}-${row}; "synthetisch"\nregel twee`];
  });
  return { aantal, soort, seed, header, rows, identity };
}

export function csvBytes(data) {
  return Buffer.from([data.header, ...data.rows].map((row) => row.map((v) => '"' + v.replaceAll('"', '""') + '"').join(';')).join('\r\n'));
}
