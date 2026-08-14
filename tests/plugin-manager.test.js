const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');
const { createPluginManager } = require('../electron/plugin-manager');

const appRoot = path.resolve(__dirname, '..');

test('plugin manager discovers export formats and actions without engine-specific core wiring', () => {
  const manager = createPluginManager(appRoot);
  const plugin = manager.list().find((entry) => entry.id === 'godot4');
  assert.ok(plugin);
  assert.equal(plugin.name, 'Godot 4');
  assert.deepEqual(plugin.exportFormats.map((format) => format.id), ['godot']);
  assert.deepEqual(plugin.actions.map((action) => action.id), ['install']);
});

test('plugin manager rejects unknown plugins and plugin formats', () => {
  const manager = createPluginManager(appRoot);
  assert.throws(() => manager.export('missing', 'anything', {}), /插件不存在/);
  assert.throws(() => manager.export('godot4', 'missing', {}), /导出格式不受支持/);
});
