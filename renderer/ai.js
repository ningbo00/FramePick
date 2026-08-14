(function exposeFramePickAi(global) {
  function validateApiUrl(value) {
    const parsed = new URL(String(value || ''));
    if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('API 请求地址必须是 http 或 https 地址');
    return parsed;
  }

  function validateEngine(value) {
    return value === 'openai' ? 'openai' : 'comfyui';
  }

  global.FramePickAi = { validateApiUrl, validateEngine };
})(window);
