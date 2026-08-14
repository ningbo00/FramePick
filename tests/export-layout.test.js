const assert = require('node:assert/strict');
const test = require('node:test');
const { loadBrowserModules } = require('./helpers/load-browser-modules');

test('export layout only includes per-frame transforms', () => {
  const { FramePickExportLayout: layout } = loadBrowserModules('renderer/export-layout.js');
  const bounds = layout.transformedContentBounds({
    imageWidth: 100,
    imageHeight: 50,
    contentBounds: { left: 0, top: 0, right: 100, bottom: 50 },
    frameTransform: { x: 10, y: 0, scale: 100, rotate: 0 },
    canvasWidth: 200,
    canvasHeight: 200
  });
  assert.deepEqual({ ...bounds }, { minX: 60, minY: 75, maxX: 160, maxY: 125 });
  const union = layout.unionBounds([bounds]);
  assert.deepEqual({ ...union }, { minX: 60, minY: 75, maxX: 160, maxY: 125, width: 100, height: 50 });
  assert.deepEqual({ ...layout.viewportForBounds(union, 200, 200) }, { width: 100, height: 50, centerX: 40, centerY: 25 });
});

test('export layout uses visible alpha bounds and preserves rotation extent', () => {
  const { FramePickExportLayout: layout } = loadBrowserModules('renderer/export-layout.js');
  const bounds = layout.transformedContentBounds({
    imageWidth: 100,
    imageHeight: 100,
    contentBounds: { left: 25, top: 40, right: 75, bottom: 60 },
    frameTransform: { x: 0, y: 0, scale: 100, rotate: 90 },
    canvasWidth: 200,
    canvasHeight: 200
  });
  const union = layout.unionBounds([bounds]);
  assert.equal(union.width, 20);
  assert.equal(union.height, 50);
});
