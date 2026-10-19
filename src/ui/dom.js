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

// Alleen vluchtige schermtoestand: geen brongegevens of blijvende browseropslag.
export function captureView(root) {
  const active = root.ownerDocument.activeElement;
  const inside = root.contains(active);
  const win = root.ownerDocument.defaultView;
  return {
    focus: inside ? active.getAttribute('data-focus') : null,
    id: inside ? active.id : null,
    outside: !inside && active !== root.ownerDocument.body,
    selection: inside && typeof active.selectionStart === 'number'
      ? [active.selectionStart, active.selectionEnd, active.selectionDirection] : null,
    scroll: [...root.querySelectorAll('[data-scroll]')].map((el) => [el.getAttribute('data-scroll'), el.scrollLeft, el.scrollTop]),
    window: [win.scrollX, win.scrollY],
  };
}

export function restoreView(root, saved) {
  const nodes = [...root.querySelectorAll('[data-focus], [id]')];
  const target = saved && nodes.find((el) => saved.focus
    ? el.getAttribute('data-focus') === saved.focus : saved.id && el.id === saved.id);
  if (!saved?.outside) {
    const focus = target && !target.closest('[inert]') && !target.disabled ? target : root.querySelector('main');
    focus?.focus({ preventScroll: true });
    if (focus === target && saved?.selection) target.setSelectionRange(...saved.selection);
  }
  if (!saved) return;
  const positions = new Map(saved.scroll.map(([key, left, top]) => [key, { left, top }]));
  for (const el of root.querySelectorAll('[data-scroll]')) {
    const position = positions.get(el.getAttribute('data-scroll'));
    if (position) { el.scrollLeft = position.left; el.scrollTop = position.top; }
  }
  root.ownerDocument.defaultView.scrollTo({ left: saved.window[0], top: saved.window[1], behavior: 'instant' });
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
