const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { writeGodotExport } = require('../plugins/godot4/export');

const projectRoot = path.resolve(__dirname, '..');
const godotExecutable = process.argv[2];
if (!godotExecutable || !fs.existsSync(godotExecutable)) {
  console.error('Usage: node scripts/validate-godot-plugin.js <godot-console-executable>');
  process.exit(2);
}

const temporaryProject = fs.mkdtempSync(path.join(os.tmpdir(), 'framepick-godot-smoke-'));
try {
  fs.copyFileSync(path.join(projectRoot, 'tests', 'godot-smoke', 'project.godot'), path.join(temporaryProject, 'project.godot'));
  fs.copyFileSync(path.join(projectRoot, 'tests', 'godot-smoke', 'verify_import.gd'), path.join(temporaryProject, 'verify_import.gd'));
  fs.cpSync(
    path.join(projectRoot, 'plugins', 'godot4', 'framepick_importer'),
    path.join(temporaryProject, 'addons', 'framepick_importer'),
    { recursive: true }
  );
  const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
  const sequence = {
    format: 'framepick-sequence', schemaVersion: 1,
    canvas: { width: 1, height: 1 }, sourceCanvas: { width: 1, height: 1 }, contentBounds: { x: 0, y: 0, width: 1, height: 1 },
    fps: 12, loop: true, frameCount: 2,
    frames: [
      { index: 0, file: 'transformed/frame_0001.png', files: { original: 'original/frame_0001.png', ai: null, transformed: 'transformed/frame_0001.png' }, delayMs: 83, name: 'idle-1' },
      { index: 1, file: 'transformed/frame_0002.png', files: { original: 'original/frame_0002.png', ai: null, transformed: 'transformed/frame_0002.png' }, delayMs: 125, name: 'idle-2' }
    ],
    sequenceAnimation: {
      enabled: true,
      keyframes: [
        { id: 'start', timeMs: 0, x: 0, y: 0, scale: 100, rotate: 0, curve: 'custom', bezier: [0.1, 0.2, 0.7, 0.9] },
        { id: 'end', timeMs: 83, x: 2, y: -1, scale: 103, rotate: 1, curve: 'linear', bezier: [0, 0, 1, 1] }
      ]
    }
  };
  const assetRoot = path.join(temporaryProject, 'assets');
  fs.mkdirSync(assetRoot, { recursive: true });
  writeGodotExport({
    directoryPath: assetRoot,
    name: 'Hero',
    manifest: JSON.stringify(sequence),
    files: {
      'original/frame_0001.png': png,
      'transformed/frame_0001.png': png,
      'original/frame_0002.png': png,
      'transformed/frame_0002.png': png
    }
  });

  const editor = spawnSync(godotExecutable, ['--headless', '--editor', '--quit', '--path', temporaryProject], { encoding: 'utf8' });
  process.stdout.write(editor.stdout || '');
  process.stderr.write(editor.stderr || '');
  if ((editor.status ?? 1) !== 0) {
    process.exitCode = editor.status ?? 1;
  } else {
    const runtime = spawnSync(godotExecutable, ['--headless', '--path', temporaryProject, '--script', 'res://verify_import.gd'], { encoding: 'utf8' });
    process.stdout.write(runtime.stdout || '');
    process.stderr.write(runtime.stderr || '');
    process.exitCode = runtime.status ?? 1;
  }
} finally {
  fs.rmSync(temporaryProject, { recursive: true, force: true });
}
