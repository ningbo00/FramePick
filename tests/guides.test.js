const assert = require('node:assert/strict');
const test = require('node:test');
const { loadBrowserModules } = require('./helpers/load-browser-modules');

test('guides normalize orientation, bounds, and duplicate ids', () => {
  const context = loadBrowserModules('renderer/guides.js');
  const guides = context.FramePickGuides.normalizeAll([
    { id: 'v', orientation: 'vertical', position: 300 },
    { id: 'h', orientation: 'horizontal', position: -20 },
    { id: 'v', orientation: 'vertical', position: 500 },
    { id: 'bad', orientation: 'diagonal', position: 10 }
  ], 256, 128);
  assert.deepEqual(JSON.parse(JSON.stringify(guides)), [
    { id: 'v', orientation: 'vertical', position: 256 },
    { id: 'h', orientation: 'horizontal', position: 0 }
  ]);
});

test('guides persist in schema v1 project documents', () => {
  const context = loadBrowserModules('renderer/guides.js', 'renderer/sequence-animation.js', 'renderer/frame-model.js', 'renderer/project-io.js');
  const documentData = context.FramePickProjectIo.buildDocument({
    projectName: 'Guided',
    canvasWidth: 320,
    canvasHeight: 180,
    fps: 12,
    loop: true,
    sequenceVariant: 'original',
    guides: [
      { id: 'v1', orientation: 'vertical', position: 80 },
      { id: 'h1', orientation: 'horizontal', position: 60 }
    ],
    guidesVisible: false,
    frames: [],
    assetPathForFrame: context.FramePickProjectIo.assetPathForFrame
  });
  const validated = context.FramePickProjectIo.validateDocument(JSON.parse(JSON.stringify(documentData)));
  assert.deepEqual(validated.guides, documentData.guides);
  assert.equal(validated.guidesVisible, false);
});
