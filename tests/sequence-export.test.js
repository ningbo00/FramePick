const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { writeSequenceExport } = require('../electron/sequence-export');

const PNG = 'data:image/png;base64,AA==';

function manifest(frameCount, aiIndexes = []) {
  return {
    format: 'framepick-sequence',
    schemaVersion: 1,
    frameCount,
    frames: Array.from({ length: frameCount }, (_, index) => {
      const number = String(index + 1).padStart(4, '0');
      const files = {
        original: `original/frame_${number}.png`,
        ai: aiIndexes.includes(index) ? `ai/frame_${number}.png` : null,
        transformed: `transformed/frame_${number}.png`
      };
      return { index, file: files.transformed, files };
    })
  };
}

function filesFor(documentData) {
  const files = {};
  documentData.frames.forEach((entry) => {
    files[entry.files.original] = PNG;
    files[entry.files.transformed] = PNG;
    if (entry.files.ai) files[entry.files.ai] = PNG;
  });
  return files;
}

test('sequence export writes three directories and removes stale frame files', () => {
  const directoryPath = fs.mkdtempSync(path.join(os.tmpdir(), 'framepick-sequence-'));
  try {
    for (const name of ['original', 'ai', 'transformed', 'frames']) fs.mkdirSync(path.join(directoryPath, name));
    for (const name of ['original', 'ai', 'transformed']) fs.writeFileSync(path.join(directoryPath, name, 'frame_0099.png'), 'stale');
    fs.writeFileSync(path.join(directoryPath, 'frames', 'frame_0001.png'), 'legacy');
    fs.writeFileSync(path.join(directoryPath, 'original', 'keep.txt'), 'keep');

    const firstManifest = manifest(2, [0]);
    writeSequenceExport({ directoryPath, manifest: JSON.stringify(firstManifest), files: filesFor(firstManifest) });
    assert.deepEqual(fs.readdirSync(path.join(directoryPath, 'original')).sort(), ['frame_0001.png', 'frame_0002.png', 'keep.txt']);
    assert.deepEqual(fs.readdirSync(path.join(directoryPath, 'ai')), ['frame_0001.png']);
    assert.deepEqual(fs.readdirSync(path.join(directoryPath, 'transformed')).sort(), ['frame_0001.png', 'frame_0002.png']);
    assert.equal(fs.existsSync(path.join(directoryPath, 'frames')), false);

    const secondManifest = manifest(1);
    writeSequenceExport({ directoryPath, manifest: JSON.stringify(secondManifest), files: filesFor(secondManifest) });
    assert.deepEqual(fs.readdirSync(path.join(directoryPath, 'original')).sort(), ['frame_0001.png', 'keep.txt']);
    assert.deepEqual(fs.readdirSync(path.join(directoryPath, 'ai')), []);
    assert.deepEqual(fs.readdirSync(path.join(directoryPath, 'transformed')), ['frame_0001.png']);
  } finally {
    fs.rmSync(directoryPath, { recursive: true, force: true });
  }
});

test('sequence export rejects files outside the declared frame set', () => {
  const directoryPath = fs.mkdtempSync(path.join(os.tmpdir(), 'framepick-sequence-'));
  try {
    const documentData = manifest(1);
    const files = filesFor(documentData);
    files['../escape.png'] = PNG;
    assert.throws(() => writeSequenceExport({ directoryPath, manifest: JSON.stringify(documentData), files }), /不完整/);
  } finally {
    fs.rmSync(directoryPath, { recursive: true, force: true });
  }
});
