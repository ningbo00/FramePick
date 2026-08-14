const fs = require('fs');
const path = require('path');

const DIRECTORY_NAMES = Object.freeze(['original', 'ai', 'transformed']);
const FRAME_PATH_PATTERN = /^(original|ai|transformed)\/frame_([0-9]{4})\.png$/;

function dataUrlBytes(value) {
  const match = /^data:[^;,]+;base64,([A-Za-z0-9+/=\r\n]+)$/.exec(String(value || ''));
  if (!match) throw new Error('序列帧图片数据无效');
  return Buffer.from(match[1], 'base64');
}

function expectedSequencePaths(manifest) {
  if (manifest?.format !== 'framepick-sequence' || manifest?.schemaVersion !== 1 || !Array.isArray(manifest.frames) || manifest.frames.length !== manifest.frameCount) throw new Error('序列格式不受支持');
  const expected = new Set();
  manifest.frames.forEach((entry, index) => {
    const number = String(index + 1).padStart(4, '0');
    const original = `original/frame_${number}.png`;
    const transformed = `transformed/frame_${number}.png`;
    const ai = entry?.files?.ai;
    if (entry?.index !== index || entry?.file !== transformed || entry?.files?.original !== original || entry?.files?.transformed !== transformed || ai !== null && ai !== `ai/frame_${number}.png`) throw new Error(`第 ${index + 1} 帧导出路径无效`);
    expected.add(original);
    expected.add(transformed);
    if (ai) expected.add(ai);
  });
  return expected;
}

function writeSequenceExport(payload) {
  if (typeof payload?.directoryPath !== 'string' || !payload.directoryPath.trim()) throw new Error('导出目录不存在');
  const directoryPath = path.resolve(payload.directoryPath);
  if (!fs.existsSync(directoryPath) || !fs.statSync(directoryPath).isDirectory()) throw new Error('导出目录不存在');
  let manifest;
  try { manifest = JSON.parse(String(payload.manifest || '')); } catch { throw new Error('序列 JSON 无效'); }
  const expected = expectedSequencePaths(manifest);
  const files = payload.files && typeof payload.files === 'object' && !Array.isArray(payload.files) ? payload.files : null;
  if (!files || Object.keys(files).length !== expected.size || Object.keys(files).some((relativePath) => !expected.has(relativePath) || !FRAME_PATH_PATTERN.test(relativePath))) throw new Error('序列帧文件集合不完整');

  for (const directoryName of DIRECTORY_NAMES) {
    const targetDirectory = path.join(directoryPath, directoryName);
    fs.mkdirSync(targetDirectory, { recursive: true });
    for (const name of fs.readdirSync(targetDirectory)) if (/^frame_[0-9]{4}\.png$/i.test(name)) fs.unlinkSync(path.join(targetDirectory, name));
  }
  const legacyFramesDirectory = path.join(directoryPath, 'frames');
  if (fs.existsSync(legacyFramesDirectory) && fs.statSync(legacyFramesDirectory).isDirectory()) {
    for (const name of fs.readdirSync(legacyFramesDirectory)) if (/^frame_[0-9]{4}\.png$/i.test(name)) fs.unlinkSync(path.join(legacyFramesDirectory, name));
    if (!fs.readdirSync(legacyFramesDirectory).length) fs.rmdirSync(legacyFramesDirectory);
  }
  for (const [relativePath, dataUrl] of Object.entries(files)) {
    const match = FRAME_PATH_PATTERN.exec(relativePath);
    const targetPath = path.join(directoryPath, match[1], `frame_${match[2]}.png`);
    fs.writeFileSync(targetPath, dataUrlBytes(dataUrl));
  }
  fs.writeFileSync(path.join(directoryPath, 'sequence.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  return { ok: true, directoryPath, fileCount: expected.size };
}

module.exports = { DIRECTORY_NAMES, FRAME_PATH_PATTERN, expectedSequencePaths, writeSequenceExport };
