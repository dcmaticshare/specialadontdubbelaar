// Groepsbesluiten blijven ledenlijsten; ook uitsluitingen worden nooit kruisparen.
export function addGroupDecision(decisions, decision) {
  const next = new Map(decisions);
  let id = next.size;
  while (next.has(`groep:${id}`)) id++;
  next.set(`groep:${id}`, decision);
  return next;
}

// Elk besluit krijgt een kenmerk per betrokken groep. Tegenovergestelde kanten
// mogen niet samen; bij ontkoppelen mag hetzelfde kenmerk nooit tweemaal samen.
export function exclusionIndex(count, decisions, uf) {
  const labels = Array.from({ length: count }, () => new Map());
  const root = (i) => uf ? uf.find(i) : i;
  const mark = (members, key, side) => {
    for (const i of members) labels[root(i)].set(key, side);
  };
  for (const [key, d] of decisions) {
    if (d === 'verschillend') {
      const [i, j] = key.split('|').map(Number);
      mark([i], key, 1); mark([j], key, 2);
    } else if (d?.beslissing === 'verschillend') {
      mark(d.ledenA, key, 1); mark(d.ledenB, key, 2);
    } else if (d?.beslissing === 'ontkoppelen') mark(d.leden, key, 3);
  }
  const conflicts = (a, b) => {
    const [small, other] = labels[a].size < labels[b].size ? [labels[a], labels[b]] : [labels[b], labels[a]];
    for (const [key, side] of small) {
      const opposite = other.get(key);
      if (opposite && (side === 3 || side !== opposite)) return true;
    }
    return false;
  };
  const merge = (a, b) => {
    for (const [key, side] of labels[b]) labels[a].set(key, side);
    labels[b].clear();
  };
  return { labels, conflicts, merge };
}
