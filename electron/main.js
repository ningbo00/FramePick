const { app, BrowserWindow, dialog, ipcMain, shell } = require('electron');
const { spawn } = require('child_process');
const fs = require('fs');
const http = require('http');
const https = require('https');
const path = require('path');
const crypto = require('crypto');
const { getPaths } = require('./paths');
const { readConfig, writeConfig } = require('./config-store');
const { diagnose, findFfmpeg, findPython, findBirefnetModel } = require('./runtime-manager');
const { writeSequenceExport } = require('./sequence-export');
const { writeProjectPayload } = require('./project-writer');
const { createPluginManager } = require('./plugin-manager');

app.setName('FramePick');

let mainWindow = null;
const panelWindows = new Map();
let latestPanelState = null;
let paths = null;
let worker = null;
let workerBuffer = '';
let workerJobs = new Map();
let workerCounter = 0;
let logPath = null;
let logDirectory = null;
let pluginManager = null;

function formatLogValue(value) {
  if (value instanceof Error) return value.stack || value.message;
  if (typeof value === 'string') return value;
  try { return JSON.stringify(value); } catch { return String(value); }
}

function log(level, ...values) {
  const line = `${new Date().toISOString()} [${level}] ${values.map(formatLogValue).join(' ')}\n`;
  try { if (logPath) fs.appendFileSync(logPath, line, 'utf8'); } catch { /* Logging must never crash the app. */ }
  if (level === 'ERROR') console.error(line.trim());
  else console.log(line.trim());
}

function initializeLogging() {
  logDirectory = paths.logsDir;
  logPath = paths.logPath;
  fs.mkdirSync(logDirectory, { recursive: true });
  try {
    if (fs.existsSync(logPath) && fs.statSync(logPath).size > 5 * 1024 * 1024) {
      if (fs.existsSync(paths.previousLogPath)) fs.unlinkSync(paths.previousLogPath);
      fs.renameSync(logPath, paths.previousLogPath);
    }
  } catch { /* Start a fresh session even when rotation fails. */ }
  log('INFO', '===== FramePick session started =====');
  log('INFO', `version=${app.getVersion()} electron=${process.versions.electron} platform=${process.platform}`);
}

function parseDataUrl(dataUrl) {
  const match = String(dataUrl || '').match(/^data:([^;,]+)(?:;[^,]*)?;base64,(.+)$/s);
  if (!match) throw new Error('图片数据格式无效');
  return { mime: match[1], bytes: Buffer.from(match[2], 'base64') };
}

function dataUrlFromBuffer(buffer, mime = 'image/png') {
  return `data:${mime};base64,${buffer.toString('base64')}`;
}

function requestBuffer(urlString, options = {}, body = null) {
  return new Promise((resolve, reject) => {
    let parsed;
    try { parsed = new URL(urlString); } catch { reject(new Error('请求地址无效')); return; }
    if (!['http:', 'https:'].includes(parsed.protocol)) { reject(new Error('请求地址必须是 http 或 https')); return; }
    const transport = parsed.protocol === 'https:' ? https : http;
    const request = transport.request(parsed, { method: options.method || 'GET', headers: options.headers || {}, timeout: options.timeout || 180000 }, (response) => {
      const chunks = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () => {
        const result = Buffer.concat(chunks);
        if (response.statusCode >= 400) {
          const error = new Error(result.toString('utf8').slice(0, 1000) || `HTTP ${response.statusCode}`);
          error.statusCode = response.statusCode;
          reject(error);
          return;
        }
        resolve({ status: response.statusCode, headers: response.headers, body: result });
      });
    });
    request.on('timeout', () => request.destroy(new Error('请求超时')));
    request.on('error', reject);
    if (body) request.write(body);
    request.end();
  });
}

function normalizeImagesEndpoint(apiUrl) {
  const endpoint = String(apiUrl || '').replace(/\/+$/, '');
  return endpoint.endsWith('/images/edits') ? endpoint : `${endpoint}/images/edits`;
}

function buildMultipart(payload) {
  const boundary = `----framepick${crypto.randomUUID().replace(/-/g, '')}`;
  const parts = [];
  const field = (name, value) => parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`));
  field('model', payload.model || 'gpt-image-2');
  field('prompt', payload.prompt || 'Remove the background cleanly.');
  field('background', 'transparent');
  field('output_format', 'png');
  const image = parseDataUrl(payload.image);
  const extension = image.mime.includes('jpeg') ? '.jpg' : '.png';
  parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="image"; filename="frame${extension}"\r\nContent-Type: ${image.mime}\r\n\r\n`));
  parts.push(image.bytes);
  parts.push(Buffer.from(`\r\n--${boundary}--\r\n`));
  return { body: Buffer.concat(parts), boundary };
}

async function removeBackgroundRemote(payload) {
  const endpoint = normalizeImagesEndpoint(payload.api_url);
  const { body, boundary } = buildMultipart(payload);
  const response = await requestBuffer(endpoint, {
    method: 'POST',
    timeout: 180000,
    headers: {
      Authorization: `Bearer ${String(payload.api_key || '')}`,
      'Content-Type': `multipart/form-data; boundary=${boundary}`,
      'Content-Length': body.length
    }
  }, body);
  const result = JSON.parse(response.body.toString('utf8'));
  const item = result?.data?.[0] || result;
  if (item?.b64_json) return { data: `data:image/png;base64,${item.b64_json}`, engine: 'openai' };
  if (item?.url) {
    const image = await requestBuffer(item.url, { timeout: 180000 });
    return { data: dataUrlFromBuffer(image.body, image.headers['content-type'] || 'image/png'), engine: 'openai' };
  }
  throw new Error('AI 服务未返回图片');
}

function rejectWorkerJobs(error) {
  for (const job of workerJobs.values()) {
    clearTimeout(job.timer);
    job.reject(error);
  }
  workerJobs = new Map();
}

function stopWorker() {
  if (!worker) return;
  const child = worker;
  worker = null;
  workerBuffer = '';
  rejectWorkerJobs(new Error('BiRefNet worker 已停止'));
  if (!child.killed) child.kill();
}

function attachWorker(child) {
  worker = child;
  child.stdout.setEncoding('utf8');
  child.stdout.on('data', (chunk) => {
    workerBuffer += chunk;
    let newline;
    while ((newline = workerBuffer.indexOf('\n')) >= 0) {
      const line = workerBuffer.slice(0, newline).trim();
      workerBuffer = workerBuffer.slice(newline + 1);
      if (!line) continue;
      let response;
      try { response = JSON.parse(line); } catch (error) { log('ERROR', 'BiRefNet worker 输出无效', error, line); continue; }
      const job = workerJobs.get(response.id);
      if (!job) continue;
      workerJobs.delete(response.id);
      clearTimeout(job.timer);
      if (response.ok) job.resolve(response);
      else job.reject(new Error(response.error || 'BiRefNet 处理失败'));
    }
  });
  child.stderr.setEncoding('utf8');
  child.stderr.on('data', (chunk) => log('WORKER-ERROR', chunk.trim()));
  child.once('error', (error) => { log('ERROR', 'BiRefNet worker 启动失败', error); if (worker === child) { worker = null; rejectWorkerJobs(error); } });
  child.once('exit', (code, signal) => { log('INFO', `BiRefNet worker exited code=${code} signal=${signal}`); if (worker === child) { worker = null; rejectWorkerJobs(new Error(`BiRefNet worker 已退出 (${code ?? signal})`)); } });
}

function ensureWorker(config) {
  if (worker && !worker.killed) return worker;
  const runtime = diagnose(paths, config);
  if (!runtime.python.available || !runtime.python.birefnetReady) throw new Error('Python runtime 缺少 BiRefNet 依赖，请选择已安装 rembg、Pillow 和 onnxruntime 的 Python');
  if (!runtime.birefnet.available) throw new Error('未找到 BiRefNet 模型，请在设置中选择模型文件');
  const workerPath = path.join(paths.appRoot, 'workers', 'birefnet_worker.py');
  if (!fs.existsSync(workerPath)) throw new Error(`找不到 BiRefNet worker：${workerPath}`);
  const child = spawn(runtime.python.path, [workerPath, '--model', runtime.birefnet.modelPath], {
    cwd: paths.appRoot,
    env: { ...process.env, PYTHONUNBUFFERED: '1' },
    windowsHide: true,
    stdio: ['pipe', 'pipe', 'pipe']
  });
  attachWorker(child);
  return child;
}

async function removeBackgroundLocal(payload) {
  const config = readConfig(paths.configPath);
  ensureWorker(config);
  fs.mkdirSync(paths.tempDir, { recursive: true });
  const tempDir = fs.mkdtempSync(path.join(paths.tempDir, 'birefnet-'));
  const inputPath = path.join(tempDir, 'input.png');
  const outputPath = path.join(tempDir, 'output.png');
  try {
    fs.writeFileSync(inputPath, parseDataUrl(payload.image).bytes);
    const id = `job-${++workerCounter}`;
    const response = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => { workerJobs.delete(id); reject(new Error('BiRefNet 处理超时')); }, 180000);
      workerJobs.set(id, { resolve, reject, timer });
      worker.stdin.write(`${JSON.stringify({ id, command: 'remove-background', imagePath: inputPath, outputPath })}\n`);
    });
    const data = fs.readFileSync(response.outputPath);
    return { data: dataUrlFromBuffer(data), engine: 'birefnet' };
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

async function testConnection(payload) {
  if ((payload.engine || 'openai') === 'comfyui') {
    const config = readConfig(paths.configPath);
    const runtime = diagnose(paths, config);
    return { ok: runtime.ready, runtime };
  }
  const endpoint = normalizeImagesEndpoint(payload.api_url);
  const parsed = new URL(endpoint);
  const basePath = parsed.pathname.replace(/\/images\/edits\/?$/, '');
  const modelsUrl = `${parsed.protocol}//${parsed.host}${basePath}/models`;
  try {
    const response = await requestBuffer(modelsUrl, { headers: { Authorization: `Bearer ${payload.api_key || ''}` }, timeout: 20000 });
    return { ok: true, status: response.status, message: 'API Key 和请求地址连接正常' };
  } catch (error) {
    if ([404, 405].includes(error.statusCode)) return { ok: true, status: error.statusCode, message: '请求地址可达；该兼容服务未提供 models 接口' };
    throw error;
  }
}

function shellOpenLocation(filePath) {
  if (!filePath || typeof filePath !== 'string' || !fs.existsSync(filePath)) throw new Error('项目或素材路径不存在');
  shell.showItemInFolder(filePath);
  return { ok: true };
}

function assertProjectAssetPath(projectPath, assetPath) {
  const projectRoot = path.dirname(path.resolve(projectPath));
  const resolved = path.resolve(projectRoot, String(assetPath || ''));
  if (!resolved.startsWith(`${projectRoot}${path.sep}`)) throw new Error('项目资产路径无效');
  return resolved;
}

function mimeForPath(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : ext === '.webp' ? 'image/webp' : 'image/png';
}

function escapeConcatPath(filePath) {
  return filePath.replace(/'/g, "'\\''").replace(/\\/g, '/');
}

async function runProcess(executable, args, timeoutMs = 180000) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    const stderr = [];
    const timer = setTimeout(() => { child.kill(); reject(new Error('FFmpeg 处理超时')); }, timeoutMs);
    child.stderr.on('data', (chunk) => stderr.push(chunk));
    child.once('error', (error) => { clearTimeout(timer); reject(error); });
    child.once('close', (code) => { clearTimeout(timer); if (code === 0) resolve(); else reject(new Error(Buffer.concat(stderr).toString('utf8').slice(-1000) || `FFmpeg exited ${code}`)); });
  });
}

async function exportAnimation(payload) {
  const config = readConfig(paths.configPath);
  const ffmpeg = findFfmpeg(paths, config.ffmpeg_path);
  if (!ffmpeg) throw new Error('未找到 FFmpeg，请在设置中选择 ffmpeg 可执行文件');
  if (!Array.isArray(payload.frames) || !payload.frames.length) throw new Error('没有可导出的帧');
  const format = payload.format === 'mp4' ? 'mp4' : 'gif';
  fs.mkdirSync(paths.tempDir, { recursive: true });
  const tempDir = fs.mkdtempSync(path.join(paths.tempDir, 'animation-'));
  try {
    const lines = [];
    for (let index = 0; index < payload.frames.length; index += 1) {
      const imagePath = path.join(tempDir, `frame_${String(index).padStart(5, '0')}.png`);
      fs.writeFileSync(imagePath, parseDataUrl(payload.frames[index].image).bytes);
      lines.push(`file '${escapeConcatPath(imagePath)}'`);
      lines.push(`duration ${Math.max(0.02, Number(payload.frames[index].delayMs || payload.frames[index].delay || 83) / 1000).toFixed(4)}`);
    }
    const lastPath = path.join(tempDir, `frame_${String(payload.frames.length - 1).padStart(5, '0')}.png`);
    lines.push(`file '${escapeConcatPath(lastPath)}'`);
    const concatPath = path.join(tempDir, 'concat.txt');
    const outputPath = path.join(tempDir, `sequence.${format}`);
    fs.writeFileSync(concatPath, `${lines.join('\n')}\n`, 'utf8');
    const args = format === 'mp4'
      ? ['-y', '-f', 'concat', '-safe', '0', '-i', concatPath, '-vf', 'fps=60,pad=ceil(iw/2)*2:ceil(ih/2)*2,format=yuv420p', '-movflags', '+faststart', outputPath]
      : ['-y', '-f', 'concat', '-safe', '0', '-i', concatPath, '-vf', 'fps=30,split[s0][s1];[s0]palettegen=max_colors=256[p];[s1][p]paletteuse', outputPath];
    await runProcess(ffmpeg, args);
    const output = fs.readFileSync(outputPath);
    return { data: output.toString('base64'), mime: format === 'mp4' ? 'video/mp4' : 'image/gif', extension: format };
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

async function saveSpritesheet(payload) {
  const result = await dialog.showSaveDialog(mainWindow, { title: '导出 Sprite Sheet', defaultPath: payload.fileName || 'sequence-spritesheet.png', filters: [{ name: 'PNG 图片', extensions: ['png'] }] });
  if (result.canceled || !result.filePath) return { canceled: true };
  fs.writeFileSync(result.filePath, parseDataUrl(payload.data).bytes);
  return { ok: true, filePath: result.filePath };
}

function registerIpc() {
  ipcMain.handle('panels:open', async (_event, panel) => {
    const result = await openPanelWindow(panel);
    if (result?.ok && mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('panels:visibility', { panel, open: true });
    }
    return result;
  });
  ipcMain.on('panels:request-state', (event) => {
    if (latestPanelState) {
      event.sender.send('panels:state', latestPanelState);
      return;
    }
    if (mainWindow && !mainWindow.isDestroyed() && event.sender !== mainWindow.webContents) {
      mainWindow.webContents.send('panels:request-state');
    }
  });
  ipcMain.on('panels:state', (event, state) => {
    latestPanelState = state;
    const targets = [mainWindow, ...panelWindows.values()];
    targets.forEach((window) => {
      if (!window || window.isDestroyed() || window.webContents === event.sender) return;
      window.webContents.send('panels:state', state);
    });
  });
  ipcMain.handle('project:open', async () => {
    const result = await dialog.showOpenDialog(mainWindow, { title: '打开 FramePick 项目', properties: ['openFile'], filters: [{ name: 'FramePick 项目', extensions: ['fpproj'] }] });
    if (result.canceled || !result.filePaths[0]) return { canceled: true };
    const filePath = result.filePaths[0];
    if (!filePath.toLowerCase().endsWith('.fpproj')) return { canceled: false, error: '项目格式不受支持' };
    try { return { canceled: false, filePath, data: fs.readFileSync(filePath, 'utf8') }; }
    catch (error) { return { canceled: false, error: error.message }; }
  });
  ipcMain.handle('project:save-as', async (_event, payload = {}) => {
    const result = await dialog.showSaveDialog(mainWindow, { title: '保存 FramePick 项目', defaultPath: payload.fileName || '未命名项目.fpproj', filters: [{ name: 'FramePick 项目', extensions: ['fpproj'] }] });
    if (result.canceled || !result.filePath) return { canceled: true };
    if (!result.filePath.toLowerCase().endsWith('.fpproj')) return { canceled: false, error: '项目文件必须使用 .fpproj 扩展名' };
    try { writeProjectPayload(result.filePath, payload); return { canceled: false, filePath: result.filePath }; }
    catch (error) { return { canceled: false, error: error.message }; }
  });
  ipcMain.handle('project:write', async (_event, payload = {}) => {
    if (!payload.filePath?.toLowerCase().endsWith('.fpproj')) return { ok: false, error: '项目格式不受支持' };
    try { writeProjectPayload(payload.filePath, payload); return { ok: true }; }
    catch (error) { return { ok: false, error: error.message }; }
  });
  ipcMain.handle('project:read-asset', async (_event, payload = {}) => {
    try {
      const assetPath = assertProjectAssetPath(payload.projectPath, payload.assetPath);
      return { ok: true, data: dataUrlFromBuffer(fs.readFileSync(assetPath), mimeForPath(assetPath)) };
    } catch (error) { return { ok: false, error: error.message }; }
  });
  ipcMain.handle('system:open-location', async (_event, filePath) => { try { return shellOpenLocation(filePath); } catch (error) { log('ERROR', '打开位置失败', error); return { ok: false, error: error.message }; } });
  ipcMain.handle('system:select-directory', async () => {
    const result = await dialog.showOpenDialog(mainWindow, { properties: ['openDirectory', 'createDirectory'] });
    return result.canceled || !result.filePaths[0] ? { canceled: true } : { canceled: false, filePath: result.filePaths[0] };
  });
  ipcMain.handle('system:select-file', async (_event, options = {}) => {
    const result = await dialog.showOpenDialog(mainWindow, { properties: ['openFile'], filters: options.filters || [] });
    return result.canceled || !result.filePaths[0] ? { canceled: true } : { canceled: false, filePath: result.filePaths[0] };
  });
  ipcMain.handle('config:read', () => readConfig(paths.configPath));
  ipcMain.handle('config:write', (_event, payload) => writeConfig(paths.configPath, payload));
  ipcMain.handle('runtime:diagnose', () => diagnose(paths, readConfig(paths.configPath)));
  ipcMain.handle('ai:test-connection', async (_event, payload = {}) => testConnection(payload));
  ipcMain.handle('ai:remove-background', async (_event, payload = {}) => {
    const config = readConfig(paths.configPath);
    return payload.engine === 'comfyui' ? removeBackgroundLocal({ ...config, ...payload }) : removeBackgroundRemote({ ...config, ...payload });
  });
  ipcMain.handle('export:animation', (_event, payload) => exportAnimation(payload));
  ipcMain.handle('export:sequence', (_event, payload) => {
    try { return writeSequenceExport(payload); } catch (error) { log('ERROR', '序列导出失败', error); return { ok: false, error: error.message }; }
  });
  ipcMain.handle('plugins:list', () => pluginManager.list());
  ipcMain.handle('plugins:export', (_event, request = {}) => {
    try { return pluginManager.export(request.pluginId, request.formatId, request.payload); }
    catch (error) { log('ERROR', '插件导出失败', request.pluginId, error); return { ok: false, error: error.message }; }
  });
  ipcMain.handle('plugins:action', (_event, request = {}) => {
    try { return pluginManager.action(request.pluginId, request.actionId, request.payload); }
    catch (error) { log('ERROR', '插件动作失败', request.pluginId, request.actionId, error); return { ok: false, error: error.message }; }
  });
  ipcMain.handle('export:spritesheet', async (_event, payload) => {
    try { return await saveSpritesheet(payload); } catch (error) { log('ERROR', 'Sprite Sheet 导出失败', error); return { ok: false, error: error.message }; }
  });
  ipcMain.handle('logs:get-info', () => ({ directory: logDirectory, path: logPath }));
  ipcMain.handle('logs:open-folder', async () => shell.openPath(logDirectory));
  ipcMain.handle('logs:clear', () => { fs.writeFileSync(logPath, `${new Date().toISOString()} [INFO] log cleared\n`, 'utf8'); return true; });
}

const panelSpecs = {
  assets: { title: 'FramePick · 素材库', width: 380, height: 760, minWidth: 280, minHeight: 420 },
  workspace: { title: 'FramePick · 取帧工作区', width: 980, height: 820, minWidth: 760, minHeight: 560 },
  sequence: { title: 'FramePick · 序列帧', width: 1080, height: 430, minWidth: 620, minHeight: 300 },
  inspector: { title: 'FramePick · 属性', width: 390, height: 820, minWidth: 300, minHeight: 520 }
};

async function openPanelWindow(panel) {
  const spec = panelSpecs[panel];
  if (!spec) return { ok: false, error: '未知面板' };
  const existing = panelWindows.get(panel);
  if (existing && !existing.isDestroyed()) {
    if (existing.isMinimized()) existing.restore();
    existing.focus();
    return { ok: true, existing: true };
  }
  const panelWindow = new BrowserWindow({
    title: spec.title,
    width: spec.width,
    height: spec.height,
    minWidth: spec.minWidth,
    minHeight: spec.minHeight,
    resizable: true,
    backgroundColor: '#151b18',
    show: false,
    webPreferences: { contextIsolation: true, sandbox: true, preload: path.join(__dirname, 'preload.js') }
  });
  panelWindows.set(panel, panelWindow);
  panelWindow.once('ready-to-show', () => panelWindow.show());
  panelWindow.webContents.on('console-message', (_event, level, message, line, sourceId) => log(level >= 3 ? 'RENDERER-ERROR' : 'PANEL-RENDERER', `${panel}:${sourceId || 'page'}:${line || 0}`, message));
  panelWindow.webContents.on('render-process-gone', (_event, details) => log('ERROR', `panel renderer gone ${panel}`, details));
  panelWindow.on('closed', () => {
    if (panelWindows.get(panel) === panelWindow) panelWindows.delete(panel);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('panels:visibility', { panel, open: false });
    }
    log('INFO', `panel closed ${panel}`);
  });
  try {
    await panelWindow.loadFile(path.join(paths.appRoot, 'index.html'), { query: { panel } });
    return { ok: true };
  } catch (error) {
    panelWindows.delete(panel);
    if (!panelWindow.isDestroyed()) panelWindow.close();
    return { ok: false, error: error.message };
  }
}

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 980,
    minHeight: 680,
    backgroundColor: '#151b18',
    show: false,
    webPreferences: { contextIsolation: true, sandbox: true, preload: path.join(__dirname, 'preload.js') }
  });
  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.webContents.on('console-message', (_event, level, message, line, sourceId) => log(level >= 3 ? 'RENDERER-ERROR' : 'RENDERER', `${sourceId || 'page'}:${line || 0}`, message));
  mainWindow.webContents.on('render-process-gone', (_event, details) => log('ERROR', 'renderer process gone', details));
  mainWindow.webContents.on('did-fail-load', (_event, code, description, url) => log('ERROR', `page load failed code=${code} url=${url}`, description));
  mainWindow.webContents.on('did-finish-load', () => log('INFO', 'page loaded'));
  mainWindow.on('unresponsive', () => log('ERROR', 'window became unresponsive'));
  mainWindow.on('closed', () => {
    log('INFO', 'window closed');
    mainWindow = null;
    for (const panelWindow of panelWindows.values()) {
      if (!panelWindow.isDestroyed()) panelWindow.close();
    }
    panelWindows.clear();
  });
  await mainWindow.loadFile(path.join(paths.appRoot, 'index.html'));
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.whenReady().then(() => {
    paths = getPaths(app);
    initializeLogging();
    pluginManager = createPluginManager(paths.appRoot, { paths, log });
    registerIpc();
    return createWindow();
  }).catch((error) => {
    log('ERROR', 'FramePick 启动失败', error);
    dialog.showErrorBox('FramePick 启动失败', error.message);
    app.quit();
  });
  app.on('second-instance', () => { if (mainWindow) { if (mainWindow.isMinimized()) mainWindow.restore(); mainWindow.focus(); } });
  app.on('before-quit', stopWorker);
  app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
}

process.on('uncaughtException', (error) => log('ERROR', 'uncaughtException', error));
process.on('unhandledRejection', (reason) => log('ERROR', 'unhandledRejection', reason));
