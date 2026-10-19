// Wachtrij zonder DOM: nieuwe paren eerst, uitgestelde paren in uitstelvolgorde.
import { pairKey } from '../engine/cluster.js';

export function orderedReviewPairs(review, deferred) {
  const byKey = new Map(review.map((p) => [pairKey(p.i, p.j), p]));
  return [
    ...review.filter((p) => !deferred.has(pairKey(p.i, p.j))),
    ...[...deferred].filter((key) => byKey.has(key)).map((key) => byKey.get(key)),
  ];
}

export function deferPair(deferred, pair) {
  const key = pairKey(pair.i, pair.j);
  deferred.delete(key);
  deferred.add(key);
}

export function pruneDeferred(review, deferred) {
  const active = new Set(review.map((p) => pairKey(p.i, p.j)));
  for (const key of deferred) if (!active.has(key)) deferred.delete(key);
}
