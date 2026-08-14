const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

function isExecutable(filePath) {
  return Boolean(filePath && fs.existsSync(filePath) && fs.statSync(filePath).isFile());
}

function pathCandidates(name) {
  const entries = String(process.env.PATH || '').split(path.delimiter).filter(Boolean);
  return entries.map((entry) => path.join(entry, name));
}

function findOnPath(names) {
  for (const name of names) {
    for (const candidate of pathCandidates(name)) {
      if (isExecutable(candidate)) return candidate;
    }
  }
  return '';
}

function chooseConfigured(configuredPath, candidates) {
  if (isExecutable(configuredPath)) return configuredPath;
  return candidates.find(isExecutable) || '';
}

function findPython(paths, configuredPath = '') {
  const names = process.platform === 'win32' ? ['python.exe', 'python3.exe'] : ['python3', 'python'];
  if (isExecutable(configuredPath)) return configuredPath;
  const candidates = [...new Set([
    path.join(paths.bundledRuntimeDir, 'python.exe'),
    path.join(paths.runtimeDir, 'python', 'python.exe'),
    ...names.flatMap((name) => pathCandidates(name))
  ])].filter(isExecutable);
  return candidates.find(checkPythonModules) || candidates[0] || '';
}

function findFfmpeg(paths, configuredPath = '') {
  const names = process.platform === 'win32' ? ['ffmpeg.exe'] : ['ffmpeg'];
  return chooseConfigured(configuredPath, [
    path.join(paths.bundledRuntimeDir, 'ffmpeg.exe'),
    path.join(paths.runtimeDir, 'ffmpeg.exe'),
    ...names.flatMap((name) => pathCandidates(name))
  ]);
}

function findBirefnetModel(paths, configuredPath = '') {
  return chooseConfigured(configuredPath, [
    path.join(paths.modelsDir, 'background_removal', 'birefnet-general.onnx'),
    path.join(paths.runtimeDir, 'models', 'background_removal', 'birefnet-general.onnx')
  ]);
}

function checkPythonModules(pythonPath) {
  if (!pythonPath) return false;
  try {
    const result = spawnSync(pythonPath, ['-c', 'import PIL, rembg, onnxruntime'], { windowsHide: true, timeout: 8000, stdio: 'ignore' });
    return result.status === 0;
  } catch {
    return false;
  }
}

function diagnose(paths, config = {}) {
  const python = findPython(paths, config.python_path);
  const ffmpeg = findFfmpeg(paths, config.ffmpeg_path);
  const model = findBirefnetModel(paths, config.birefnet_model_path);
  const pythonBirefnetReady = checkPythonModules(python);
  return {
    python: { path: python, available: Boolean(python), birefnetReady: pythonBirefnetReady },
    ffmpeg: { path: ffmpeg, available: Boolean(ffmpeg) },
    birefnet: { modelPath: model, available: Boolean(model) },
    ready: Boolean(python && ffmpeg && model && pythonBirefnetReady)
  };
}

module.exports = { findPython, findFfmpeg, findBirefnetModel, diagnose };
