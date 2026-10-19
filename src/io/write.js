// Export (stap 8): het resultaatbestand schrijven, alle waarden als tekst.
import { finishTiming } from '../engine/timing.js';
import { SETTINGS } from '../settings.js';
import { logRows } from '../engine/pipeline.js';

function getXLSX() {
  const X = globalThis.XLSX;
  if (!X) throw new Error('De Excel-bibliotheek (SheetJS) is niet geladen.');
  return X;
}

// Werkblad met alleen tekstcellen (nooit formules of getallen), kolombreedtes en filter.
export function textSheet(header, rows) {
  const XLSX = getXLSX();
  const limits = SETTINGS.eigenExport;
  // De export is een gevulde tabel. Rijen in !data vermijden miljoenen losse
  // adres-sleutels (A1, B1, ...), ook tijdens het schrijven van de XLSX.
  const ws = XLSX.utils.aoa_to_sheet([], { dense: true }), widths = header.map((h) => String(h).length);
  let rowIndex = 0, columns = header.length, block = [];
  const flush = () => {
    if (!block.length) return;
    for (const row of block) ws['!data'].push(row);
    block = [];
  };
  // Maak de tekstcellen direct in de compacte SheetJS-indeling. Zo worden rijen
  // niet eerst tekstarrays en daarna opnieuw celarrays; alle limieten blijven gelden.
  const append = (row) => {
    if (rowIndex >= limits.maxRijen || row.length > limits.maxKolommen) throw new Error('Te veel rijen of kolommen voor één Excel-tabblad. Verwerk kleinere lijsten.');
    columns = Math.max(columns, row.length);
    const cells = row.map((v, c) => {
      const text = v === null || v === undefined ? '' : String(v);
      if (text.length > limits.maxCelTekens) throw new Error('Een exportcel is langer dan Excel toelaat. Verwerk kleinere lijsten of verkort de broncel; er is niets afgekapt.');
      if (rowIndex <= limits.breedteSteekproef && c < widths.length) widths[c] = Math.max(widths[c], text.length);
      return { v: text, t: 's' };
    });
    block.push(cells);
    rowIndex++;
    if (block.length >= limits.schrijfBlok) flush();
  };
  append(header);
  for (const row of rows) append(row);
  flush();
  ws['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: rowIndex - 1, c: Math.max(0, columns - 1) } });
  ws['!cols'] = widths.map((w) => ({ wch: Math.min(limits.maxBreedte, Math.max(limits.minBreedte, w + limits.breedteMarge)) }));
  if (rowIndex > 1) ws['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: rowIndex - 1, c: header.length - 1 } }) };
  return ws;
}

export function resultFileName(datum) { return `Leads_ontdubbeld_${datum}.xlsx`; }

const adresOf = (m) => `${m.straat || ''} ${m.huisnummer || ''}${m.bus ? ' bus ' + m.bus : ''}`.trim();

// Waarde voor één exportkolom van een samengevoegde lead.
export function exportValue(m, spec) {
  const resolve = (van) => {
    if (!van) return '';
    if (van.startsWith('extra:')) return m.extras[van.slice(6)] || '';
    if (van.startsWith('telefoon:')) return m.telefoonsDisplay[Number(van.slice(9))] || '';
    if (van.startsWith('email:')) return m.emails[Number(van.slice(6))] || '';
    if (van.startsWith('raw:')) return m.raw[van.slice(4)] || '';
    if (van.startsWith('tekst:')) return van.slice(6);
    switch (van) {
      case 'bronLabel': return m.bronLabel || '';
      case 'postcodeGemeente': return `${m.postcode || ''} ${m.gemeente || ''}`.trim();
      case 'telefoon': return m.telefoonsDisplay[0] || '';
      case 'telefoon2': return m.telefoonsDisplay[1] || '';
      case 'telefoon3': return m.telefoonsDisplay[2] || '';
      case 'email': return m.emails[0] || '';
      case 'email2': return m.emails[1] || '';
      case 'adres': return adresOf(m);
      case 'btw': return m.btwDisplay || '';
      case 'nr': return m.nr || '';
      case 'bronnen': return m.bronnen.join('; ');
      case 'mogelijkDubbel': return m.mogelijkDubbel.map((x) => `${x.other.nr} ${x.other.bedrijfsnaam}`).join('; ');
      default: return m[van] ?? '';
    }
  };
  const v = resolve(spec.van);
  return v || resolve(spec.anders);
}

function pairSide(m) {
  return [m.nr, m.bedrijfsnaam, m.contactpersoon, m.telefoonsDisplay.join(' / '), m.emails.join(' / '), m.website, m.btwDisplay,
    adresOf(m), m.postcode, m.gemeente, m.bronnen.join('; ')];
}
const SIDE_COLS = ['Nr', 'Bedrijf', 'Contactpersoon', 'Telefoon', 'E-mail', 'Website', 'BTW', 'Adres', 'Postcode', 'Gemeente', 'Bronnen'];

// Eén resultaatbestand met leads, controle, beslissingen, logboek, bronoverzicht, oorspronkelijke cellen en info.
export function buildResultWorkbook(prep, res, ctx) {
  const started = performance.now();
  const XLSX = getXLSX();
  const settings = ctx.settings || SETTINGS;
  const wb = XLSX.utils.book_new();
  const specs = [...settings.exportKolommen];
  const maxPhones = res.merged.reduce((n, m) => Math.max(n, m.telefoons.length), 0);
  const maxEmails = res.merged.reduce((n, m) => Math.max(n, m.emails.length), 0);
  for (let i = settings.eigenExport.vasteTelefoons; i < maxPhones; i++) specs.push({ kop: `Telefoon ${i + 1}`, van: `telefoon:${i}` });
  for (let i = settings.eigenExport.vasteEmails; i < maxEmails; i++) specs.push({ kop: `E-mail ${i + 1}`, van: `email:${i}` });
  for (const key of new Set(res.merged.flatMap((m) => Object.keys(m.extras)))) specs.push({ kop: key, van: `extra:${key}` });
  const uniek = [...res.merged].sort((a, b) => a.memberIdx[0] - b.memberIdx[0]);
  XLSX.utils.book_append_sheet(wb, textSheet(specs.map((s) => s.kop), uniek.map((m) => specs.map((s) => exportValue(m, s)))), 'Unieke leads');

  const review = res.review.map((p) => {
    const a = res.groupOf(p.i), b = res.groupOf(p.j);
    return [String(p.score), p.reason + (p.geblokkeerd ? ` (niet samengevoegd: ${p.geblokkeerd})` : ''), '', ...pairSide(a), ...pairSide(b)];
  });
  XLSX.utils.book_append_sheet(wb, textSheet(['Punten', 'Reden', 'Beslissing', ...SIDE_COLS.map((c) => c + ' A'), ...SIDE_COLS.map((c) => c + ' B')], review), 'Te controleren');

  const describe = (ids) => {
    const parts = []; let text = '';
    for (const i of ids) {
      const r = prep.records[i], label = `${r.sourceLabel || r.sourceName} rij ${r.row}`;
      if (text && text.length + 2 + label.length > settings.eigenExport.maxCelTekens) { parts.push(text); text = ''; }
      text += (text ? '; ' : '') + label;
    }
    parts.push(text);
    return parts;
  };
  const beslissingen = (ctx.decisionLog || []).flatMap((d) => {
    const a = prep.records[d.i], b = prep.records[d.j];
    const left = describe(d.ledenA || [d.i]), right = describe(d.ledenB || [d.j]), count = Math.max(left.length, right.length);
    // Lange ledenlijsten krijgen vervolgregels binnen hetzelfde besluit, nooit kruisparen.
    return Array.from({ length: count }, (_, k) => [d.datum, d.beslissing === 'zelfde' ? 'Zelfde bedrijf' : 'Verschillend',
      d.bron === 'ontkoppelen' ? 'ontkoppeld' : 'beoordeeld', left[k] || '', a.fields.bedrijfsnaam,
      right[k] || '', d.ledenB?.length === 0 ? '' : b.fields.bedrijfsnaam, String(d.score ?? ''),
      (d.reason || '') + (count > 1 ? ` (deel ${k + 1} van ${count}; één groepsbesluit)` : '')]);
  });
  XLSX.utils.book_append_sheet(wb, textSheet(['Datum', 'Beslissing', 'Hoe', 'Rij A', 'Bedrijf A', 'Rij B', 'Bedrijf B', 'Punten', 'Reden'], beslissingen), 'Beslissingen');

  const log = logRows(prep, res).map((l) => [l.bron, String(l.rij), l.bedrijfsnaam, l.nr, l.uitkomst, l.samengevoegdMet, l.reden, l.waarschuwingen]);
  XLSX.utils.book_append_sheet(wb, textSheet(['Bron', 'Rij', 'Bedrijfsnaam', 'Nr', 'Uitkomst', 'Samengevoegd met', 'Reden', 'Waarschuwingen'], log), 'Logboek');

  const per = res.perBron.map((s) => [s.bron, String(s.rijen), String(s.uniekeLeads), String(s.alleenHier), String(s.dubbelAndereLijst), String(s.dubbelBinnenLijst), String(s.waarschuwingen)]);
  XLSX.utils.book_append_sheet(wb, textSheet(['Bron', 'Rijen', 'Unieke leads', 'Alleen in deze lijst', 'Dubbel met andere lijst', 'Dubbel binnen de lijst', 'Waarschuwingen'], per), 'Per bron');

  // Eén regel per oorspronkelijke cel, inclusief lege cellen en dubbele kolomkoppen.
  // Bronrij is alleen een verwijzing binnen deze werkmap, geen blijvende Lead-ID.
  function* originalRows() {
    let originNr = 0;
    for (const record of prep.records) for (const origin of record.originals) {
      originNr++;
      for (const cell of origin.cellen) yield [res.groupOf(record.idx).nr, String(originNr), origin.bron,
        origin.blad, String(origin.rij), String(cell.kolom), cell.kop, cell.waarde];
    }
  }
  XLSX.utils.book_append_sheet(wb, textSheet(settings.eigenExport.oorspronkelijkeKolommen, originalRows()), 'Oorspronkelijke gegevens');

  XLSX.utils.book_append_sheet(wb, textSheet(['Sleutel', 'Waarde'], [
    ['Tool', 'Lead-ontdubbelaar'], ['Exportformaat', settings.eigenExport.versie], ['Versie', ctx.version], ['Builddatum', ctx.buildDate || ''], ['Verwerkt op', ctx.verwerktOp || ctx.datum],
    ['Bestanden', prep.sources.map((s) => s.name).join('; ')],
    ['Rijen ingelezen', String(res.summary.rijen)], ['Unieke leads', String(res.summary.uniekeLeads)],
    ['Automatisch samengevoegd', String(res.summary.automatischSamengevoegd)], ['Door de gebruiker samengevoegd', String(res.summary.samengevoegdDoorMens)],
    ['Te controleren', String(res.summary.teControleren)],
    ['Strengheid', res.strengheid ? `${res.strengheid.label} (twijfelpaar vanaf ${res.strengheid.grenzen.teControleren} punten)` : ''],
  ]), 'Info');
  finishTiming('werkmap', started);
  return wb;
}
