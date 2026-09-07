const assert = require('assert');
const discovery = require('./discovery-experience.js');

assert.equal(discovery.strongestSeed('Chrome Artistry'), 'chrome');
assert.equal(discovery.strongestSeed('Classic French Tips'), 'classic');
assert(discovery.overlapScore('Chrome Artistry', 'Minimal chrome ribbon') > 0);
assert.equal(discovery.overlapScore('Chrome Artistry', 'Soft nude ombre'), 0);
assert.equal(discovery.workUrl('set_03'), 'work.html?set=set_03');
assert.equal(discovery.inspoUrl('inspo_3-chrome-artistry'), 'inspo.html?look=inspo_3-chrome-artistry');
console.log('discovery-experience tests passed');