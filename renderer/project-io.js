(function exposeFramePickProjectIo(global) {
  function assetPathForFrame(index, variant) {
    return `frames/frame_${String(index + 1).padStart(4, '0')}_${variant}.png`;
  }

  function projectName(value) {
    const name = String(value || '').trim().replace(/\.fpproj$/i, '');
    if (!name || /[\\/:*?"<>|]/.test(name)) throw new Error('项目名称无效');
    return name;
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
      if (!entry || typeof entry.id !== 'string' || !entry.id || ids.has(entry.id) || typeof entry.name !== 'string' || !entry.name || !entry.source || typeof entry.source !== 'object' || !['video', 'image'].includes(entry.source.type) || typeof entry.source.fileName !== 'string' || !entry.source.fileName || !Number.isFinite(Number(entry.source.sourceTimeMs)) || Number(entry.source.sourceTimeMs) < 0 || !validPath(originalPath, 'original') || !entry.variants?.ai || typeof entry.variants.ai.available !== 'boolean' || (entry.variants.ai.available && !validPath(aiPath, 'ai')) || (!entry.variants.ai.available && aiPath !== null) || !Number.isFinite(Number(entry.delayMs)) || Number(entry.delayMs) < 20 || Number(entry.delayMs) > 5000 || typeof entry.skipped !== 'boolean') throw new Error(`第 ${index + 1} 帧格式不受支持`);
      validateTransform(entry.variants.original.transform, `第 ${index + 1} 帧原图`);
      validateTransform(entry.variants.ai.transform, `第 ${index + 1} 帧 AI`);
      ids.add(entry.id);
    });
    const sequenceAnimation = FramePickSequenceAnimation.create(documentData.sequenceAnimation);
    return { name, frames: documentData.frames, sequenceAnimation };
  }

  function buildDocument({ projectName: name, canvasWidth, canvasHeight, fps, loop, sequenceVariant, sequenceAnimation, frames, assetPathForFrame: assetPath }) {
    return {
      format: 'framepick-project',
      schemaVersion: 1,
      project: { name: projectName(name) },
      canvas: { width: canvasWidth, height: canvasHeight },
      playback: { fps, loop },
      sequenceVariant,
      sequenceAnimation: FramePickSequenceAnimation.create(sequenceAnimation),
      sequenceSnapshot: { manifestPath: 'sequence/sequence.json' },
      frames: frames.map((frame, index) => FrameModel.toProjectEntry(frame, index, assetPath))
    };
  }

  global.FramePickProjectIo = { assetPathForFrame, projectName, validateTransform, validateDocument, buildDocument };
})(window);
