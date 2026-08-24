(function exposeFramePickProjectIo(global) {
  const normalizeGuides = (...args) => global.FramePickGuides?.normalizeAll?.(...args) || [];
  function assetPathForFrame(index, variant) {
    return `frames/frame_${String(index + 1).padStart(4, '0')}_${variant}.png`;
  }

  function projectName(value) {
    const name = String(value || '').trim().replace(/\.fpproj$/i, '');
    if (!name || /[\\/:*?"<>|]/.test(name)) throw new Error('项目名称无效');
    return name;
  }

  function normalizeMediaReference(value) {
    if (!value || typeof value !== 'object') return null;
    const kind = value.kind === 'image' ? 'image' : value.kind === 'video' ? 'video' : '';
    const name = String(value.name || '').trim();
    if (!kind || !name) return null;
    return {
      kind,
      name,
      path: String(value.path || '').trim(),
      duration: Math.max(0, Number(value.duration) || 0),
      width: Math.max(1, Math.round(Number(value.width) || 1)),
      height: Math.max(1, Math.round(Number(value.height) || 1)),
      thumbnail: typeof value.thumbnail === 'string' ? value.thumbnail : ''
    };
  }

  function normalizeMedia(value) {
    const source = value && typeof value === 'object' ? value : {};
    const clips = (Array.isArray(source.clips) ? source.clips : []).map(normalizeMediaReference).filter(Boolean);
    const requestedActive = Number(source.activeClip);
    const activeClip = Number.isInteger(requestedActive) && requestedActive >= 0 && requestedActive < clips.length ? requestedActive : -1;
    return { clips, activeClip };
  }

  function validateTransform(value, label) {
    if (!value || typeof value !== 'object') throw new Error(`${label} 变换无效`);
    for (const key of ['x', 'y', 'scale', 'rotate']) if (!Number.isFinite(Number(value[key]))) throw new Error(`${label} 变换无效`);
    return FrameModel.transform(value);
  }

  function validateDocument(documentData) {
    if (!documentData || documentData.format !== 'framepick-project' || documentData.schemaVersion !== 1 || !documentData.canvas || !Number.isInteger(documentData.canvas.width) || !Number.isInteger(documentData.canvas.height) || documentData.canvas.width < 1 || documentData.canvas.width > 8192 || documentData.canvas.height < 1 || documentData.canvas.height > 8192 || !documentData.playback || !Number.isFinite(Number(documentData.playback.fps)) || Number(documentData.playback.fps) < 1 || Number(documentData.playback.fps) > 60 || typeof documentData.playback.loop !== 'boolean' || !['original', 'ai'].includes(documentData.sequenceVariant) || !Array.isArray(documentData.frames)) throw new Error('项目格式不受支持');
    const name = projectName(documentData.project?.name);
    const ids = new Set();
    documentData.frames.forEach((entry, index) => {
      const originalPath = entry?.variants?.original?.imagePath;
      const aiPath = entry?.variants?.ai?.imagePath;
      const validPath = (value, variant) => typeof value === 'string' && new RegExp(`^frames/frame_[0-9]{4}_${variant}\\.png$`).test(value);
      if (!entry || typeof entry.id !== 'string' || !entry.id || ids.has(entry.id) || typeof entry.name !== 'string' || !entry.name || !entry.source || typeof entry.source !== 'object' || !['video', 'image'].includes(entry.source.type) || typeof entry.source.fileName !== 'string' || !entry.source.fileName || !Number.isFinite(Number(entry.source.sourceTimeMs)) || Number(entry.source.sourceTimeMs) < 0 || entry.source.sourceFrameIndex != null && (!Number.isInteger(Number(entry.source.sourceFrameIndex)) || Number(entry.source.sourceFrameIndex) < 0) || !validPath(originalPath, 'original') || !entry.variants?.ai || typeof entry.variants.ai.available !== 'boolean' || (entry.variants.ai.available && !validPath(aiPath, 'ai')) || (!entry.variants.ai.available && aiPath !== null) || !Number.isFinite(Number(entry.delayMs)) || Number(entry.delayMs) < 20 || Number(entry.delayMs) > 5000 || typeof entry.skipped !== 'boolean') throw new Error(`第 ${index + 1} 帧格式不受支持`);
      validateTransform(entry.variants.original.transform, `第 ${index + 1} 帧原图`);
      validateTransform(entry.variants.ai.transform, `第 ${index + 1} 帧 AI`);
      ids.add(entry.id);
    });
    const sequenceAnimation = FramePickSequenceAnimation.create(documentData.sequenceAnimation);
    const guides = normalizeGuides(documentData.guides, documentData.canvas.width, documentData.canvas.height);
    const media = normalizeMedia(documentData.media);
    return { name, frames: documentData.frames, sequenceAnimation, guides, guidesVisible: documentData.guidesVisible !== false, media };
  }

  function buildDocument({ projectName: name, canvasWidth, canvasHeight, fps, loop, sequenceVariant, sequenceAnimation, guides = [], guidesVisible = true, frames, assetPathForFrame: assetPath, media = {} }) {
    const normalizedMedia = normalizeMedia(media);
    return {
      format: 'framepick-project',
      schemaVersion: 1,
      project: { name: projectName(name) },
      canvas: { width: canvasWidth, height: canvasHeight },
      playback: { fps, loop },
      sequenceVariant,
      sequenceAnimation: FramePickSequenceAnimation.create(sequenceAnimation),
      guides: normalizeGuides(guides, canvasWidth, canvasHeight),
      guidesVisible: guidesVisible !== false,
      media: normalizedMedia,
      sequenceSnapshot: { manifestPath: 'sequence/sequence.json' },
      frames: frames.map((frame, index) => FrameModel.toProjectEntry(frame, index, assetPath))
    };
  }

  global.FramePickProjectIo = { assetPathForFrame, projectName, normalizeMedia, validateTransform, validateDocument, buildDocument };
})(window);
