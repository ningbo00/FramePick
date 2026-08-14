const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { installGodotPlugin } = require('../plugins/godot4/install');

test('Godot plugin installs only into a project root', () => {
  const directoryPath = fs.mkdtempSync(path.join(os.tmpdir(), 'framepick-plugin-'));
  try {
    assert.throws(() => installGodotPlugin({ appRoot: path.resolve(__dirname, '..'), projectDirectory: directoryPath }), /project\.godot/);
    fs.writeFileSync(path.join(directoryPath, 'project.godot'), '[application]\nconfig/name="Test"\n', 'utf8');
    const result = installGodotPlugin({ appRoot: path.resolve(__dirname, '..'), projectDirectory: directoryPath });
    assert.equal(fs.existsSync(path.join(result.pluginDirectory, 'plugin.cfg')), true);
    assert.equal(fs.existsSync(path.join(result.pluginDirectory, 'framepick_import_plugin.gd')), true);
    assert.equal(fs.existsSync(path.join(result.pluginDirectory, 'framepick_player_2d.gd')), true);
    assert.equal(fs.existsSync(path.join(result.pluginDirectory, 'framepick_sequence_controller.gd')), true);
    assert.equal(fs.existsSync(path.join(result.pluginDirectory, 'framepick_animation_player.gd')), true);
    const pluginSource = fs.readFileSync(path.join(result.pluginDirectory, 'plugin.gd'), 'utf8');
    assert.match(pluginSource, /FramePickSequenceController/);
    assert.match(pluginSource, /FramePickAnimationPlayer/);
  } finally {
    fs.rmSync(directoryPath, { recursive: true, force: true });
  }
});
