(function exposeFramePickTimeline(global) {
  const MIN_DELAY_MS = 20;
  const DEFAULT_DELAY_MS = 83;

  function normalizeDelay(value) {
    return Math.max(MIN_DELAY_MS, Math.min(5000, Number(value) || DEFAULT_DELAY_MS));
  }
  function activeFrameIndexes(frames) {
    return frames.map((frame, index) => (!frame.skip ? index : -1)).filter((index) => index >= 0);
  }

  function activeFrames(frames) {
    return frames.filter((frame) => !frame.skip);
  }

  function sequenceTotalMs(frames) {
    return activeFrames(frames).reduce((sum, frame) => sum + normalizeDelay(frame.delay), 0);
  }

  function nextActiveFrameIndex(frames, index, direction = 1) {
    let cursor = index + direction;
    while (cursor >= 0 && cursor < frames.length && frames[cursor]?.skip) cursor += direction;
    if (cursor >= 0 && cursor < frames.length && !frames[cursor]?.skip) return cursor;
    const active = activeFrameIndexes(frames);
    return direction < 0 ? (active[0] ?? Math.max(0, index)) : (active.at(-1) ?? Math.max(0, index));
  }

  function frameIndexAtElapsed(frames, milliseconds) {
    const active = activeFrameIndexes(frames);
    if (!active.length) return -1;
    const target = Math.max(0, Math.min(sequenceTotalMs(frames), Number(milliseconds) || 0));
    let elapsed = 0;
    for (const index of active) {
      const end = elapsed + normalizeDelay(frames[index].delay);
      if (target < end || index === active.at(-1)) return index;
      elapsed = end;
    }
    return active.at(-1);
  }

  global.FramePickTimeline = { MIN_DELAY_MS, DEFAULT_DELAY_MS, normalizeDelay, activeFrameIndexes, activeFrames, sequenceTotalMs, nextActiveFrameIndex, frameIndexAtElapsed };
})(window);
