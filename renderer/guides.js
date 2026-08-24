(function exposeFramePickGuides(global) {
  function id() {
    return global.crypto?.randomUUID?.() || `guide-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }

  function normalize(value, canvasWidth = 1, canvasHeight = 1) {
    if (!value || typeof value !== 'object') return null;
    const orientation = value.orientation === 'horizontal' ? 'horizontal' : value.orientation === 'vertical' ? 'vertical' : '';
    if (!orientation || !Number.isFinite(Number(value.position))) return null;
    const limit = orientation === 'vertical' ? Math.max(1, Number(canvasWidth) || 1) : Math.max(1, Number(canvasHeight) || 1);
    return {
      id: String(value.id || id()),
      orientation,
      position: Math.max(0, Math.min(limit, Number(value.position)))
    };
  }

  function normalizeAll(values, canvasWidth = 1, canvasHeight = 1) {
    const seen = new Set();
    return (Array.isArray(values) ? values : []).map((value) => normalize(value, canvasWidth, canvasHeight)).filter((guide) => {
      if (!guide || seen.has(guide.id)) return false;
      seen.add(guide.id);
      return true;
    });
  }

  function create(orientation, position, canvasWidth = 1, canvasHeight = 1) {
    return normalize({ id: id(), orientation, position }, canvasWidth, canvasHeight);
  }

  global.FramePickGuides = { normalize, normalizeAll, create };
})(window);
