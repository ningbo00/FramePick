const fs = require('fs');
const path = require('path');

const ADDON_RELATIVE_PATH = path.join('plugins', 'godot4', 'framepick_importer');

function copyDirectory(source, target) {
  fs.mkdirSync(target, { recursive: true });
  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    const sourcePath = path.join(source, entry.name);
    const targetPath = path.join(target, entry.name);
    if (entry.isDirectory()) copyDirectory(sourcePath, targetPath);
    else if (entry.isFile()) fs.copyFileSync(sourcePath, targetPath);
  }
}

function installGodotPlugin({ appRoot, projectDirectory }) {
  const projectRoot = path.resolve(String(projectDirectory || ''));
  if (!projectDirectory || !fs.existsSync(path.join(projectRoot, 'project.godot'))) throw new Error('所选目录不是 Godot 项目根目录（缺少 project.godot）');
  const source = path.join(path.resolve(appRoot), ADDON_RELATIVE_PATH);
  if (!fs.existsSync(path.join(source, 'plugin.cfg'))) throw new Error('FramePick 安装包缺少 Godot 插件文件');
  const target = path.join(projectRoot, 'addons', 'framepick_importer');
  copyDirectory(source, target);
  return { ok: true, projectRoot, pluginDirectory: target };
}

module.exports = { ADDON_RELATIVE_PATH, copyDirectory, installGodotPlugin };
