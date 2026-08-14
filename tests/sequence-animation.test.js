const assert = require('node:assert/strict');
const test = require('node:test');
const { loadBrowserModules } = require('./helpers/load-browser-modules');

test('disabled and missing animations evaluate to identity', () => {
  const { FramePickSequenceAnimation: animation } = loadBrowserModules('renderer/sequence-animation.js');
  assert.deepEqual({ ...animation.evaluate(undefined, 500) }, { x: 0, y: 0, scale: 100, rotate: 0 });
  assert.equal(animation.create(null).enabled, false);
});

test('breathing preset closes its loop and interpolates smoothly', () => {
  const { FramePickSequenceAnimation: animation } = loadBrowserModules('renderer/sequence-animation.js');
  const breathing = animation.breathing(1000, 3);
  assert.deepEqual(Array.from(breathing.keyframes, ({ timeMs, scale }) => [timeMs, scale]), [[0, 100], [500, 103], [1000, 100]]);
  assert.equal(animation.evaluate(breathing, 0).scale, 100);
  assert.equal(animation.evaluate(breathing, 500).scale, 103);
  assert.equal(animation.evaluate(breathing, 1000).scale, 100);
  assert.ok(Math.abs(animation.evaluate(breathing, 250).scale - 101.5) < 0.01);
  assert.ok(Math.abs(animation.evaluate(breathing, 750).scale - 101.5) < 0.01);
});

test('custom Bezier interpolation and duplicate-time normalization are deterministic', () => {
  const { FramePickSequenceAnimation: animation } = loadBrowserModules('renderer/sequence-animation.js');
  const value = animation.create({
    enabled: true,
    keyframes: [
      { id: 'start', timeMs: 0, x: 0, y: 0, scale: 100, rotate: 0, curve: 'custom', bezier: [0, 0, 1, 1] },
      { id: 'old-end', timeMs: 1000, x: 90, y: 0, scale: 100, rotate: 0 },
      { id: 'end', timeMs: 1000, x: 100, y: 0, scale: 100, rotate: 0 }
    ]
  });
  assert.equal(value.keyframes.length, 2);
  assert.equal(value.keyframes[1].id, 'end');
  assert.ok(Math.abs(animation.evaluate(value, 500).x - 50) < 0.01);
});

test('whole-canvas viewport insets preserve transformed bounds in every direction', () => {
  const { FramePickSequenceAnimation: animation } = loadBrowserModules('renderer/sequence-animation.js');
  assert.deepEqual({ ...animation.viewportInsets(200, 100, { x: 0, y: 0, scale: 100, rotate: 0 }) }, { top: 0, right: 0, bottom: 0, left: 0 });
  assert.deepEqual({ ...animation.viewportInsets(200, 100, { x: 10, y: -5, scale: 200, rotate: 0 }) }, { top: 55, right: 110, bottom: 45, left: 90 });
  assert.deepEqual({ ...animation.viewportInsets(200, 100, { x: 0, y: 0, scale: 100, rotate: 90 }) }, { top: 50, right: 0, bottom: 50, left: 0 });
});
