(function exposeFramePickExportLayout(global) {
  function number(value, fallback = 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  function applyTransform(point, transform) {
    const scale = Math.max(0.0001, number(transform?.scale, 100) / 100);
    const radians = number(transform?.rotate) * Math.PI / 180;
    const cosine = Math.cos(radians);
    const sine = Math.sin(radians);
    const x = point.x * scale;
    const y = point.y * scale;
    return {
      x: x * cosine - y * sine + number(transform?.x),
      y: x * sine + y * cosine + number(transform?.y)
    };
  }

  function transformedContentBounds({ imageWidth, imageHeight, contentBounds, frameTransform, canvasWidth, canvasHeight }) {
    if (contentBounds?.empty) return null;
    const width = Math.max(1, number(imageWidth, 1));
    const height = Math.max(1, number(imageHeight, 1));
    const left = number(contentBounds?.left, 0) - width / 2;
    const top = number(contentBounds?.top, 0) - height / 2;
    const right = number(contentBounds?.right, width) - width / 2;
    const bottom = number(contentBounds?.bottom, height) - height / 2;
    const center = { x: number(canvasWidth) / 2, y: number(canvasHeight) / 2 };
    const points = [
      { x: left, y: top }, { x: right, y: top },
      { x: right, y: bottom }, { x: left, y: bottom }
    ].map((point) => {
      const framePoint = applyTransform(point, frameTransform);
      return { x: framePoint.x + center.x, y: framePoint.y + center.y };
    });
    return {
      minX: Math.min(...points.map((point) => point.x)),
      minY: Math.min(...points.map((point) => point.y)),
      maxX: Math.max(...points.map((point) => point.x)),
      maxY: Math.max(...points.map((point) => point.y))
    };
  }

  function unionBounds(boundsList) {
    const bounds = boundsList.filter(Boolean);
    if (!bounds.length) return { minX: 0, minY: 0, maxX: 1, maxY: 1, width: 1, height: 1 };
    const minX = Math.floor(Math.min(...bounds.map((item) => item.minX)));
    const minY = Math.floor(Math.min(...bounds.map((item) => item.minY)));
    const maxX = Math.ceil(Math.max(...bounds.map((item) => item.maxX)));
    const maxY = Math.ceil(Math.max(...bounds.map((item) => item.maxY)));
    return { minX, minY, maxX, maxY, width: Math.max(1, maxX - minX), height: Math.max(1, maxY - minY) };
  }

  function viewportForBounds(bounds, canvasWidth, canvasHeight) {
    return {
      width: bounds.width,
      height: bounds.height,
      centerX: number(canvasWidth) / 2 - bounds.minX,
      centerY: number(canvasHeight) / 2 - bounds.minY
    };
  }

  global.FramePickExportLayout = { applyTransform, transformedContentBounds, unionBounds, viewportForBounds };
})(window);
