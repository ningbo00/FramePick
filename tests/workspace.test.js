const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');

test('canvas workspace keeps a fixed viewport while animation transforms content', () => {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
  const css = fs.readFileSync(path.join(root, 'overrides.css'), 'utf8');

  assert.match(html, /id="previewSize100"/);
  assert.match(app, /\$\('#previewSize100'\)\.onclick = \(\) => updateWorkspaceScale\(100\)/);
  assert.match(app, /videoPanel\.style\.margin = '0px';/);
  assert.doesNotMatch(app, /viewportInsets\(videoPanel\.clientWidth/);
  assert.match(css, /\.canvas-view-scroll\{height:min\(68vh,680px\);min-height:360px;max-height:none/);
  assert.match(css, /scrollbar-gutter:stable both-edges/);
  assert.match(css, /\.canvas-view-scroll::before\{[^}]*background-size:32px 32px/);
  assert.match(css, /\.video-panel\.sequence-mode\{border:1px solid/);
  assert.match(css, /\.video-panel\.sequence-mode\{[^}]*overflow:visible/);
  assert.match(css, /\.video-panel\.sequence-mode::before\{[^}]*pointer-events:none/);
});
