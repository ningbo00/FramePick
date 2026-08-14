const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { buildGodotManifest, writeGodotExport } = require('../plugins/godot4/export');

const PNG = 'data:image/png;base64,AA==';

function sequence(frameCount = 2) {
  const frames = Array.from({ length: frameCount }, (_, index) => {
    const number = String(index + 1).padStart(4, '0');
    return {
      index,
      file: `transformed/frame_${number}.png`,
      files: { original: `original/frame_${number}.png`, ai: null, transformed: `transformed/frame_${number}.png` },
      delayMs: index ? 125 : 83,
      name: `idle-${index + 1}`
    };
  });
  return {
    format: 'framepick-sequence',
    schemaVersion: 1,
    canvas: { width: 96, height: 128 },
    sourceCanvas: { width: 256, height: 256 },
    contentBounds: { x: 80, y: 64, width: 96, height: 128 },
    fps: 12,
    loop: true,
    frameCount,
    frames,
    sequenceAnimation: {
      enabled: true,
      keyframes: [
        { id: 'a', timeMs: 0, x: 0, y: 0, scale: 100, rotate: 0, curve: 'custom', bezier: [0.1, 0.2, 0.7, 0.9] },
        { id: 'b', timeMs: 208, x: 5, y: -3, scale: 103, rotate: 2, curve: 'linear', bezier: [0, 0, 1, 1] }
      ]
    }
  };
}

function filesFor(manifest) {
  const files = {};
  for (const frame of manifest.frames) {
    files[frame.files.original] = PNG;
    files[frame.files.transformed] = PNG;
  }
  return files;
}

test('Godot manifest preserves delays and exports node animation separately', () => {
  const manifest = buildGodotManifest(sequence(), 'Hero Idle');
  assert.equal(manifest.format, 'framepick-godot-sequence');
  assert.deepEqual(manifest.frames.map((frame) => frame.delayMs), [83, 125]);
  assert.equal(manifest.totalDurationMs, 208);
  assert.equal(manifest.nodeAnimation.target, 'output-node');
  assert.equal(manifest.nodeAnimation.bakedIntoFrames, false);
  assert.deepEqual(manifest.nodeAnimation.keyframes[0].bezier, [0.1, 0.2, 0.7, 0.9]);
});

test('Godot package writes transformed PNGs and removes stale numbered frames', () => {
  const directoryPath = fs.mkdtempSync(path.join(os.tmpdir(), 'framepick-godot-'));
  try {
    const first = sequence(2);
    const result = writeGodotExport({ directoryPath, name: 'Hero Idle', manifest: JSON.stringify(first), files: filesFor(first) });
    assert.equal(fs.existsSync(result.manifestPath), true);
    assert.deepEqual(fs.readdirSync(path.join(result.outputDirectory, 'frames')).sort(), ['frame_0001.png', 'frame_0002.png']);
    const written = JSON.parse(fs.readFileSync(result.manifestPath, 'utf8'));
    assert.deepEqual(written.frames.map((frame) => frame.file), ['frames/frame_0001.png', 'frames/frame_0002.png']);

    const second = sequence(1);
    writeGodotExport({ directoryPath, name: 'Hero Idle', manifest: JSON.stringify(second), files: filesFor(second) });
    assert.deepEqual(fs.readdirSync(path.join(result.outputDirectory, 'frames')), ['frame_0001.png']);
  } finally {
    fs.rmSync(directoryPath, { recursive: true, force: true });
  }
});
