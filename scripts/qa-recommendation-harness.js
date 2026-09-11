'use strict';

const assert = require('node:assert/strict');
const taste = require('../taste-engine-v5.js');

const uniqueIds = items => new Set(items.map(item => item.id)).size === items.length;
const categoryCounts = items => items.reduce((counts, item) => {
  counts.set(item.category, (counts.get(item.category) || 0) + 1);
  return counts;
}, new Map());
const report = (name, items) => {
  console.log(`${name}: ${items.map(item => `${item.recommendation.bucket}:${item.id}`).join(' | ')}`);
};

// A new visitor should be able to start immediately, without a narrow or repetitive feed.
const cold = taste.recommendWork(4, 'harness-cold');
assert.equal(cold.length, 4, 'cold start must return four work recommendations');
assert.ok(uniqueIds(cold), 'cold start must not repeat a set');
assert.ok(cold.every(item => item.recommendation.bucket === 'explore'), 'cold start must remain exploratory');
assert.ok([...categoryCounts(cold).values()].every(count => count <= 2), 'cold start must not over-concentrate one service category');
report('cold start', cold);

// A visitor who saves a bold chrome direction should see it reflected, without losing discovery.
const chrome = taste.catalogs.work().find(item => item.id === 'set_03');
const minimalChrome = taste.catalogs.work().find(item => item.id === 'set_10');
assert.ok(chrome && minimalChrome, 'harness seeds must exist');
taste.saveItem(chrome);
taste.saveItem(minimalChrome);

const profile = taste.snapshot();
assert.equal(profile.established, true, 'two deliberate saves must establish a direction');
assert.ok(profile.topPreferences.some(([feature]) => feature.includes('chrome')), 'profile must retain chrome affinity');

const personalized = taste.recommendWork(4, 'harness-personalized');
assert.equal(personalized.length, 4, 'personalized feed must return four items');
assert.ok(uniqueIds(personalized), 'personalized feed must not repeat a set');
assert.ok(personalized.some(item => item.recommendation.bucket === 'core'), 'personalized feed needs a close-match lane');
assert.ok(personalized.some(item => item.recommendation.bucket === 'adjacent'), 'personalized feed needs an adjacent lane');
assert.ok(personalized.some(item => item.recommendation.bucket === 'explore'), 'personalized feed needs an exploration lane');
assert.ok(!personalized.some(item => ['set_03', 'set_10'].includes(item.id)), 'saved sets must not be immediately re-recommended');
assert.ok([...categoryCounts(personalized).values()].every(count => count <= 2), 'personalized feed must keep category variety');
report('chrome-led profile', personalized);

// A direct negative signal must enter the profile and lower the affinity of the rejected direction.
const rejected = taste.catalogs.work().find(item => item.id === 'set_04');
const neutral = taste.catalogs.work().find(item => item.id === 'set_14');
assert.ok(rejected && neutral, 'harness comparison items must exist');
taste.track('dislike', rejected, { surface:'harness-personalized' });
const afterDislike = taste.buildProfile();
assert.ok(afterDislike.ordered.some(([, score]) => score < 0), 'a dislike must be recorded as a negative preference');
assert.ok(
  taste._test.affinity(rejected, afterDislike) < taste._test.affinity(neutral, afterDislike),
  'a rejected direction must rank below a neutral direction when the profile is otherwise chrome-led'
);

const inspo = taste.recommendInspo(4, 'harness-inspo');
assert.equal(inspo.length, 4, 'the inspiration rail must also stay populated');
assert.ok(uniqueIds(inspo), 'the inspiration rail must not repeat cards');
report('inspo after feedback', inspo);

console.log('Lune recommendation harness passed');
