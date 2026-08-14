const fs = require('fs');
const path = require('path');
const { expectedSequencePaths } = require('../../electron/sequence-export');

const FRAME_FILE_PATTERN = /^frame_[0-9]{4}\.png$/i;

function packageName(value) {
  let name = String(value || 'framepick_sequence').replace(/\.fpproj$/i, '').trim();
  name = name.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').replace(/[. ]+$/g, '').slice(0, 80);
  if (!name) name = 'framepick_sequence';
  if (/^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(name)) name = `_${name}`;
  return name;
}

function dataUrlBytes(value) {
  const match = /^data:image\/png;base64,([A-Za-z0-9+/=\r\n]+)$/.exec(String(value || ''));
  if (!match) throw new Error('Godot 序列帧必须是 PNG 数据');
  return Buffer.from(match[1], 'base64');
}

function normalizedNodeAnimation(value) {
  const source = value && typeof value === 'object' ? value : {};
  const keyframes = Array.isArray(source.keyframes) ? source.keyframes.map((keyframe, index) => {
    const numeric = (field, fallback) => Number.isFinite(Number(keyframe?.[field])) ? Number(keyframe[field]) : fallback;
    const bezier = Array.isArray(keyframe?.bezier) && keyframe.bezier.length === 4
      ? keyframe.bezier.map((item) => Math.max(0, Math.min(1, Number(item) || 0)))
      : [0.42, 0, 0.58, 1];
    return {
      id: String(keyframe?.id || `keyframe-${index}`),
      timeMs: Math.max(0, Math.round(numeric('timeMs', 0))),
      x: numeric('x', 0),
      y: numeric('y', 0),
      scale: Math.max(1, numeric('scale', 100)),
      rotate: numeric('rotate', 0),
      curve: String(keyframe?.curve || 'smooth'),
      bezier
    };
  }) : [];
  if (!keyframes.length) keyframes.push({ id: 'identity', timeMs: 0, x: 0, y: 0, scale: 100, rotate: 0, curve: 'linear', bezier: [0, 0, 1, 1] });
  keyframes.sort((left, right) => left.timeMs - right.timeMs);
  return {
    enabled: Boolean(source.enabled),
    target: 'output-node',
    bakedIntoFrames: false,
    pivot: { x: 0.5, y: 0.5 },
    units: { position: 'pixels', scale: 'percent', rotate: 'degrees' },
    keyframes
  };
}

function buildGodotManifest(sequenceManifest, name) {
  expectedSequencePaths(sequenceManifest);
  if (!sequenceManifest.canvas || !Number.isInteger(sequenceManifest.canvas.width) || !Number.isInteger(sequenceManifest.canvas.height)) throw new Error('Godot 导出画布尺寸无效');
  const fps = Number(sequenceManifest.fps);
  if (!Number.isFinite(fps) || fps <= 0) throw new Error('Godot 导出帧率无效');
  const frames = sequenceManifest.frames.map((entry, index) => {
    const delayMs = Number(entry.delayMs);
    if (!Number.isFinite(delayMs) || delayMs <= 0) throw new Error(`第 ${index + 1} 帧停留时间无效`);
    return {
      index,
      file: `frames/frame_${String(index + 1).padStart(4, '0')}.png`,
      delayMs,
      name: String(entry.name || `frame_${String(index + 1).padStart(4, '0')}`)
    };
  });
  return {
    format: 'framepick-godot-sequence',
    schemaVersion: 1,
    generator: { name: 'FramePick', formatVersion: 1 },
    name: packageName(name),
    canvas: sequenceManifest.canvas,
    sourceCanvas: sequenceManifest.sourceCanvas || sequenceManifest.canvas,
    contentBounds: sequenceManifest.contentBounds || { x: 0, y: 0, ...sequenceManifest.canvas },
    fps,
    loop: sequenceManifest.loop !== false,
    frameCount: frames.length,
    totalDurationMs: frames.reduce((total, frame) => total + frame.delayMs, 0),
    frames,
    nodeAnimation: normalizedNodeAnimation(sequenceManifest.sequenceAnimation)
  };
}

function writeGodotExport(payload) {
  if (typeof payload?.directoryPath !== 'string' || !payload.directoryPath.trim()) throw new Error('Godot 导出目录不存在');
  const targetRoot = path.resolve(payload.directoryPath);
  if (!fs.existsSync(targetRoot) || !fs.statSync(targetRoot).isDirectory()) throw new Error('Godot 导出目录不存在');
  let sequenceManifest;
  try { sequenceManifest = JSON.parse(String(payload.manifest || '')); } catch { throw new Error('序列 JSON 无效'); }
  const expected = expectedSequencePaths(sequenceManifest);
  const files = payload.files && typeof payload.files === 'object' && !Array.isArray(payload.files) ? payload.files : null;
  if (!files || Object.keys(files).length !== expected.size || Object.keys(files).some((filePath) => !expected.has(filePath))) throw new Error('Godot 导出序列帧集合不完整');
  const name = packageName(payload.name);
  const godotManifest = buildGodotManifest(sequenceManifest, name);
  const preparedFrames = godotManifest.frames.map((frame, index) => {
    const sourcePath = sequenceManifest.frames[index].files.transformed;
    return { fileName: path.basename(frame.file), bytes: dataUrlBytes(files[sourcePath]) };
  });

  const outputDirectory = path.join(targetRoot, name);
  const framesDirectory = path.join(outputDirectory, 'frames');
  fs.mkdirSync(framesDirectory, { recursive: true });
  for (const fileName of fs.readdirSync(framesDirectory)) if (FRAME_FILE_PATTERN.test(fileName)) fs.unlinkSync(path.join(framesDirectory, fileName));
  for (const frame of preparedFrames) fs.writeFileSync(path.join(framesDirectory, frame.fileName), frame.bytes);
  const manifestPath = path.join(outputDirectory, `${name}.fpseq`);
  fs.writeFileSync(manifestPath, `${JSON.stringify(godotManifest, null, 2)}\n`, 'utf8');
  return { ok: true, outputDirectory, manifestPath, frameCount: preparedFrames.length };
}

module.exports = { FRAME_FILE_PATTERN, packageName, normalizedNodeAnimation, buildGodotManifest, writeGodotExport };
