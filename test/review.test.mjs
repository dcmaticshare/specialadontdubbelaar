// Synthetische wachtrijgevallen; de volgorde mag niet afhangen van de DOM.
import test from 'node:test';
import assert from 'node:assert/strict';
import { orderedReviewPairs, deferPair, pruneDeferred } from '../src/ui/review.js';
import { pairKey } from '../src/engine/cluster.js';

const a = { i: 0, j: 1, score: 80 }, b = { i: 0, j: 2, score: 70 }, c = { i: 1, j: 2, score: 60 };
const key = (p) => pairKey(p.i, p.j);

test('nieuwe paren behouden scorevolgorde; uitgestelde paren volgen hun uitstelvolgorde', () => {
  const deferred = new Set([key(c), key(a)]);
  assert.deepEqual(orderedReviewPairs([a, b, c], deferred), [b, c, a]);
});

test('Later roteert door alle uitgestelde paren, ook na meerdere volledige rondes', () => {
  const deferred = new Set();
  for (const pair of [a, b, c, a, b, c, a, b, c]) {
    assert.equal(orderedReviewPairs([a, b, c], deferred)[0], pair);
    deferPair(deferred, pair);
  }
  assert.deepEqual([...deferred], [key(a), key(b), key(c)]);
});

test('verdwenen paren verdwijnen uit uitstel zonder de overige volgorde te veranderen', () => {
  const deferred = new Set([key(c), key(a), key(b), '8|9']);
  pruneDeferred([a, c], deferred);
  assert.deepEqual([...deferred], [key(c), key(a)]);
  assert.deepEqual(orderedReviewPairs([a, c], deferred), [c, a]);
  pruneDeferred([], deferred);
  assert.equal(deferred.size, 0);
  assert.deepEqual(orderedReviewPairs([], deferred), []);
});

test('één uitgesteld paar blijft bereikbaar zonder dubbele sleutels', () => {
  const deferred = new Set();
  deferPair(deferred, a); deferPair(deferred, a);
  assert.deepEqual(orderedReviewPairs([a], deferred), [a]);
  assert.deepEqual([...deferred], [key(a)]);
});
