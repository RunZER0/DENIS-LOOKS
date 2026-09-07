const assert = require('node:assert/strict');
const engine = require('./taste-engine-v5.js');

const cold = engine.recommendWork(4, 'test-cold');
assert.equal(cold.length, 4, 'cold start must never be blank');
assert.ok(cold.every(x => x.recommendation.bucket === 'explore'), 'cold start should stay deliberately broad');

const chromeMinimal = engine.catalogs.work().find(x => x.id === 'set_10');
const chrome3d = engine.catalogs.work().find(x => x.id === 'set_03');
engine.track('save', chromeMinimal, { surface: 'test' });
assert.equal(engine.snapshot().established, false, 'one strong signal should not lock the profile');
engine.track('save', chrome3d, { surface: 'test' });
assert.equal(engine.snapshot().established, true, 'two strong signals should establish a usable direction');

const warm = engine.recommendWork(4, 'test-warm');
assert.equal(warm.length, 4, 'personalized recommendations must never be blank');
assert.ok(warm.some(x => x.recommendation.bucket === 'core'), 'personalized feed needs close matches');
assert.ok(warm.some(x => x.recommendation.bucket === 'adjacent'), 'personalized feed needs adjacent discovery');
assert.ok(warm.some(x => x.recommendation.bucket === 'explore'), 'personalized feed must retain exploration');

const categoryCounts = warm.reduce((m, x) => m.set(x.category, (m.get(x.category) || 0) + 1), new Map());
assert.ok([...categoryCounts.values()].every(n => n <= 2), 'one category must not dominate a four-item recommendation group');

engine.track('dislike', warm[0], { surface: 'test-warm' });
const snapshot = engine.snapshot();
assert.ok(snapshot.negativePreferences.length > 0, 'explicit negative feedback must enter the taste profile');

console.log('taste-engine-v5: all tests passed');