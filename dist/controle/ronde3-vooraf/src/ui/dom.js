// Kleine DOM-helper: h(tag, attributen, ...kinderen). Tekst wordt altijd als tekst gezet, nooit als HTML.
export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'class') el.className = v;
    else if (k === 'value') el.value = v;
    else if (k === 'checked' || k === 'disabled' || k === 'selected' || k === 'multiple') el[k] = !!v;
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  append(el, children);
  return el;
}

export function append(el, children) {
  for (const c of children.flat(Infinity)) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

export function clear(el) {
  while (el.firstChild) el.removeChild(el.firstChild);
  return el;
}

export function select(options, current, onChange, attrs = {}) {
  const el = h('select', { ...attrs, onChange: (e) => onChange(e.target.value) },
    options.map(([value, label]) => h('option', { value, selected: value === current }, label)));
  el.value = current;
  return el;
}

export function table(header, rows, { className = 'grid', cellClass = () => '' } = {}) {
  return h('table', { class: className },
    h('thead', {}, h('tr', {}, header.map((x) => h('th', {}, x)))),
    h('tbody', {}, rows.map((r, ri) => h('tr', {}, r.map((c, ci) => h('td', { class: cellClass(ri, ci, c) || null }, c))))));
}
