const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

test('frame rendering only applies the per-frame transform', async () => {
  const calls = [];
  const drawingContext = {
    clearRect() {}, save() { calls.push(['save']); }, restore() { calls.push(['restore']); },
    translate(x, y) { calls.push(['translate', x, y]); },
    rotate(value) { calls.push(['rotate', value]); },
    scale(x, y) { calls.push(['scale', x, y]); },
    drawImage(_image, x, y, width, height) { calls.push(['drawImage', x, y, width, height]); }
  };
  const canvas = { width: 0, height: 0, getContext: () => drawingContext };
  class FakeImage {
    constructor() { this.naturalWidth = 64; this.naturalHeight = 32; }
    set src(_value) { queueMicrotask(() => this.onload()); }
  }
  const context = { console, Image: FakeImage, document: { createElement: () => canvas } };
  context.window = context;
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'renderer/render-pipeline.js'), 'utf8'), context);

  await context.FramePickRenderPipeline.renderFrameToCanvas({
    image: 'frame.png',
    transform: { x: 4, y: 5, scale: 80, rotate: 10 }
  }, {
    width: 200,
    height: 100
  });

  assert.deepEqual(calls, [
    ['save'],
    ['translate', 100, 50],
    ['translate', 4, 5],
    ['rotate', 10 * Math.PI / 180],
    ['scale', 0.8, 0.8],
    ['drawImage', -32, -16, 64, 32],
    ['restore']
  ]);
});

test('preview resolution scale preserves logical transforms at a smaller raster size', async () => {
  const calls = [];
  const drawingContext = {
    clearRect() {}, save() {}, restore() {}, rotate() {}, scale() {},
    translate(x, y) { calls.push(['translate', x, y]); },
    drawImage(_image, x, y, width, height) { calls.push(['drawImage', x, y, width, height]); }
  };
  const canvas = { width: 0, height: 0, getContext: () => drawingContext };
  class FakeImage {
    constructor() { this.naturalWidth = 64; this.naturalHeight = 32; }
    set src(_value) { queueMicrotask(() => this.onload()); }
  }
  const context = { console, Image: FakeImage, document: { createElement: () => canvas } };
  context.window = context;
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'renderer/render-pipeline.js'), 'utf8'), context);

  await context.FramePickRenderPipeline.renderFrameToCanvas({
    image: 'frame.png',
    transform: { x: 4, y: 6, scale: 100, rotate: 0 }
  }, { width: 200, height: 100, resolutionScale: 0.5 });

  assert.equal(canvas.width, 100);
  assert.equal(canvas.height, 50);
  assert.deepEqual(calls, [
    ['translate', 50, 25],
    ['translate', 2, 3],
    ['drawImage', -16, -8, 32, 16]
  ]);
});

test('export viewport crops output while retaining the source canvas transform origin', async () => {
  const calls = [];
  const drawingContext = {
    clearRect() {}, save() {}, restore() {}, rotate() {}, scale() {},
    translate(x, y) { calls.push(['translate', x, y]); }, drawImage() {}
  };
  const canvas = { width: 0, height: 0, getContext: () => drawingContext };
  class FakeImage {
    constructor() { this.naturalWidth = 20; this.naturalHeight = 10; }
    set src(_value) { queueMicrotask(() => this.onload()); }
  }
  const context = { console, Image: FakeImage, document: { createElement: () => canvas } };
  context.window = context;
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'renderer/render-pipeline.js'), 'utf8'), context);

  await context.FramePickRenderPipeline.renderFrameToCanvas({ image: 'frame.png' }, {
    width: 200,
    height: 100,
    viewport: { width: 40, height: 30, centerX: 12, centerY: 14 }
  });
  assert.equal(canvas.width, 40);
  assert.equal(canvas.height, 30);
  assert.deepEqual(calls.slice(0, 2), [['translate', 12, 14], ['translate', 0, 0]]);
});
