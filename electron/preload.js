const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('framepickDesktop', {
  window: {
    openProject: () => ipcRenderer.invoke('window:open-project'),
    setTitle: (title) => ipcRenderer.invoke('window:set-title', title),
    setTitleBarTheme: (theme) => ipcRenderer.invoke('window:set-titlebar-theme', theme),
    minimize: () => ipcRenderer.invoke('window:minimize'),
    toggleMaximize: () => ipcRenderer.invoke('window:toggle-maximize'),
    close: () => ipcRenderer.invoke('window:close'),
    confirmClose: () => ipcRenderer.invoke('window:confirm-close'),
    respondClose: (payload) => ipcRenderer.invoke('window:close-response', payload),
    onCloseRequest: (callback) => {
      const handler = (_event, payload) => callback(payload);
      ipcRenderer.on('window:close-request', handler);
      return () => ipcRenderer.removeListener('window:close-request', handler);
    }
  },
  menu: {
    onCommand: (callback) => {
      const handler = (_event, command) => callback(command);
      ipcRenderer.on('menu:command', handler);
      return () => ipcRenderer.removeListener('menu:command', handler);
    }
  },
  project: {
    open: () => ipcRenderer.invoke('project:open'),
    save: (payload) => ipcRenderer.invoke('project:write', payload),
    saveAs: (payload) => ipcRenderer.invoke('project:save-as', payload),
    write: (payload) => ipcRenderer.invoke('project:write', payload),
    readAsset: (payload) => ipcRenderer.invoke('project:read-asset', payload)
  },
  system: {
    openLocation: (filePath) => ipcRenderer.invoke('system:open-location', filePath),
    selectDirectory: () => ipcRenderer.invoke('system:select-directory'),
    selectFile: (options) => ipcRenderer.invoke('system:select-file', options),
    getPathForFile: (file) => { try { return webUtils.getPathForFile(file); } catch { return ''; } }
  },
  config: {
    read: () => ipcRenderer.invoke('config:read'),
    write: (payload) => ipcRenderer.invoke('config:write', payload)
  },
  runtime: {
    diagnose: () => ipcRenderer.invoke('runtime:diagnose')
  },
  ai: {
    testConnection: (payload) => ipcRenderer.invoke('ai:test-connection', payload),
    removeBackground: (payload) => ipcRenderer.invoke('ai:remove-background', payload)
  },
  export: {
    sequence: (payload) => ipcRenderer.invoke('export:sequence', payload),
    animation: (payload) => ipcRenderer.invoke('export:animation', payload),
    spritesheet: (payload) => ipcRenderer.invoke('export:spritesheet', payload)
  },
  plugins: {
    list: () => ipcRenderer.invoke('plugins:list'),
    export: (payload) => ipcRenderer.invoke('plugins:export', payload),
    action: (payload) => ipcRenderer.invoke('plugins:action', payload)
  },
  logs: {
    getInfo: () => ipcRenderer.invoke('logs:get-info'),
    openFolder: () => ipcRenderer.invoke('logs:open-folder'),
    clear: () => ipcRenderer.invoke('logs:clear')
  },
  panels: {
    open: (panel) => ipcRenderer.invoke('panels:open', panel),
    requestState: () => ipcRenderer.send('panels:request-state'),
    sendState: (state) => ipcRenderer.send('panels:state', state),
    onRequestState: (callback) => {
      const handler = () => callback();
      ipcRenderer.on('panels:request-state', handler);
      return () => ipcRenderer.removeListener('panels:request-state', handler);
    },
    onState: (callback) => {
      const handler = (_event, state) => callback(state);
      ipcRenderer.on('panels:state', handler);
      return () => ipcRenderer.removeListener('panels:state', handler);
    },
    onVisibility: (callback) => {
      const handler = (_event, visibility) => callback(visibility);
      ipcRenderer.on('panels:visibility', handler);
      return () => ipcRenderer.removeListener('panels:visibility', handler);
    }
  }
});
