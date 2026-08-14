const fs = require('fs');
const path = require('path');
const { writeSequenceExport } = require('./sequence-export');

function dataUrlBytes(value) {
  const match = /^data:[^;,]+;base64,([A-Za-z0-9+/=\r\n]+)$/.exec(String(value || ''));
  if (!match) throw new Error('项目图片资产数据无效');
  return Buffer.from(match[1], 'base64');
}

function expectedProjectAssets(documentData) {
  const expected = new Set();
  documentData.frames.forEach((entry, index) => {
    const number = String(index + 1).padStart(4, '0');
    const original = `frames/frame_${number}_original.png`;
    const ai = entry?.variants?.ai?.available ? `frames/frame_${number}_ai.png` : null;
    if (entry?.variants?.original?.imagePath !== original || entry?.variants?.ai?.imagePath !== ai) throw new Error(`第 ${index + 1} 帧项目资产路径无效`);
    expected.add(original);
    if (ai) expected.add(ai);
  });
  return expected;
}

function writeProjectPayload(filePath, payload) {
  if (!filePath || !String(filePath).toLowerCase().endsWith('.fpproj')) throw new Error('项目文件必须使用 .fpproj 扩展名');
  let documentData;
  try { documentData = JSON.parse(String(payload?.data || '')); } catch { throw new Error('项目 JSON 无效'); }
  if (documentData?.format !== 'framepick-project' || documentData?.schemaVersion !== 1 || !Array.isArray(documentData.frames)) throw new Error('项目格式不受支持');
  const expectedAssets = expectedProjectAssets(documentData);
  const assets = payload.assets && typeof payload.assets === 'object' && !Array.isArray(payload.assets) ? payload.assets : null;
  if (!assets || Object.keys(assets).length !== expectedAssets.size || Object.keys(assets).some((assetPath) => !expectedAssets.has(assetPath))) throw new Error('项目图片资产集合不完整');
  const preparedAssets = Object.fromEntries(Object.entries(assets).map(([assetPath, dataUrl]) => [assetPath, dataUrlBytes(dataUrl)]));
  if (!payload.sequence || typeof payload.sequence.manifest !== 'string' || !payload.sequence.files || typeof payload.sequence.files !== 'object') throw new Error('完整项目快照缺少序列帧');

  const resolvedFilePath = path.resolve(filePath);
  const projectDirectory = path.dirname(resolvedFilePath);
  fs.mkdirSync(projectDirectory, { recursive: true });
  const framesDirectory = path.join(projectDirectory, 'frames');
  fs.mkdirSync(framesDirectory, { recursive: true });
  for (const name of fs.readdirSync(framesDirectory)) if (/^frame_[0-9]{4}_(?:original|ai)\.png$/i.test(name)) fs.unlinkSync(path.join(framesDirectory, name));
  for (const [relativePath, bytes] of Object.entries(preparedAssets)) fs.writeFileSync(path.join(projectDirectory, ...relativePath.split('/')), bytes);

  const sequenceDirectory = path.join(projectDirectory, 'sequence');
  fs.mkdirSync(sequenceDirectory, { recursive: true });
  writeSequenceExport({ directoryPath: sequenceDirectory, manifest: payload.sequence.manifest, files: payload.sequence.files });
  fs.writeFileSync(resolvedFilePath, `${JSON.stringify(documentData, null, 2)}\n`, 'utf8');
  return { ok: true, filePath: resolvedFilePath, sequenceDirectory };
}

module.exports = { expectedProjectAssets, writeProjectPayload };
