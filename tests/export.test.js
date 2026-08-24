const assert = require('node:assert/strict');
const test = require('node:test');
const { loadBrowserModules } = require('./helpers/load-browser-modules');

test('sequence manifest separates original, AI, and transformed frame paths', () => {
  const context = loadBrowserModules('renderer/sequence-animation.js', 'renderer/export.js');
  const frames = [
    { id: 'one', name: 'one', delay: 100, time: 0, source: { type: 'video', fileName: 'one.mp4', sourceTimeMs: 500, sourceFrameIndex: 12 }, transform: { x: 1 }, variants: { backgroundRemoved: 'ai-one', transform: { x: 2 } } },
    { id: 'two', name: 'two', delay: 120, time: 0, source: { type: 'image', fileName: 'two.png', sourceTimeMs: 0 }, transform: { x: 3 }, variants: { transform: { x: 4 } } }
  ];
  const manifest = context.FramePickExport.buildSequenceManifest({
    frames,
    sequenceVariant: 'ai',
    sequenceAnimation: context.FramePickSequenceAnimation.create(),
    fps: 12,
    loop: false,
    width: 256,
    height: 256,
    sourceCanvas: { width: 1024, height: 1024 },
    contentBounds: { x: 384, y: 384, width: 256, height: 256 },
    frameTransform: (frame, variant) => ({ x: variant === 'ai' ? frame.variants.transform.x : frame.transform.x, y: 0, scale: 100, rotate: 0 })
  });

  assert.deepEqual({ ...manifest.directories }, { original: 'original', ai: 'ai', transformed: 'transformed' });
  assert.deepEqual({ ...manifest.sourceCanvas }, { width: 1024, height: 1024 });
  assert.deepEqual({ ...manifest.contentBounds }, { x: 384, y: 384, width: 256, height: 256 });
  assert.equal(manifest.loop, false);
  assert.equal(manifest.frames[0].file, 'transformed/frame_0001.png');
  assert.deepEqual({ ...manifest.frames[0].files }, {
    original: 'original/frame_0001.png',
    ai: 'ai/frame_0001.png',
    transformed: 'transformed/frame_0001.png'
  });
  assert.equal(manifest.frames[0].transforms.original.x, 1);
  assert.equal(manifest.frames[0].transforms.ai.x, 2);
  assert.equal(manifest.frames[0].source.sourceFrameIndex, 12);
  assert.equal(manifest.frames[1].files.ai, null);
  assert.equal(manifest.sequenceAnimation.target, 'output-node');
  assert.equal(manifest.sequenceAnimation.bakedIntoFrames, false);
  assert.deepEqual({ ...manifest.sequenceAnimation.pivot }, { x: 0.5, y: 0.5 });
});
