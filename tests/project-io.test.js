const assert = require('node:assert/strict');
const test = require('node:test');
const { loadBrowserModules } = require('./helpers/load-browser-modules');

function sampleFrame(FrameModel) {
  return FrameModel.create({
    id: 'frame-1',
    name: 'idle-1',
    image: 'data:image/png;base64,AA==',
    source: { type: 'video', fileName: 'idle.mp4', sourceTimeMs: 1750, sourceFrameIndex: 42 },
    delayMs: 250,
    width: 256,
    height: 256,
    transform: { x: 4, y: -2, scale: 100, rotate: 1 }
  });
}

test('project document JSON round-trips every sequence animation field', () => {
  const context = loadBrowserModules('renderer/sequence-animation.js', 'renderer/frame-model.js', 'renderer/project-io.js');
  const motion = context.FramePickSequenceAnimation.create({
    enabled: true,
    keyframes: [
      { id: 'start', timeMs: 0, x: -12, y: 8, scale: 96, rotate: -4, curve: 'custom', bezier: [0.12, 0.34, 0.56, 0.78] },
      { id: 'middle', timeMs: 375, x: 21, y: -9, scale: 104.5, rotate: 7.25, curve: 'ease-out' },
      { id: 'end', timeMs: 1000, x: 0, y: 0, scale: 100, rotate: 0, curve: 'linear' }
    ]
  });
  const documentData = context.FramePickProjectIo.buildDocument({
    projectName: 'Idle',
    canvasWidth: 1024,
    canvasHeight: 1024,
    fps: 4,
    loop: true,
    sequenceVariant: 'original',
    sequenceAnimation: motion,
    frames: [sampleFrame(context.FrameModel)],
    assetPathForFrame: context.FramePickProjectIo.assetPathForFrame
  });
  const reopened = JSON.parse(JSON.stringify(documentData));
  const validated = context.FramePickProjectIo.validateDocument(reopened);
  assert.equal(reopened.frames[0].source.sourceFrameIndex, 42);
  assert.deepEqual(
    JSON.parse(JSON.stringify(validated.sequenceAnimation)),
    JSON.parse(JSON.stringify(motion))
  );
});

test('schema v1 projects without sequenceAnimation remain readable', () => {
  const context = loadBrowserModules('renderer/sequence-animation.js', 'renderer/frame-model.js', 'renderer/project-io.js');
  const documentData = context.FramePickProjectIo.buildDocument({
    projectName: 'Legacy',
    canvasWidth: 256,
    canvasHeight: 256,
    fps: 12,
    loop: true,
    sequenceVariant: 'original',
    frames: [sampleFrame(context.FrameModel)],
    assetPathForFrame: context.FramePickProjectIo.assetPathForFrame
  });
  delete documentData.sequenceAnimation;
  delete documentData.frames[0].source.sourceFrameIndex;
  const validated = context.FramePickProjectIo.validateDocument(documentData);
  assert.equal(validated.sequenceAnimation.enabled, false);
  assert.equal(validated.sequenceAnimation.keyframes.length, 1);
  assert.equal(validated.sequenceAnimation.keyframes[0].scale, 100);
});
