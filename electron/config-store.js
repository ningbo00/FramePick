const fs = require('fs');
const path = require('path');

const DEFAULT_CONFIG = Object.freeze({
  api_key: '',
  prompt: 'Remove the background cleanly. Preserve the exact subject, pose, colors, proportions, edges, and transparent details. Output only the subject on a transparent background. Do not add or alter anything.',
  model: 'gpt-image-2',
  api_url: 'https://api.openai.com/v1/images/edits',
  engine: 'comfyui',
  python_path: '',
  ffmpeg_path: '',
  birefnet_model_path: ''
});

function ensureParent(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function readConfig(filePath) {
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return { ...DEFAULT_CONFIG, ...parsed };
  } catch (error) {
    if (error.code !== 'ENOENT' && error.name !== 'SyntaxError') throw error;
    return { ...DEFAULT_CONFIG };
  }
}

function writeConfig(filePath, payload = {}) {
  const config = { ...readConfig(filePath), ...payload };
  ensureParent(filePath);
  fs.writeFileSync(filePath, `${JSON.stringify(config, null, 2)}\n`, 'utf8');
  return config;
}

module.exports = { DEFAULT_CONFIG, readConfig, writeConfig };
