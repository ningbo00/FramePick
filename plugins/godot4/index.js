const fs = require('fs');
const path = require('path');
const { writeGodotExport } = require('./export');
const { installGodotPlugin } = require('./install');

const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, 'framepick.plugin.json'), 'utf8'));

function exportPackage({ formatId, payload }) {
  if (formatId !== 'godot') throw new Error(`Godot 导出格式不受支持: ${formatId}`);
  const result = writeGodotExport(payload);
  return { ...result, message: `Godot 动画包已导出：${result.frameCount} 帧、逐帧延迟和整图曲线` };
}

function runAction({ actionId, payload, appRoot }) {
  if (actionId !== 'install') throw new Error(`Godot 插件动作不受支持: ${actionId}`);
  const result = installGodotPlugin({ appRoot, projectDirectory: payload?.directoryPath || payload?.projectDirectory });
  return { ...result, message: 'Godot 插件已安装；请在项目设置 → 插件中启用 FramePick Importer' };
}

module.exports = { manifest, exportPackage, runAction };
