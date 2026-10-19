// Het meetrapport moet volledig en binnen de vastgelegde grenzen zijn.
import { SETTINGS } from '../src/settings.js';
const config = SETTINGS.prestaties;
export function checkMeasurements(report, budgetten = config.budgetten, reference = config.referentie) {
  const errors = [];
  const fail = (message) => errors.push(message);
  const number = (n, min = 0, integer = false) => typeof n === 'number' && Number.isFinite(n) && n >= min && (!integer || Number.isInteger(n));
  if (!report || report.versie !== config.versie || !Array.isArray(report.samples)) return ['Ongeldig of ontbrekend meetrapport.'];
  if (!/^[a-f0-9]{64}$/.test(report.bronSha256 || '')) fail('Bronchecksum ontbreekt of is ongeldig.');
  for (const field of ['platform', 'arch', 'cpu', 'geheugenBytes', 'node', 'browser', 'playwright']) {
    if (!report.referentie?.[field] || (reference && report.referentie[field] !== reference[field])) fail(`Referentiemachine/runtime wijkt af of ontbreekt: ${field}`);
  }
  if (report.referentie?.node !== '24.19.0') fail('Node-versie wijkt af.');
  const expected = new Set();
  for (const modus of ['node', 'browser']) for (const soort of config.scenarios) for (const aantal of config.rijen) {
    for (let run = 1; run <= config.herhalingen; run++) expected.add(`${modus}/${soort}/${aantal}/${run}`);
  }
  const seen = new Set();
  for (const sample of report.samples) {
    if (!sample || typeof sample !== 'object') { fail('Ongeldige meting.'); continue; }
    const key = `${sample.modus}/${sample.soort}/${sample.aantal}`, id = `${key}/${sample.run}`;
    if (!number(sample.aantal, 1, true) || !number(sample.run, 1, true)) fail(`${id}: ongeldige grootte/herhaling`);
    if (!expected.has(id) || seen.has(id)) fail(`Onverwachte of dubbele meting: ${id}`);
    seen.add(id);
    if (sample.seed !== config.seed || sample.meetversie !== config.versie) fail(`${id}: verkeerde seed/meetversie`);
    const budget = budgetten?.[key];
    if (!budget) { fail(`${id}: budget ontbreekt`); continue; }
    const check = (field, value, limit, min = 0, integer = false) => {
      if (!number(limit, 0)) fail(`${id}: ongeldig budget ${field}`);
      if (!number(value, min, integer)) fail(`${id}: ontbrekende/ongeldige meting ${field}`);
      else if (value > limit) fail(`${id}: ${field} ${value} > budget ${limit}`);
    };
    check('totaalMs', sample.totaalMs, budget.totaalMs, Number.MIN_VALUE);
    for (const fase of config.fasen) check(`fasen.${fase}`, sample.fasen?.[fase], budget.fasen?.[fase]);
    const total = config.totaalFasen.reduce((n, k) => n + (sample.fasen?.[k] ?? NaN), 0);
    if (!number(total) || Math.abs(sample.totaalMs - total) > config.meetTolerantieMs) fail(`${id}: totaaltijd klopt niet met fasen`);
    for (const field of ['kandidaten', 'exportBytes']) check(field, sample[field], budget[field], field === 'exportBytes' ? 1 : 0, true);
    for (const field of ['compacteGroepen', 'overgeslagenSleutels', 'scores']) if (!number(sample[field], 0, true)) fail(`${id}: ontbrekende/ongeldige meting ${field}`);
    if (sample.scores > sample.kandidaten) fail(`${id}: meer scores dan kandidaten`);
    if (sample.modus === 'node') {
      check('piekRssBytes', sample.piekRssBytes, budget.piekRssBytes, 1, true);
      if (sample.geheugenMethode !== 'os-maxrss' || sample.responsiviteitMethode !== 'niet-van-toepassing' || sample.browserBlokkadeMs !== null || sample.timerVertragingMs !== null) fail(`${id}: ongeldige Node-meetmethode`);
    } else if (sample.modus === 'browser') {
      for (const field of ['browserBlokkadeMs', 'timerVertragingMs']) check(field, sample[field], budget[field]);
      if (sample.piekRssBytes !== null || sample.geheugenMethode !== 'niet-beschikbaar' || sample.responsiviteitMethode !== 'longtask+timer') fail(`${id}: onbetrouwbare browser-meetmethode`);
      if (sample.browser !== report.referentie?.browser || !number(sample.ticks, 1, true) || !Array.isArray(sample.longtasks)) fail(`${id}: browser/timer/Long Tasks-bewijs ontbreekt`);
      else {
        for (const t of sample.longtasks) if (!number(t?.start) || !number(t?.duur, config.minLongTaskMs)) fail(`${id}: ongeldige Long Task`);
        const longest = sample.longtasks.reduce((n, t) => Math.max(n, t?.duur ?? NaN), 0);
        if (Math.abs(longest - sample.browserBlokkadeMs) > config.meetTolerantieMs) fail(`${id}: browserBlokkadeMs klopt niet met Long Tasks`);
      }
      for (const fase of config.fasen) if (!number(sample.faseBlokkades?.[fase])) fail(`${id}: faseblokkade ontbreekt: ${fase}`);
    }
    const groups = sample.soort === 'uniek' ? Math.ceil(sample.aantal * config.uniekAandeel) : Math.ceil(sample.aantal / (sample.soort === 'duplicaten' ? config.duplicaatGroep : config.gedeeldeGroep));
    const q = sample.kwaliteitscontrole;
    if (sample.groepen !== groups || !q || q.groepen !== groups || q.bronrijen !== sample.aantal || q.oorspronkelijkeCellen !== sample.aantal * config.kolommen.length || q.tekstcellen !== true || q.gegevensbehoud !== true) fail(`${id}: onafhankelijke kwaliteitscontrole ontbreekt of faalt`);
    if (!/^[a-f0-9]{64}$/.test(sample.exportSha256 || '')) fail(`${id}: exportchecksum ontbreekt`);
  }
  for (const id of expected) if (!seen.has(id)) fail(`Meting ontbreekt: ${id}`);
  return errors;
}
