const test = require('node:test');
const assert = require('node:assert/strict');
const { loadBrowserModules } = require('./helpers/load-browser-modules');

const { FramePickVideoSampling: sampling } = loadBrowserModules('renderer/video-sampling.js');

test('video sampling creates a whole-video plan at the requested frame interval', () => {
  const plan = sampling.createPlan(1, 5, 24);
  assert.deepEqual(Array.from(plan, ({ frameIndex }) => frameIndex), [0, 5, 10, 15, 20]);
  assert.deepEqual(Array.from(plan, ({ sourceTimeMs }) => sourceTimeMs), [0, 208, 417, 625, 833]);
});

test('video sampling includes the final partial source-frame span without seeking to duration', () => {
  const plan = sampling.createPlan(1.01, 24, 24);
  assert.deepEqual(Array.from(plan, ({ frameIndex }) => frameIndex), [0, 24]);
  assert.ok(plan.every(({ timeSeconds }) => timeSeconds < 1.01));
});

test('video sampling normalizes invalid intervals and empty durations', () => {
  assert.equal(sampling.normalizeIntervalFrames(0), 1);
  assert.equal(sampling.normalizeIntervalFrames('3.9'), 3);
  assert.deepEqual(Array.from(sampling.createPlan(0, 3, 24)), []);
  assert.deepEqual(Array.from(sampling.createPlan(Number.NaN, 3, 24)), []);
});

test('source position prefers the recorded frame index and supports legacy source time', () => {
  assert.deepEqual(
    { ...sampling.sourcePosition({ sourceFrameIndex: 17, sourceTimeMs: 9999 }, 24) },
    { frameIndex: 17, timeSeconds: 17 / 24, sourceTimeMs: 708 }
  );
  assert.deepEqual(
    { ...sampling.sourcePosition({ sourceTimeMs: 208 }, 24) },
    { frameIndex: 5, timeSeconds: 5 / 24, sourceTimeMs: 208 }
  );
});
