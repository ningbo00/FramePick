(function exposeFramePickSequenceAnimation(global) {
  const IDENTITY = Object.freeze({ x: 0, y: 0, scale: 100, rotate: 0 });
  const CURVES = Object.freeze({
    linear: [0, 0, 1, 1],
    ease: [0.25, 0.1, 0.25, 1],
    'ease-in': [0.42, 0, 1, 1],
    'ease-out': [0, 0, 0.58, 1],
    smooth: [0.42, 0, 0.58, 1]
  });

  function finite(value, fallback) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  function normalizeBezier(value, curve) {
    const fallback = CURVES[curve] || CURVES.smooth;
    if (!Array.isArray(value) || value.length !== 4) return [...fallback];
    return value.map((item, index) => Math.max(0, Math.min(1, finite(item, fallback[index]))));
  }

  function normalizeKeyframe(value = {}, index = 0) {
    if (!value || typeof value !== 'object') value = {};
    const curve = value.curve === 'custom' || CURVES[value.curve] ? value.curve : 'smooth';
    const timeMs = Math.max(0, Math.round(finite(value.timeMs, 0)));
    return {
      id: String(value.id || `motion-${index}-${timeMs}`),
      timeMs,
      x: finite(value.x, 0),
      y: finite(value.y, 0),
      scale: Math.max(1, finite(value.scale, 100)),
      rotate: finite(value.rotate, 0),
      curve,
      bezier: normalizeBezier(value.bezier, curve)
    };
  }

  function create(value = {}) {
    if (!value || typeof value !== 'object') value = {};
    const source = Array.isArray(value.keyframes) ? value.keyframes : [];
    const sorted = source.map(normalizeKeyframe).sort((a, b) => a.timeMs - b.timeMs);
    const keyframes = [];
    for (const keyframe of sorted) {
      const duplicate = keyframes.findIndex((item) => item.timeMs === keyframe.timeMs);
      if (duplicate >= 0) keyframes[duplicate] = keyframe;
      else keyframes.push(keyframe);
    }
    if (!keyframes.length) keyframes.push(normalizeKeyframe({ timeMs: 0, ...IDENTITY }, 0));
    return { enabled: Boolean(value.enabled), keyframes };
  }

  function cubicCoordinate(t, first, second) {
    const inverse = 1 - t;
    return 3 * inverse * inverse * t * first + 3 * inverse * t * t * second + t * t * t;
  }

  function cubicBezier(progress, bezier) {
    const [x1, y1, x2, y2] = normalizeBezier(bezier, 'smooth');
    const target = Math.max(0, Math.min(1, finite(progress, 0)));
    let low = 0;
    let high = 1;
    for (let index = 0; index < 16; index += 1) {
      const midpoint = (low + high) / 2;
      if (cubicCoordinate(midpoint, x1, x2) < target) low = midpoint;
      else high = midpoint;
    }
    return cubicCoordinate((low + high) / 2, y1, y2);
  }

  function evaluate(value, timeMs) {
    const animation = create(value);
    if (!animation.enabled) return { ...IDENTITY };
    const time = Math.max(0, finite(timeMs, 0));
    const keyframes = animation.keyframes;
    const transformAt = (keyframe) => ({ x: keyframe.x, y: keyframe.y, scale: keyframe.scale, rotate: keyframe.rotate });
    if (time <= keyframes[0].timeMs || keyframes.length === 1) return transformAt(keyframes[0]);
    const last = keyframes.at(-1);
    if (time >= last.timeMs) return transformAt(last);
    const endIndex = keyframes.findIndex((keyframe) => keyframe.timeMs >= time);
    const start = keyframes[endIndex - 1];
    const end = keyframes[endIndex];
    if (time === end.timeMs) return transformAt(end);
    const progress = (time - start.timeMs) / Math.max(1, end.timeMs - start.timeMs);
    const bezier = start.curve === 'custom' ? start.bezier : CURVES[start.curve] || CURVES.smooth;
    const eased = cubicBezier(progress, bezier);
    const mix = (from, to) => from + (to - from) * eased;
    return {
      x: mix(start.x, end.x),
      y: mix(start.y, end.y),
      scale: mix(start.scale, end.scale),
      rotate: mix(start.rotate, end.rotate)
    };
  }

  function breathing(durationMs, amount = 3) {
    const duration = Math.max(40, Math.round(finite(durationMs, 1000)));
    const scale = Math.max(0.1, finite(amount, 3));
    return create({
      enabled: true,
      keyframes: [
        { id: 'breathe-start', timeMs: 0, ...IDENTITY, curve: 'smooth' },
        { id: 'breathe-peak', timeMs: Math.round(duration / 2), ...IDENTITY, scale: 100 + scale, curve: 'smooth' },
        { id: 'breathe-end', timeMs: duration, ...IDENTITY, curve: 'smooth' }
      ]
    });
  }

  function viewportInsets(width, height, transform = IDENTITY, pixelsPerUnitX = 1, pixelsPerUnitY = pixelsPerUnitX) {
    const baseWidth = Math.max(1, finite(width, 1));
    const baseHeight = Math.max(1, finite(height, 1));
    const scale = Math.max(0.01, finite(transform.scale, 100) / 100);
    const radians = finite(transform.rotate, 0) * Math.PI / 180;
    const cosine = Math.abs(Math.cos(radians));
    const sine = Math.abs(Math.sin(radians));
    const boundsWidth = baseWidth * scale * cosine + baseHeight * scale * sine;
    const boundsHeight = baseWidth * scale * sine + baseHeight * scale * cosine;
    const translateX = finite(transform.x, 0) * finite(pixelsPerUnitX, 1);
    const translateY = finite(transform.y, 0) * finite(pixelsPerUnitY, 1);
    const inset = (value) => value <= 1e-6 ? 0 : Math.ceil(value);
    const extraX = (boundsWidth - baseWidth) / 2;
    const extraY = (boundsHeight - baseHeight) / 2;
    return {
      top: inset(extraY - translateY),
      right: inset(extraX + translateX),
      bottom: inset(extraY + translateY),
      left: inset(extraX - translateX)
    };
  }

  global.FramePickSequenceAnimation = { IDENTITY, CURVES, normalizeKeyframe, create, evaluate, breathing, cubicBezier, viewportInsets };
})(window);
