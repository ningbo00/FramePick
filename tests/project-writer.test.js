const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { writeProjectPayload } = require('../electron/project-writer');

const PNG = 'data:image/png;base64,AA==';

function projectDocument(aiAvailable) {
  return {
    format: 'framepick-project',
    schemaVersion: 1,
    sequenceAnimation: {
      enabled: true,
      keyframes: [{ id: 'motion-a', timeMs: 125, x: 3, y: -4, scale: 102, rotate: 1.5, curve: 'custom', bezier: [0.1, 0.2, 0.7, 0.9] }]
    },
    frames: [{
      variants: {
        original: { imagePath: 'frames/frame_0001_original.png' },
        ai: { available: aiAvailable, imagePath: aiAvailable ? 'frames/frame_0001_ai.png' : null }
      }
    }]
  };
}

function sequenceSnapshot(aiAvailable) {
  const files = {
    original: 'original/frame_0001.png',
    ai: aiAvailable ? 'ai/frame_0001.png' : null,
    transformed: 'transformed/frame_0001.png'
  };
  const manifest = { format: 'framepick-sequence', schemaVersion: 1, frameCount: 1, frames: [{ index: 0, file: files.transformed, files }] };
  const outputFiles = { [files.original]: PNG, [files.transformed]: PNG };
  if (files.ai) outputFiles[files.ai] = PNG;
  return { manifest: JSON.stringify(manifest), files: outputFiles };
}

function payload(aiAvailable) {
  const assets = { 'frames/frame_0001_original.png': PNG };
  if (aiAvailable) assets['frames/frame_0001_ai.png'] = PNG;
  return { data: JSON.stringify(projectDocument(aiAvailable)), assets, sequence: sequenceSnapshot(aiAvailable) };
}

test('project save writes project assets and a complete sequence snapshot', () => {
  const directoryPath = fs.mkdtempSync(path.join(os.tmpdir(), 'framepick-project-'));
  const filePath = path.join(directoryPath, 'Hero.fpproj');
  try {
    writeProjectPayload(filePath, payload(true));
    assert.equal(fs.existsSync(filePath), true);
    assert.equal(fs.existsSync(path.join(directoryPath, 'frames', 'frame_0001_original.png')), true);
    assert.equal(fs.existsSync(path.join(directoryPath, 'frames', 'frame_0001_ai.png')), true);
    assert.equal(fs.existsSync(path.join(directoryPath, 'sequence', 'sequence.json')), true);
    assert.equal(fs.existsSync(path.join(directoryPath, 'sequence', 'original', 'frame_0001.png')), true);
    assert.equal(fs.existsSync(path.join(directoryPath, 'sequence', 'ai', 'frame_0001.png')), true);
    assert.equal(fs.existsSync(path.join(directoryPath, 'sequence', 'transformed', 'frame_0001.png')), true);
    assert.deepEqual(JSON.parse(fs.readFileSync(filePath, 'utf8')).sequenceAnimation, projectDocument(true).sequenceAnimation);

    writeProjectPayload(filePath, payload(false));
    assert.equal(fs.existsSync(path.join(directoryPath, 'frames', 'frame_0001_ai.png')), false);
    assert.deepEqual(fs.readdirSync(path.join(directoryPath, 'sequence', 'ai')), []);
  } finally {
    fs.rmSync(directoryPath, { recursive: true, force: true });
  }
});

test('project save rejects an incomplete sequence snapshot before writing the project file', () => {
  const directoryPath = fs.mkdtempSync(path.join(os.tmpdir(), 'framepick-project-'));
  const filePath = path.join(directoryPath, 'Broken.fpproj');
  try {
    const invalid = payload(false);
    delete invalid.sequence.files['transformed/frame_0001.png'];
    assert.throws(() => writeProjectPayload(filePath, invalid), /不完整/);
    assert.equal(fs.existsSync(filePath), false);
  } finally {
    fs.rmSync(directoryPath, { recursive: true, force: true });
  }
});
