(function exposeVideoSampling(global) {
  const DEFAULT_SOURCE_FPS = 24;

  function normalizeSourceFps(value) {
    const fps = Number(value);
    return Number.isFinite(fps) && fps > 0 ? fps : DEFAULT_SOURCE_FPS;
  }

  function normalizeIntervalFrames(value) {
    const interval = Math.floor(Number(value));
    return Number.isFinite(interval) && interval >= 1 ? interval : 1;
  }

  function sourcePosition(source = {}, sourceFps = DEFAULT_SOURCE_FPS) {
    const fps = normalizeSourceFps(sourceFps);
    const sourceTimeMs = Math.max(0, Number(source.sourceTimeMs) || 0);
    const recordedFrameIndex = Number(source.sourceFrameIndex);
    const frameIndex = Number.isFinite(recordedFrameIndex) && recordedFrameIndex >= 0
      ? Math.round(recordedFrameIndex)
      : Math.round(sourceTimeMs * fps / 1000);
    const timeSeconds = frameIndex / fps;
    return { frameIndex, timeSeconds, sourceTimeMs: Math.round(timeSeconds * 1000) };
  }

  function createPlan(durationSeconds, intervalFrames, sourceFps = DEFAULT_SOURCE_FPS) {
    const duration = Number(durationSeconds);
    if (!Number.isFinite(duration) || duration <= 0) return [];
    const fps = normalizeSourceFps(sourceFps);
    const interval = normalizeIntervalFrames(intervalFrames);
    const sourceFrameCount = Math.max(1, Math.ceil(duration * fps));
    const plan = [];
    for (let frameIndex = 0; frameIndex < sourceFrameCount; frameIndex += interval) {
      plan.push({
        frameIndex,
        timeSeconds: frameIndex / fps,
        sourceTimeMs: Math.round(frameIndex * 1000 / fps)
      });
    }
    return plan;
  }

  global.FramePickVideoSampling = {
    DEFAULT_SOURCE_FPS,
    normalizeIntervalFrames,
    sourcePosition,
    createPlan
  };
})(window);
