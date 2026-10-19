// Kleine tekstfuncties zonder afhankelijkheden.

export function stripAccents(s) {
  return String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

// Typografische aanhalingstekens naar gewone.
const QUOTE_REPLACEMENTS = {
  '‘': "'", '’': "'", '‚': "'", '‛': "'", '′': "'", '´': "'", '`': "'",
  '“': '"', '”': '"', '„': '"', '″': '"', '–': '-', '—': '-', '−': '-', '\u00a0': ' ',
};
export function cleanQuotes(s) {
  // Eén doorgang; de gebruikelijke tekst zonder deze tekens krijgt geen vier vervangingsrondes.
  return String(s).replace(/[‘’‚‛′´`“”„″–—−\u00a0]/g, (c) => QUOTE_REPLACEMENTS[c]);
}

export function squeeze(s) {
  return String(s).replace(/\s+/g, ' ').trim();
}

// Bewerkingsafstand met omwisseling van buurletters (optimal string alignment).
export function damerauLevenshtein(a, b, max = Infinity) {
  if (a === b) return 0;
  const la = a.length, lb = b.length;
  if (la === 0) return lb;
  if (lb === 0) return la;
  if (Math.abs(la - lb) > max) return max + 1;
  let prev2 = null;
  let prev = new Array(lb + 1);
  for (let j = 0; j <= lb; j++) prev[j] = j;
  for (let i = 1; i <= la; i++) {
    const cur = new Array(lb + 1);
    cur[0] = i;
    let rowMin = cur[0];
    const ca = a.charCodeAt(i - 1);
    for (let j = 1; j <= lb; j++) {
      const cb = b.charCodeAt(j - 1);
      const cost = ca === cb ? 0 : 1;
      let v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      if (i > 1 && j > 1 && ca === b.charCodeAt(j - 2) && a.charCodeAt(i - 2) === cb) {
        v = Math.min(v, prev2[j - 2] + 1);
      }
      cur[j] = v;
      if (v < rowMin) rowMin = v;
    }
    if (rowMin > max) return max + 1;
    prev2 = prev;
    prev = cur;
  }
  return prev[lb];
}

export function todayIso(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function nowIso(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${todayIso(d)} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
