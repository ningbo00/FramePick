const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const css = fs.readFileSync(path.join(__dirname, '..', 'overrides.css'), 'utf8');

test('whole-canvas animation can render beyond the untransformed canvas slot', () => {
  assert.match(css, /\.video-panel\.sequence-mode\s*\{[^}]*overflow\s*:\s*visible/i);
  assert.match(css, /\.video-panel\.sequence-mode\s+\.sequence-preview-overlay\s*\{[^}]*background-image/i);
  assert.match(css, /\.video-panel\.sequence-mode\s+\.capture-fab[^}]*display\s*:\s*none/i);
});
