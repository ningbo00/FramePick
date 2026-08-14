(function exposeFrameModel(global) {
  const DEFAULT_TRANSFORM = Object.freeze({ x: 0, y: 0, scale: 100, rotate: 0 });

  function transform(value = {}) {
    return {
      x: Number(value.x) || 0,
      y: Number(value.y) || 0,
      scale: Math.max(1, Number(value.scale) || 100),
      rotate: Number(value.rotate) || 0
    };
  }

  function source(value = {}) {
    if (typeof value === 'string') return { type: 'video', fileName: value, sourceTimeMs: 0 };
    return {
      type: value.type === 'image' ? 'image' : 'video',
      fileName: String(value.fileName || 'source'),
      sourceTimeMs: Math.max(0, Number(value.sourceTimeMs) || 0)
    };
  }

  function create(input = {}) {
    const originalTransform = transform(input.transform);
    const aiImage = input.aiImage || input.variants?.backgroundRemoved || null;
    const aiTransform = transform(input.aiTransform || input.variants?.transform || originalTransform);
    return {
      id: String(input.id || crypto.randomUUID()),
      image: input.image || '',
      variants: aiImage ? { backgroundRemoved: aiImage, transform: aiTransform } : { transform: aiTransform },
      delay: Math.max(20, Math.min(5000, Number(input.delay ?? input.delayMs) || 83)),
      time: Math.max(0, Number(input.time ?? (Number(input.source?.sourceTimeMs || 0) / 1000)) || 0),
      width: Math.max(1, Number(input.width) || 1),
      height: Math.max(1, Number(input.height) || 1),
      transform: originalTransform,
      source: source(input.source),
      name: String(input.name || 'frame'),
      skip: Boolean(input.skip ?? input.skipped)
    };
  }

  function toProjectEntry(frame, index, assetPathForFrame) {
    const aiAvailable = Boolean(frame.variants?.backgroundRemoved);
    return {
      id: String(frame.id),
      name: String(frame.name || `frame_${String(index + 1).padStart(4, '0')}`),
      source: source(frame.source),
      variants: {
        original: { imagePath: assetPathForFrame(index, 'original'), transform: transform(frame.transform) },
        ai: { available: aiAvailable, imagePath: aiAvailable ? assetPathForFrame(index, 'ai') : null, transform: transform(frame.variants?.transform || frame.transform) }
      },
      delayMs: Math.max(20, Math.min(5000, Number(frame.delay) || 83)),
      skipped: Boolean(frame.skip)
    };
  }

  function fromProjectEntry(entry, images, canvas) {
    return create({
      id: entry.id,
      name: entry.name,
      source: entry.source,
      image: images.original,
      aiImage: images.ai,
      transform: entry.variants.original.transform,
      aiTransform: entry.variants.ai.transform,
      delayMs: entry.delayMs,
      skipped: entry.skipped,
      width: canvas.width,
      height: canvas.height
    });
  }

  global.FrameModel = { DEFAULT_TRANSFORM, transform, source, create, toProjectEntry, fromProjectEntry };
})(window);
