(function exposeFramePickExport(global) {
  function buildSequenceManifest({ frames, sequenceVariant, sequenceAnimation, fps, loop = true, width, height, sourceCanvas = null, contentBounds = null, frameTransform }) {
    const activeFrames = frames.filter((frame) => !frame.skip);
    return {
      format: 'framepick-sequence',
      schemaVersion: 1,
      canvas: { width, height },
      sourceCanvas: sourceCanvas || { width, height },
      contentBounds: contentBounds || { x: 0, y: 0, width, height },
      fps,
      loop: Boolean(loop),
      variant: sequenceVariant,
      directories: { original: 'original', ai: 'ai', transformed: 'transformed' },
      sequenceAnimation: {
        ...FramePickSequenceAnimation.create(sequenceAnimation),
        target: 'output-node',
        bakedIntoFrames: false,
        pivot: { x: 0.5, y: 0.5 },
        units: { position: 'pixels', scale: 'percent', rotate: 'degrees' }
      },
      frameCount: activeFrames.length,
      totalDurationMs: activeFrames.reduce((sum, frame) => sum + frame.delay, 0),
      frames: activeFrames.map((frame, index) => {
        const fileName = `frame_${String(index + 1).padStart(4, '0')}.png`;
        const files = {
          original: `original/${fileName}`,
          ai: frame.variants?.backgroundRemoved ? `ai/${fileName}` : null,
          transformed: `transformed/${fileName}`
        };
        return {
          index,
          file: files.transformed,
          files,
          delayMs: frame.delay,
          skipped: false,
          name: frame.name,
          source: frame.source,
          sourceTimeMs: Math.max(0, Math.round(Number(frame.time || 0) * 1000)),
          transform: frameTransform(frame, sequenceVariant),
          transforms: {
            original: frameTransform(frame, 'original'),
            ai: frameTransform(frame, 'ai')
          }
        };
      })
    };
  }

  function dataUrlToBlob(dataUrl) {
    const [meta, encoded] = dataUrl.split(',');
    const bytes = Uint8Array.from(atob(encoded), (character) => character.charCodeAt(0));
    return new Blob([bytes], { type: meta.match(/data:(.*?);/)?.[1] || 'image/jpeg' });
  }

  global.FramePickExport = { buildSequenceManifest, dataUrlToBlob };
})(window);
