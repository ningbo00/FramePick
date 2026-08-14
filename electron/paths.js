const path = require('path');

const appRoot = path.resolve(__dirname, '..');

function getPaths(app) {
  const userDataRoot = app.getPath('userData');
  const logsDir = path.join(userDataRoot, 'logs');
  const tempDir = path.join(userDataRoot, 'temp');
  return {
    appRoot,
    userDataRoot,
    configPath: path.join(userDataRoot, 'framepick-config.json'),
    logsDir,
    logPath: path.join(logsDir, 'framepick.log'),
    previousLogPath: path.join(logsDir, 'framepick.previous.log'),
    tempDir,
    runtimeDir: path.join(appRoot, 'runtime'),
    bundledRuntimeDir: path.join(appRoot, 'runtime', process.platform, process.arch),
    modelsDir: path.join(appRoot, 'models')
  };
}

module.exports = { appRoot, getPaths };
