(function exposeFramePickRenderPipeline(global) {
  function imageSource(frame, variant) {
    return variant === 'ai' && frame?.variants?.backgroundRemoved ? frame.variants.backgroundRemoved : frame?.image;
  }

  function transform(frame, variant) {
    const value = variant === 'ai' ? (frame?.variants?.transform || frame?.transform || {}) : (frame?.transform || {});
    return { x: Number(value.x) || 0, y: Number(value.y) || 0, scale: Math.max(1, Number(value.scale) || 100), rotate: Number(value.rotate) || 0 };
  }

  async function renderFrameToCanvas(frame, { variant = 'original', width = 1024, height = 1024, background = null, includeTransform = true, resolutionScale = 1, viewport = null } = {}) {
    const source = imageSource(frame, variant);
    if (!source) throw new Error('帧图片数据为空');
    const image = new Image();
    image.src = source;
    await new Promise((resolve, reject) => { image.onload = resolve; image.onerror = () => reject(new Error('帧图片加载失败')); });
    const canvas = document.createElement('canvas');
    const rasterScale = Math.max(0.001, Math.min(1, Number(resolutionScale) || 1));
    const outputWidth = Math.max(1, Number(viewport?.width) || Number(width) || 1);
    const outputHeight = Math.max(1, Number(viewport?.height) || Number(height) || 1);
    canvas.width = Math.max(1, Math.round(outputWidth * rasterScale));
    canvas.height = Math.max(1, Math.round(outputHeight * rasterScale));
    const context = canvas.getContext('2d');
    context.clearRect(0, 0, canvas.width, canvas.height);
    if (background) { context.fillStyle = background; context.fillRect(0, 0, canvas.width, canvas.height); }
    const naturalWidth = image.naturalWidth || image.width || canvas.width;
    const naturalHeight = image.naturalHeight || image.height || canvas.height;
    // Canvas dimensions are pixel dimensions, not a fit target. Keep source pixels
    // at 1:1 so resizing the canvas behaves like a Photoshop canvas resize.
    const imageWidth = naturalWidth * rasterScale;
    const imageHeight = naturalHeight * rasterScale;
    const current = includeTransform ? transform(frame, variant) : { x: 0, y: 0, scale: 100, rotate: 0 };
    const centerX = Number.isFinite(Number(viewport?.centerX)) ? Number(viewport.centerX) : Number(width) / 2;
    const centerY = Number.isFinite(Number(viewport?.centerY)) ? Number(viewport.centerY) : Number(height) / 2;
    context.save();
    context.translate(centerX * rasterScale, centerY * rasterScale);
    context.translate(current.x * rasterScale, current.y * rasterScale);
    context.rotate(current.rotate * Math.PI / 180);
    context.scale(current.scale / 100, current.scale / 100);
    context.drawImage(image, -imageWidth / 2, -imageHeight / 2, imageWidth, imageHeight);
    context.restore();
    return canvas;
  }

  async function renderFrameToCanvasDataUrl(frame, variant, mime, quality, width, height, resolutionScale = 1, viewport = null) {
    const canvas = await renderFrameToCanvas(frame, { variant, width, height, includeTransform: true, resolutionScale, viewport });
    return canvas.toDataURL(mime, quality);
  }

  function renderFrameIntoElement(element, frame, variant, width, height, resolutionScale = 1) {
    if (!element || !frame) return;
    const token = (Number(element.dataset.renderToken) || 0) + 1;
    element.dataset.renderToken = String(token);
    renderFrameToCanvas(frame, { variant, width, height, includeTransform: true, resolutionScale }).then((canvas) => {
      if (element.dataset.renderToken !== String(token)) return;
      if (element.tagName === 'CANVAS') {
        element.width = canvas.width;
        element.height = canvas.height;
        const context = element.getContext('2d');
        context.clearRect(0, 0, element.width, element.height);
        context.drawImage(canvas, 0, 0);
      } else {
        element.src = canvas.toDataURL('image/png');
      }
      if (element.tagName !== 'CANVAS') element.style.transform = 'none';
    }).catch((error) => console.warn('[统一渲染] 渲染失败', error));
  }

  global.FramePickRenderPipeline = { imageSource, transform, renderFrameToCanvas, renderFrameToCanvasDataUrl, renderFrameIntoElement };
})(window);
