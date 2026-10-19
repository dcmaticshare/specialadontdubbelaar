// Export (stap 8): het resultaatbestand schrijven, alle waarden als tekst.
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
  if (rows.length + 1 > limits.maxRijen || header.length > limits.maxKolommen) throw new Error('Te veel rijen of kolommen voor één Excel-tabblad. Verwerk kleinere lijsten.');
  const aoa = [header, ...rows].map((r) => r.map((v) => {
    const text = v === null || v === undefined ? '' : String(v);
    if (text.length > limits.maxCelTekens) throw new Error('Een exportcel is langer dan Excel toelaat. Verwerk kleinere lijsten of verkort de broncel; er is niets afgekapt.');
    return text;
  }));
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols'] = header.map((h, c) => {
    let w = String(h).length;
    for (const r of aoa.slice(1, 500)) w = Math.max(w, String(r[c] ?? '').length);
    return { wch: Math.min(60, Math.max(8, w + 2)) };
  });
  if (rows.length) ws['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: rows.length, c: header.length - 1 } }) };
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

  const describe = (ids) => ids.map((i) => { const r = prep.records[i]; return `${r.sourceLabel || r.sourceName} rij ${r.row}`; }).join('; ');
  const beslissingen = (ctx.decisionLog || []).map((d) => {
    const a = prep.records[d.i], b = prep.records[d.j];
    return [d.datum, d.beslissing === 'zelfde' ? 'Zelfde bedrijf' : 'Verschillend', d.bron === 'ontkoppelen' ? 'ontkoppeld' : 'beoordeeld',
      describe(d.ledenA || [d.i]), a.fields.bedrijfsnaam, describe(d.ledenB || [d.j]), b.fields.bedrijfsnaam, String(d.score ?? ''), d.reason || ''];
  });
  XLSX.utils.book_append_sheet(wb, textSheet(['Datum', 'Beslissing', 'Hoe', 'Rij A', 'Bedrijf A', 'Rij B', 'Bedrijf B', 'Punten', 'Reden'], beslissingen), 'Beslissingen');

  const log = logRows(prep, res).map((l) => [l.bron, String(l.rij), l.bedrijfsnaam, l.nr, l.uitkomst, l.samengevoegdMet, l.reden, l.waarschuwingen]);
  XLSX.utils.book_append_sheet(wb, textSheet(['Bron', 'Rij', 'Bedrijfsnaam', 'Nr', 'Uitkomst', 'Samengevoegd met', 'Reden', 'Waarschuwingen'], log), 'Logboek');

  const per = res.perBron.map((s) => [s.bron, String(s.rijen), String(s.uniekeLeads), String(s.alleenHier), String(s.dubbelAndereLijst), String(s.dubbelBinnenLijst), String(s.waarschuwingen)]);
  XLSX.utils.book_append_sheet(wb, textSheet(['Bron', 'Rijen', 'Unieke leads', 'Alleen in deze lijst', 'Dubbel met andere lijst', 'Dubbel binnen de lijst', 'Waarschuwingen'], per), 'Per bron');

  // Eén regel per oorspronkelijke cel, inclusief lege cellen en dubbele kolomkoppen.
  // Bronrij is alleen een verwijzing binnen deze werkmap, geen blijvende Lead-ID.
  const originals = [];
  let originNr = 0;
  for (const record of prep.records) for (const origin of record.originals) {
    originNr++;
    for (const cell of origin.cellen) originals.push([res.groupOf(record.idx).nr, String(originNr), origin.bron,
      origin.blad, String(origin.rij), String(cell.kolom), cell.kop, cell.waarde]);
  }
  XLSX.utils.book_append_sheet(wb, textSheet(settings.eigenExport.oorspronkelijkeKolommen, originals), 'Oorspronkelijke gegevens');

  XLSX.utils.book_append_sheet(wb, textSheet(['Sleutel', 'Waarde'], [
    ['Tool', 'Lead-ontdubbelaar'], ['Exportformaat', settings.eigenExport.versie], ['Versie', ctx.version], ['Builddatum', ctx.buildDate || ''], ['Verwerkt op', ctx.verwerktOp || ctx.datum],
    ['Bestanden', prep.sources.map((s) => s.name).join('; ')],
    ['Rijen ingelezen', String(res.summary.rijen)], ['Unieke leads', String(res.summary.uniekeLeads)],
    ['Automatisch samengevoegd', String(res.summary.automatischSamengevoegd)], ['Door de gebruiker samengevoegd', String(res.summary.samengevoegdDoorMens)],
    ['Te controleren', String(res.summary.teControleren)],
    ['Strengheid', res.strengheid ? `${res.strengheid.label} (twijfelpaar vanaf ${res.strengheid.grenzen.teControleren} punten)` : ''],
  ]), 'Info');
  return wb;
}
