const fs = require('fs');
const path = require('path');

const MANIFEST_FILE = 'framepick.plugin.json';

function readManifest(pluginDirectory) {
  const manifestPath = path.join(pluginDirectory, MANIFEST_FILE);
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  if (!manifest.id || !manifest.name || !manifest.entry) throw new Error(`插件清单无效: ${manifestPath}`);
  return manifest;
}

function createPluginManager(appRoot, context = {}) {
  const root = path.join(path.resolve(appRoot), 'plugins');
  const plugins = new Map();
  if (fs.existsSync(root)) {
    for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const directory = path.join(root, entry.name);
      const manifestPath = path.join(directory, MANIFEST_FILE);
      if (!fs.existsSync(manifestPath)) continue;
      try {
        const manifest = readManifest(directory);
        const modulePath = path.join(directory, manifest.entry);
        const implementation = require(modulePath);
        const needsExport = Array.isArray(manifest.exportFormats) && manifest.exportFormats.length > 0;
        const needsActions = Array.isArray(manifest.actions) && manifest.actions.length > 0;
        if ((needsExport && typeof implementation.exportPackage !== 'function') || (needsActions && typeof implementation.runAction !== 'function')) {
          throw new Error(`插件实现不完整: ${manifest.id}`);
        }
        plugins.set(manifest.id, { directory, manifest, implementation });
      } catch (error) {
        context.log?.('ERROR', '加载插件失败', entry.name, error);
      }
    }
  }

  function descriptor(plugin) {
    return {
      id: plugin.manifest.id,
      name: plugin.manifest.name,
      version: plugin.manifest.version || '',
      exportFormats: Array.isArray(plugin.manifest.exportFormats) ? plugin.manifest.exportFormats : [],
      actions: Array.isArray(plugin.manifest.actions) ? plugin.manifest.actions : []
    };
  }

  return {
    list() { return Array.from(plugins.values()).map(descriptor); },
    export(pluginId, formatId, payload) {
      const plugin = plugins.get(String(pluginId));
      if (!plugin) throw new Error(`插件不存在: ${pluginId}`);
      if (typeof plugin.implementation.exportPackage !== 'function') throw new Error(`插件不支持导出: ${pluginId}`);
      return plugin.implementation.exportPackage({ appRoot: path.resolve(appRoot), paths: context.paths, formatId, payload });
    },
    action(pluginId, actionId, payload) {
      const plugin = plugins.get(String(pluginId));
      if (!plugin) throw new Error(`插件不存在: ${pluginId}`);
      if (typeof plugin.implementation.runAction !== 'function') throw new Error(`插件不支持动作: ${pluginId}`);
      return plugin.implementation.runAction({ appRoot: path.resolve(appRoot), paths: context.paths, actionId, payload });
    }
  };
}

module.exports = { MANIFEST_FILE, createPluginManager, readManifest };
