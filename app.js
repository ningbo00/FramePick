const $ = (selector) => document.querySelector(selector);
const video = $('#video');
const sourceImage = $('#sourceImage');
const placeholder = $('#videoPlaceholder');
const fileInput = $('#fileInput');
const projectFileInput = $('#projectFileInput');
const toast = $('#toast');
const sidebar = $('.sidebar');
const previewOverlay = $('#sequencePreviewOverlay');
const onionPrevOverlay = $('#onionPrevOverlay');
const onionNextOverlay = $('#onionNextOverlay');
const videoPanel = $('.video-panel');
const sequenceScrubber = $('#sequenceScrubber');
const aiModal = $('#aiModal');
const settingsModal = $('#settingsModal');
const SOURCE_VIDEO_FPS = FramePickVideoSampling.DEFAULT_SOURCE_FPS;
const panelMode = new URLSearchParams(window.location.search).get('panel') || '';
let panelSyncApplying = false;
let panelSyncTimer = null;
const detachedPanels = new Set();
const collapsedPanels = new Set();
if (panelMode) {
  document.body.dataset.panel = panelMode;
  document.title = `FramePick · ${{ assets: '素材库', workspace: '取帧工作区', sequence: '序列帧', inspector: '属性' }[panelMode] || '面板'}`;
}

window.addEventListener('error', (event) => console.error('页面错误', event.message, event.filename, event.lineno, event.colno));
window.addEventListener('unhandledrejection', (event) => console.error('未处理的异步错误', event.reason));

const initialState = FramePickState.create();
let clips = initialState.clips;
let activeClip = initialState.activeClip;
let frames = initialState.frames;
let selected = initialState.selected;
let selectedIndices = initialState.selectedIndices;
let selectionAnchor = initialState.selectionAnchor;
let fps = initialState.fps;
let exportDirectory = null;
let projectFileHandle = null;
let projectFilePath = initialState.projectFilePath;
let projectFileName = initialState.projectFileName;
let projectSaving = false;
let previewPlaying = false;
let previewElapsed = 0;
let previewIndex = 0;
let previewMotionTimer = null;
let previewMotionElapsed = 0;
let displayMode = 'video';
let sequenceVariant = initialState.sequenceVariant;
let sequenceAnimation = initialState.sequenceAnimation;
let transformMode = 'move';
let workspaceScale = Number($('#previewSize')?.value) || 55;
let timelineScale = Number($('#timelineSize')?.value) || 78;
let canvasWidth = initialState.canvasWidth;
let canvasHeight = initialState.canvasHeight;
let exportWidth = initialState.exportWidth;
let exportHeight = initialState.exportHeight;
let exportFollowsCanvas = true;
let exportResolutionExplicit = false;
let undoStack = [];
let redoStack = [];
let historySnapshot = '';
let historyApplying = false;
let inspectorPreviewToken = 0;
let selectedMotionKeyframeId = sequenceAnimation.keyframes[0]?.id || '';
const exportPluginFormats = new Map();
let autoExtracting = false;
let autoExtractCancelled = false;
let sourceSeekRequest = 0;

function panelStateSnapshot() {
  return {
    clips: clips.map((clip) => ({
      name: clip.name,
      kind: clip.kind,
      duration: Number(clip.duration) || 0,
      width: Number(clip.width) || 0,
      height: Number(clip.height) || 0,
      thumbnail: clip.thumbnail || ''
    })),
    activeClip,
    frames: frames.map((frame) => ({ ...frame, source: { ...frame.source }, variants: { ...frame.variants } })),
    selected,
    selectedIndices: [...selectedIndices],
    selectionAnchor,
    fps,
    canvasWidth,
    canvasHeight,
    sequenceVariant,
    sequenceAnimation,
    displayMode,
    previewPlaying,
    previewElapsed,
    previewMotionElapsed,
    previewIndex,
    projectFileName,
    loop: Boolean($('#loopToggle')?.classList.contains('active'))
  };
}

function schedulePanelStateSync() {
  if (panelSyncApplying || !window.framepickDesktop?.panels?.sendState) return;
  clearTimeout(panelSyncTimer);
  panelSyncTimer = setTimeout(() => {
    panelSyncTimer = null;
    window.framepickDesktop.panels.sendState(panelStateSnapshot());
  }, 0);
}

function applyPanelState(state) {
  if (!state || panelSyncApplying) return;
  panelSyncApplying = true;
  try {
    if (Array.isArray(state.clips)) {
      if (panelMode) {
        clips = state.clips.map((clip) => ({ ...clip, url: clip.url || '' }));
      } else {
        const existingByName = new Map(clips.map((clip) => [clip.name, clip]));
        clips = state.clips.map((clip) => ({ ...(existingByName.get(clip.name) || {}), ...clip, url: existingByName.get(clip.name)?.url || clip.url || '' }));
      }
    }
    if (Number.isInteger(state.activeClip)) activeClip = state.activeClip;
    if (activeClip < 0 || activeClip >= clips.length) activeClip = clips.length ? Math.min(activeClip, clips.length - 1) : -1;
    if (Array.isArray(state.frames)) frames = state.frames.map((frame) => FrameModel.create(frame));
    selected = Number.isInteger(state.selected) && state.selected >= 0 && state.selected < frames.length ? state.selected : (frames.length ? 0 : -1);
    selectedIndices = new Set((Array.isArray(state.selectedIndices) ? state.selectedIndices : [selected]).filter((index) => Number.isInteger(index) && index >= 0 && index < frames.length));
    if (selected >= 0 && !selectedIndices.size) selectedIndices.add(selected);
    selectionAnchor = Number.isInteger(state.selectionAnchor) ? state.selectionAnchor : selected;
    fps = Math.max(1, Math.min(60, Number(state.fps) || 12));
    sequenceVariant = state.sequenceVariant === 'ai' ? 'ai' : 'original';
    sequenceAnimation = FramePickSequenceAnimation.create(state.sequenceAnimation);
    selectedMotionKeyframeId = sequenceAnimation.keyframes[0]?.id || '';
    if (state.projectFileName) projectFileName = state.projectFileName;
    displayMode = state.displayMode === 'sequence' ? 'sequence' : 'video';
    const incomingPreviewPlaying = Boolean(state.previewPlaying);
    const wasPreviewPlaying = previewPlaying;
    const incomingPreviewElapsed = Math.max(0, Number(state.previewElapsed) || 0);
    const incomingPreviewMotionElapsed = Math.max(0, Number(state.previewMotionElapsed ?? state.previewElapsed) || 0);
    const incomingPreviewIndex = Number.isInteger(state.previewIndex) ? state.previewIndex : -1;
    previewElapsed = incomingPreviewElapsed;
    previewMotionElapsed = incomingPreviewMotionElapsed;
    previewIndex = incomingPreviewIndex;
    if (Number(state.canvasWidth) > 0 && Number(state.canvasHeight) > 0) updateCanvasResolution(state.canvasWidth, state.canvasHeight, false);
    $('#loopToggle')?.classList.toggle('active', state.loop !== false);
    $('#loopToggle')?.setAttribute('aria-pressed', String(state.loop !== false));
    $('#fpsValue').textContent = fps;
    $('#modalFpsLabel').textContent = `${fps} FPS`;
    $('#sequenceVariantBtn').textContent = sequenceVariant === 'ai' ? '当前：AI 抠图序列' : '当前：原始序列';
    $('#sequenceVariantBtn').classList.toggle('is-ai', sequenceVariant === 'ai');
    renderClips();
    $('#currentClipName').textContent = clips[activeClip]?.name || '未选择素材';
    renderTimeline();
    updateInspector();
    updateMotionEditor();
    if (displayMode === 'sequence' && selected >= 0) renderSequenceInMainWindow();
    else if (!panelMode) resetVideoStage();
    previewElapsed = incomingPreviewElapsed;
    previewMotionElapsed = incomingPreviewMotionElapsed;
    previewIndex = incomingPreviewIndex;
    if (displayMode === 'sequence' && activeFrameIndexes().length) {
      renderPreviewFrame(frameIndexAtElapsed(previewElapsed), { syncSelection: false });
      applySequenceAnimationPreview(previewElapsed);
    }
    if (incomingPreviewPlaying && activeFrameIndexes().length) {
      previewPlaying = true;
      $('#sequencePlayBtn').textContent = 'Ⅱ';
      $('#sequencePlayBtn').classList.add('is-playing');
      if (!wasPreviewPlaying) startSequenceMotionClock();
    } else {
      previewPlaying = false;
      stopSequenceMotionClock();
      $('#sequencePlayBtn').textContent = '▶';
      $('#sequencePlayBtn').classList.remove('is-playing');
      sequenceScrubber.value = String(previewElapsed);
      $('#sequenceTimeLabel').textContent = formatTime(previewElapsed / 1000, true);
    }
    updateProjectIdentity(projectFileName, false);
  } finally {
    panelSyncApplying = false;
  }
}

function openPanelWindow(panel) {
  if (!window.framepickDesktop?.panels?.open) return showToast('独立面板仅支持桌面版');
  window.framepickDesktop.panels.open(panel).then((result) => {
    if (result?.error) showToast(`无法打开面板：${result.error}`);
    else if (result?.ok) setPanelDetached(panel, true);
  }).catch((error) => showToast(`无法打开面板：${error.message}`));
}

function updateWorkspacePanelLayout() {
  document.body.dataset.detachedPanels = [...detachedPanels].join(' ');
  document.body.dataset.collapsedPanels = [...collapsedPanels].join(' ');
  const columns = [];
  if (!detachedPanels.has('assets')) columns.push(collapsedPanels.has('assets') ? '40px' : '270px');
  const mainColumnNeeded = !detachedPanels.has('workspace') || !detachedPanels.has('sequence');
  if (mainColumnNeeded) columns.push('minmax(0, 1fr)');
  if (!detachedPanels.has('inspector')) columns.push(collapsedPanels.has('inspector') ? '40px' : '284px');
  document.body.style.setProperty('--workspace-grid-columns', columns.join(' ') || 'minmax(0, 1fr)');
}

function setPanelDetached(panel, detached) {
  if (!panel || panelMode) return;
  if (detached) {
    detachedPanels.add(panel);
    collapsedPanels.delete(panel);
  } else {
    detachedPanels.delete(panel);
  }
  updateWorkspacePanelLayout();
}

function setPanelCollapsed(panel, collapsed) {
  if (!['assets', 'inspector'].includes(panel) || panelMode || detachedPanels.has(panel)) return;
  if (collapsed) collapsedPanels.add(panel);
  else collapsedPanels.delete(panel);
  updateWorkspacePanelLayout();
}

function updateTimelineScale(value) {
  timelineScale = Math.max(56, Math.min(180, Number(value) || 78));
  document.body.style.setProperty('--timeline-frame-size', `${timelineScale}px`);
  document.body.style.setProperty('--timeline-thumb-size', `${Math.max(36, Math.round(timelineScale * 0.67))}px`);
  const input = $('#timelineSize');
  if (input && Number(input.value) !== timelineScale) input.value = String(timelineScale);
}

function historyDocument() {
  return JSON.stringify({ fps, sequenceVariant, sequenceAnimation, canvasWidth, canvasHeight, loop: Boolean($('#loopToggle')?.classList.contains('active')), frames });
}

function updateCanvasResolution(width, height, persist = true) {
  canvasWidth = Math.max(1, Math.min(8192, Number(width) || 1920));
  canvasHeight = Math.max(1, Math.min(8192, Number(height) || 1080));
  $('#canvasWidth').value = canvasWidth;
  $('#canvasHeight').value = canvasHeight;
  const preset = $('#canvasPreset');
  if (preset) {
    const presetValue = `${canvasWidth}x${canvasHeight}`;
    preset.value = Array.from(preset.options).some((option) => option.value === presetValue) ? presetValue : 'custom';
  }
  if (exportFollowsCanvas || !exportResolutionExplicit) updateExportResolution(canvasWidth, canvasHeight, true);
  updateCanvasDisplaySize();
  if (frames.length) {
    renderTimeline({ refreshThumbnails: true });
    if (displayMode === 'sequence' && selected >= 0 && frames[selected]) {
      renderFrameIntoElement(previewOverlay, frames[selected], sequenceVariant, canvasWidth, canvasHeight);
      updateInspector();
      updateOnionSkin();
      applySequenceAnimationPreview(previewPlaying ? previewMotionElapsed : previewElapsed);
    }
  }
  if (persist) markProjectDirty();
}

function updateExportResolution(width, height, followCanvas = false) {
  exportWidth = Math.max(1, Math.min(8192, Number(width) || canvasWidth));
  exportHeight = Math.max(1, Math.min(8192, Number(height) || canvasHeight));
  const widthInput = $('#exportWidth');
  const heightInput = $('#exportHeight');
  if (widthInput) widthInput.value = exportWidth;
  if (heightInput) heightInput.value = exportHeight;
  const preset = $('#exportPreset');
  if (preset) {
    const presetValue = `${exportWidth}x${exportHeight}`;
    preset.value = Array.from(preset.options).some((option) => option.value === presetValue) ? presetValue : 'custom';
  }
  exportFollowsCanvas = followCanvas;
  exportResolutionExplicit = !followCanvas;
}

function initializeHistory() {
  historySnapshot = historyDocument();
  undoStack = [];
  redoStack = [];
}

function recordHistoryChange() {
  if (historyApplying) return;
  const current = historyDocument();
  if (!historySnapshot) { historySnapshot = current; return; }
  if (current === historySnapshot) return;
  undoStack.push(historySnapshot);
  if (undoStack.length > 50) undoStack.shift();
  historySnapshot = current;
  redoStack = [];
}

function applyHistorySnapshot(serialized) {
  const state = JSON.parse(serialized);
  historyApplying = true;
  try {
    restoreRuntimeState(state);
    historySnapshot = historyDocument();
  } finally { historyApplying = false; }
}

function undoProjectChange() {
  if (!undoStack.length) return showToast('没有可撤销的操作');
  const current = historySnapshot || historyDocument();
  const previous = undoStack.pop();
  redoStack.push(current);
  applyHistorySnapshot(previous);
  markProjectDirty();
  showToast('已撤销');
}

function redoProjectChange() {
  if (!redoStack.length) return showToast('没有可重做的操作');
  const current = historySnapshot || historyDocument();
  const next = redoStack.pop();
  undoStack.push(current);
  applyHistorySnapshot(next);
  markProjectDirty();
  showToast('已重做');
}

function applyTheme(theme) {
  const nextTheme = theme === 'light' ? 'light' : 'dark';
  document.body.dataset.theme = nextTheme;
  const selector = $('#themeSelect');
  if (selector) selector.value = nextTheme;
  try { localStorage.setItem('framepick-theme', nextTheme); } catch { /* Browser privacy mode may block storage. */ }
}

function openSettings() {
  settingsModal.classList.add('open');
  settingsModal.setAttribute('aria-hidden', 'false');
  if (window.framepickDesktop?.logs?.getInfo) {
    window.framepickDesktop.logs.getInfo().then((info) => { $('#logLocationText').textContent = info?.path || '桌面日志已启用'; }).catch(() => {});
  }
  loadRuntimeDiagnostics();
}

function closeSettings() {
  settingsModal.classList.remove('open');
  settingsModal.setAttribute('aria-hidden', 'true');
}

function updateProjectIdentity(name, saved) {
  projectFileName = name || projectFileName;
  $('#projectName').textContent = projectFileName.replace(/\.fpproj$/i, '');
  $('#projectStatus').textContent = saved ? '· 已保存' : '· 未保存';
  $('.status-dot').classList.toggle('unsaved', !saved);
}

function rememberProjectLocation() {
  try {
    if (projectFilePath) localStorage.setItem('framepick-project-path', projectFilePath);
    if (projectFileName) localStorage.setItem('framepick-project-name', projectFileName);
  } catch { /* Local storage may be unavailable. */ }
}

function restoreRememberedProjectLocation() {
  try {
    projectFilePath = localStorage.getItem('framepick-project-path') || '';
    if (projectFilePath) projectFileName = localStorage.getItem('framepick-project-name') || projectFileName;
  } catch { /* Local storage may be unavailable. */ }
}

function isImageFile(file) {
  return file?.type?.startsWith('image/') || /\.(avif|bmp|gif|jpe?g|png|webp)$/i.test(file?.name || '');
}

function isVideoFile(file) {
  return file?.type?.startsWith('video/') || /\.(m4v|mov|mp4|mpe?g|og[gv]|webm|avi|wmv)$/i.test(file?.name || '');
}

function frameImageSource(frame, variant = sequenceVariant) {
  return FramePickRenderPipeline.imageSource(frame, variant);
}

function frameTransform(frame, variant = sequenceVariant) {
  return FramePickRenderPipeline.transform(frame, variant);
}

function setFrameTransform(frame, transform, variant = sequenceVariant) {
  if (!frame) return;
  if (variant === 'ai') {
    frame.variants ||= {};
    frame.variants.transform = { ...transform };
  } else frame.transform = { ...transform };
}

function sequenceTransformAt(timeMs = 0) {
  return FramePickSequenceAnimation.evaluate(sequenceAnimation, timeMs);
}

async function renderFrameToCanvas(frame, { variant = sequenceVariant, width = canvasWidth, height = canvasHeight, background = null, includeTransform = true } = {}) {
  return FramePickRenderPipeline.renderFrameToCanvas(frame, { variant, width, height, background, includeTransform });
}

async function renderFrameToCanvasDataUrl(frame, variant = sequenceVariant, mime = 'image/png', quality, targetWidth = canvasWidth, targetHeight = canvasHeight, resolutionScale = 1, viewport = null) {
  return FramePickRenderPipeline.renderFrameToCanvasDataUrl(frame, variant, mime, quality, targetWidth, targetHeight, resolutionScale, viewport);
}

function renderFrameIntoElement(element, frame, variant = sequenceVariant, width = canvasWidth, height = canvasHeight, resolutionScale = 1) {
  return FramePickRenderPipeline.renderFrameIntoElement(element, frame, variant, width, height, resolutionScale);
}

function refreshWorkspaceTransforms() {
  if (selected >= 0 && frames[selected]) renderFrameIntoElement(previewOverlay, frames[selected], sequenceVariant, canvasWidth, canvasHeight);
  updateOnionSkin();
}

function selectedFrameIndexes() {
  return selectedIndices.size ? [...selectedIndices] : (selected >= 0 ? [selected] : []);
}

let transformPreviewRaf = null;
let transformCommitTimer = null;
let transformInteractionDirty = false;
let transformInteractionIndexes = new Set();

function workspacePreviewScale() {
  const pixelRatio = Math.max(1, Number(window.devicePixelRatio) || 1);
  return Math.min(1, videoPanel.clientWidth * pixelRatio / Math.max(1, canvasWidth), videoPanel.clientHeight * pixelRatio / Math.max(1, canvasHeight));
}

function syncTransformInputs() {
  const transform = frameTransform(frames[selected]);
  if (!transform) return;
  $('#transformX').value = Math.round(transform.x * 100) / 100;
  $('#transformY').value = Math.round(transform.y * 100) / 100;
  $('#transformScale').value = Math.round(transform.scale * 100) / 100;
  $('#transformRotate').value = Math.round(transform.rotate * 100) / 100;
}

function queueTransformPreview() {
  if (transformPreviewRaf != null) return;
  transformPreviewRaf = requestAnimationFrame(() => {
    transformPreviewRaf = null;
    const frame = frames[selected];
    if (!frame) return;
    renderFrameIntoElement(previewOverlay, frame, sequenceVariant, canvasWidth, canvasHeight, workspacePreviewScale());
    syncTransformInputs();
  });
}

function finishTransformInteraction() {
  clearTimeout(transformCommitTimer);
  transformCommitTimer = null;
  if (!transformInteractionDirty) return;
  transformInteractionDirty = false;
  const indexes = [...transformInteractionIndexes];
  transformInteractionIndexes = new Set();
  updateInspector();
  refreshTimelineFrames(indexes, { thumbnails: true, summary: false });
  updateOnionSkin();
  markProjectDirty();
}

function changeSelectedTransforms(change, { commitAfterMs = 0 } = {}) {
  const indexes = selectedFrameIndexes();
  if (!indexes.length) return;
  indexes.forEach((index) => {
    const current = frameTransform(frames[index]);
    setFrameTransform(frames[index], change(current));
    transformInteractionIndexes.add(index);
  });
  transformInteractionDirty = true;
  queueTransformPreview();
  if (commitAfterMs > 0) {
    clearTimeout(transformCommitTimer);
    transformCommitTimer = setTimeout(finishTransformInteraction, commitAfterMs);
  } else {
    clearTimeout(transformCommitTimer);
    transformCommitTimer = null;
  }
}

function updateTransformModeReadout() {
  const labels = { move: 'W 位移', rotate: 'E 旋转', scale: 'R 缩放' };
  const readout = $('#transformModeReadout');
  if (readout) readout.textContent = labels[transformMode];
  const activeInputs = transformMode === 'move' ? ['transformX', 'transformY'] : transformMode === 'rotate' ? ['transformRotate'] : ['transformScale'];
  ['transformX', 'transformY', 'transformScale', 'transformRotate'].forEach((id) => {
    const input = $(`#${id}`);
    input?.classList.toggle('mode-active', activeInputs.includes(id));
    input?.closest('label')?.classList.toggle('mode-active', activeInputs.includes(id));
  });
}

function updateOnionSkin() {
  const enabled = $('#onionSkinToggle')?.classList.contains('active');
  const visible = enabled && displayMode === 'sequence' && videoPanel.classList.contains('sequence-mode') && frames.length && selected >= 0;
  const previous = visible ? frames[selected - 1] : null;
  const next = visible ? frames[selected + 1] : null;
  [
    [onionPrevOverlay, previous, selected - 1],
    [onionNextOverlay, next, selected + 1]
  ].forEach(([element, frame, index]) => {
    if (!element) return;
    if (frame) {
      renderFrameIntoElement(element, frame, sequenceVariant, canvasWidth, canvasHeight);
      element.classList.add('active');
    } else {
      element.removeAttribute('src');
      element.classList.remove('active');
    }
  });
}

function setSequenceDisplay(active) {
  videoPanel.classList.toggle('sequence-mode', active);
  if (active) {
    video.pause();
    sourceImage.classList.remove('loaded');
  } else {
    previewOverlay.style.transform = 'none';
    videoPanel.style.margin = '0px';
    const clip = clips[activeClip];
    if (clip?.kind === 'image' && sourceImage.src) sourceImage.classList.add('loaded');
    if (clip?.kind === 'video' && video.src) video.classList.add('loaded');
  }
  const button = $('#previewBtn');
  if (button) button.innerHTML = active ? '▣ <span>显示素材视频</span>' : '✦ <span>编辑序列</span>';
  updateCanvasDisplaySize();
  if (!active) updateOnionSkin();
}

function showToast(message) {
  const text = String(message);
  if (/失败|错误|无法|无效/.test(text)) console.error(`[操作失败] ${text}`);
  else console.info(`[操作] ${text}`);
  toast.textContent = text;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 1800);
}

function formatTime(seconds, precise = false) {
  if (!Number.isFinite(seconds)) return precise ? '00:00.00' : '00:00';
  const minutes = Math.floor(seconds / 60);
  const remaining = seconds - minutes * 60;
  return `${String(minutes).padStart(2, '0')}:${remaining.toFixed(precise ? 2 : 0).padStart(precise ? 5 : 2, '0')}`;
}

function updateInspector() {
  const frame = frames[selected];
  const panel = $('#selectedPreview');
  const imageElement = $('#selectedPreviewImage');
  const renderToken = ++inspectorPreviewToken;
  imageElement.style.transform = 'none';
  imageElement.style.transformOrigin = 'center center';
  if (!frame) {
    panel.classList.add('empty');
    imageElement.removeAttribute('src');
    $('#selectedFrameNumber').textContent = '--';
    $('#frameName').value = '未选择帧';
    return;
  }
  panel.classList.remove('empty');
  imageElement.removeAttribute('src');
  const inspectorScale = Math.min(1, 360 / Math.max(1, canvasWidth), 252 / Math.max(1, canvasHeight));
  renderFrameToCanvasDataUrl(frame, sequenceVariant, 'image/png', undefined, canvasWidth, canvasHeight, inspectorScale)
    .then((dataUrl) => {
      if (renderToken === inspectorPreviewToken && frames[selected] === frame) imageElement.src = dataUrl;
    })
    .catch((error) => console.warn('[帧设置预览] 渲染失败', error));
  $('#selectedFrameNumber').textContent = String(selected + 1).padStart(2, '0');
  $('#frameName').value = frame.name;
  $('#delayInput').value = frame.delay;
  const transform = frameTransform(frame);
  $('#transformX').value = transform.x;
  $('#transformY').value = transform.y;
  $('#transformScale').value = transform.scale;
  $('#transformRotate').value = transform.rotate;
  $('#skipFrame').checked = Boolean(frame.skip);
}

function selectedMotionKeyframe() {
  return sequenceAnimation.keyframes.find((keyframe) => keyframe.id === selectedMotionKeyframeId) || sequenceAnimation.keyframes[0];
}

function motionBezierFromInputs() {
  return ['motionBezierX1', 'motionBezierY1', 'motionBezierX2', 'motionBezierY2']
    .map((id) => Math.max(0, Math.min(1, Number($(`#${id}`).value) || 0)));
}

function updateMotionCurvePreview() {
  const [x1, y1, x2, y2] = motionBezierFromInputs();
  $('#motionCurvePath').setAttribute('d', `M0 64 C${x1 * 120} ${64 - y1 * 64} ${x2 * 120} ${64 - y2 * 64} 120 0`);
}

function syncMotionKeyframeInputs(keyframe) {
  if (!keyframe) return;
  $('#motionTime').value = keyframe.timeMs;
  $('#motionX').value = keyframe.x;
  $('#motionY').value = keyframe.y;
  $('#motionScale').value = keyframe.scale;
  $('#motionRotate').value = keyframe.rotate;
  $('#motionCurve').value = keyframe.curve;
  ['motionBezierX1', 'motionBezierY1', 'motionBezierX2', 'motionBezierY2'].forEach((id, index) => { $(`#${id}`).value = keyframe.bezier[index]; });
  updateMotionCurvePreview();
}

function availableMotionKeyframeTime(keyframeId, requestedTime, totalMs) {
  const maximum = Math.max(0, Math.round(totalMs));
  const requested = Math.max(0, Math.min(maximum, Math.round(requestedTime)));
  const occupied = new Set(sequenceAnimation.keyframes.filter((item) => item.id !== keyframeId).map((item) => item.timeMs));
  if (!occupied.has(requested)) return requested;
  for (let offset = 1; offset <= sequenceAnimation.keyframes.length; offset += 1) {
    if (requested + offset <= maximum && !occupied.has(requested + offset)) return requested + offset;
    if (requested - offset >= 0 && !occupied.has(requested - offset)) return requested - offset;
  }
  return sequenceAnimation.keyframes.find((item) => item.id === keyframeId)?.timeMs || 0;
}

function updateMotionKeyframeStrip() {
  const strip = $('#motionKeyframeStrip');
  if (!strip) return;
  const total = Math.max(1, sequenceTotalMs());
  strip.classList.toggle('is-disabled', !sequenceAnimation.enabled);
  strip.title = sequenceAnimation.enabled ? '拖动菱形关键帧可调整时间' : '请先启用整图节点动画';
  strip.innerHTML = '';
  sequenceAnimation.keyframes.forEach((keyframe) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `motion-keyframe-dot${keyframe.id === selectedMotionKeyframeId ? ' active' : ''}`;
    button.style.left = `${Math.max(0, Math.min(100, keyframe.timeMs / total * 100))}%`;
    button.title = `${keyframe.timeMs}ms · X ${keyframe.x} · Y ${keyframe.y} · ${keyframe.scale}% · ${keyframe.rotate}°`;
    button.setAttribute('aria-label', `关键帧 ${keyframe.timeMs} 毫秒，可左右拖动`);
    const selectKeyframe = () => {
      selectedMotionKeyframeId = keyframe.id;
      strip.querySelectorAll('.motion-keyframe-dot').forEach((dot) => dot.classList.toggle('active', dot === button));
      syncMotionKeyframeInputs(keyframe);
      setPreviewElapsed(Math.min(keyframe.timeMs, total), false);
    };
    button.onpointerdown = (event) => {
      if (!sequenceAnimation.enabled || event.button !== 0) return;
      event.preventDefault();
      selectKeyframe();
      const startedX = event.clientX;
      let moved = false;
      button.classList.add('dragging');
      const move = (moveEvent) => {
        if (Math.abs(moveEvent.clientX - startedX) > 2) moved = true;
        if (!moved) return;
        const bounds = strip.getBoundingClientRect();
        const ratio = Math.max(0, Math.min(1, (moveEvent.clientX - bounds.left) / Math.max(1, bounds.width)));
        keyframe.timeMs = availableMotionKeyframeTime(keyframe.id, ratio * total, total);
        button.style.left = `${keyframe.timeMs / total * 100}%`;
        button.title = `${keyframe.timeMs}ms · X ${keyframe.x} · Y ${keyframe.y} · ${keyframe.scale}% · ${keyframe.rotate}°`;
        $('#motionTime').value = keyframe.timeMs;
        setPreviewElapsed(keyframe.timeMs, false);
      };
      const finish = () => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', finish);
        window.removeEventListener('pointercancel', finish);
        button.classList.remove('dragging');
        sequenceAnimation = FramePickSequenceAnimation.create({ enabled: sequenceAnimation.enabled, keyframes: sequenceAnimation.keyframes });
        selectedMotionKeyframeId = keyframe.id;
        updateMotionEditor();
        if (moved) markProjectDirty();
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', finish);
      window.addEventListener('pointercancel', finish);
    };
    button.onclick = (event) => { if (event.detail === 0 && sequenceAnimation.enabled) selectKeyframe(); };
    strip.append(button);
  });
}

function updateMotionEditor() {
  const section = $('.sequence-motion-section');
  if (!section) return;
  const keyframe = selectedMotionKeyframe();
  selectedMotionKeyframeId = keyframe?.id || '';
  $('#motionEnabled').checked = sequenceAnimation.enabled;
  section.classList.toggle('is-disabled', !sequenceAnimation.enabled);
  previewOverlay.classList.toggle('node-motion-target', sequenceAnimation.enabled);
  $('#motionTime').max = String(sequenceTotalMs());
  syncMotionKeyframeInputs(keyframe);
  updateMotionKeyframeStrip();
}

function refreshSequenceAnimationViews() {
  updateMotionKeyframeStrip();
  updateInspector();
  if (displayMode === 'sequence' && selected >= 0) {
    const currentIndex = frameIndexAtElapsed(previewPlaying ? previewMotionElapsed : previewElapsed);
    renderFrameIntoElement(previewOverlay, frames[currentIndex] || frames[selected], sequenceVariant, canvasWidth, canvasHeight);
    applySequenceAnimationPreview(previewPlaying ? previewMotionElapsed : previewElapsed);
  }
}

function updateSelectionLabel() {
  const selectedCount = selectedIndices.size || (selected >= 0 ? 1 : 0);
  $('#sequenceSummary').textContent = `${String(frames.length).padStart(2, '0')} 帧${selectedCount ? ` · 已选 ${selectedCount} 帧` : ''}`;
  $('#aiSelectionText').textContent = selectedCount ? `将处理 ${selectedCount} 帧` : '未选择帧';
}

function selectFrame(index, event = {}) {
  finishTransformInteraction();
  if (event.shiftKey && selectionAnchor >= 0) {
    const start = Math.min(selectionAnchor, index);
    const end = Math.max(selectionAnchor, index);
    selectedIndices = new Set(Array.from({ length: end - start + 1 }, (_, offset) => start + offset));
  } else if (event.ctrlKey || event.metaKey) {
    if (selectedIndices.has(index)) selectedIndices.delete(index);
    else selectedIndices.add(index);
    selectionAnchor = index;
  } else {
    selectedIndices = new Set([index]);
    selectionAnchor = index;
  }
  selected = index;
  displayMode = 'sequence';
  renderSequenceInMainWindow();
  updateInspector();
  updateTimelineSelection();
  syncSourceTimelineToFrame(frames[index]);
  schedulePanelStateSync();
}

function timelineFrameElements() {
  return [...document.querySelectorAll('#timeline .timeline-frame')];
}

function timelineThumbnailScale() {
  return Math.min(1, 160 / Math.max(1, canvasWidth), 104 / Math.max(1, canvasHeight));
}

function renderTimelineThumbnail(image, frame) {
  renderFrameIntoElement(image, frame, sequenceVariant, canvasWidth, canvasHeight, timelineThumbnailScale());
}

function updateTimelineFrameElement(item, index, renderThumbnail = false) {
  const frame = frames[index];
  if (!item || !frame) return;
  item.dataset.frameId = String(frame.id);
  item.classList.toggle('selected', index === selected);
  item.classList.toggle('multi-selected', selectedIndices.has(index));
  item.classList.toggle('has-ai', Boolean(frame.variants?.backgroundRemoved));
  item.classList.toggle('skipped', Boolean(frame.skip));
  const image = item.querySelector('img');
  const number = item.querySelector('.frame-index');
  const delay = item.querySelector('.frame-delay');
  image.alt = frame.name;
  number.textContent = String(index + 1).padStart(2, '0');
  const delayMs = normalizeDelay(frame.delay);
  delay.textContent = frame.skip ? '已跳过' : `${delayMs}ms · ${effectiveFps(delayMs).toFixed(1)}fps`;
  delay.title = frame.skip
    ? '跳过帧：不参与播放、计时和导出'
    : `实际停留 ${delayMs}ms，等效 ${effectiveFps(delayMs).toFixed(1)} FPS`;
  if (renderThumbnail) renderTimelineThumbnail(image, frame);
}

function updateTimelineSummary() {
  const totalMs = sequenceTotalMs();
  $('#timelineTotal').textContent = `总时长 ${formatTime(totalMs / 1000, true)}`;
  sequenceScrubber.max = String(totalMs);
  sequenceScrubber.disabled = !activeFrameIndexes().length || totalMs <= 0;
  previewElapsed = Math.max(0, Math.min(totalMs, previewElapsed));
  sequenceScrubber.value = String(previewElapsed);
  $('#sequenceTimeLabel').textContent = formatTime(previewElapsed / 1000, true);
  $('#sequenceDurationLabel').textContent = formatTime(totalMs / 1000, true);
  updateSelectionLabel();
  updateMotionKeyframeStrip();
}

function updateTimelineSelection() {
  timelineFrameElements().forEach((item, index) => {
    item.classList.toggle('selected', index === selected);
    item.classList.toggle('multi-selected', selectedIndices.has(index));
  });
  updateSelectionLabel();
}

function refreshTimelineFrames(indexes, { thumbnails = false, summary = true } = {}) {
  const elements = timelineFrameElements();
  if (elements.length !== frames.length) return renderTimeline({ refreshThumbnails: thumbnails });
  [...new Set(indexes)].forEach((index) => updateTimelineFrameElement(elements[index], index, thumbnails));
  if (summary) updateTimelineSummary();
}

function renderTimeline({ refreshThumbnails = false } = {}) {
  const timeline = $('#timeline');
  const existingFrames = new Map(timelineFrameElements().map((item) => [item.dataset.frameId, item]));
  timeline.replaceChildren();
  const addDropZone = (position) => {
    const zone = document.createElement('div');
    zone.className = 'timeline-drop-zone';
    zone.dataset.position = position;
    zone.addEventListener('dragover', (event) => { event.preventDefault(); event.dataTransfer.dropEffect = 'move'; zone.classList.add('drag-over'); });
    zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
    zone.addEventListener('drop', (event) => {
      event.preventDefault();
      zone.classList.remove('drag-over');
      moveSelectedFrames(Number(zone.dataset.position));
    });
    timeline.append(zone);
  };
  addDropZone(0);
  frames.forEach((frame, index) => {
    let item = existingFrames.get(String(frame.id));
    const isNew = !item;
    if (!item) {
      item = document.createElement('div');
      item.className = 'timeline-frame';
      const image = document.createElement('img');
      const number = document.createElement('span');
      number.className = 'frame-index';
      const delay = document.createElement('span');
      delay.className = 'frame-delay';
      item.append(image, number, delay);
    }
    item.draggable = true;
    item.dataset.frameIndex = String(index);
    timeline.append(item);
    updateTimelineFrameElement(item, index, isNew || refreshThumbnails);
    item.onclick = (event) => selectFrame(Number(event.currentTarget.dataset.frameIndex), event);
    item.ondragstart = (event) => {
      const frameIndex = Number(event.currentTarget.dataset.frameIndex);
      if (!selectedIndices.has(frameIndex)) {
        selectedIndices = new Set([frameIndex]);
        selected = frameIndex;
        selectionAnchor = frameIndex;
        updateInspector();
        updateTimelineSelection();
      }
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('application/x-framepick-indices', JSON.stringify([...selectedIndices].sort((a, b) => a - b)));
      event.dataTransfer.setData('text/plain', String(frameIndex));
    };
    item.ondragover = (event) => event.preventDefault();
    addDropZone(index + 1);
  });
  updateTimelineSummary();
}

function moveSelectedFrames(targetPosition) {
  const movingIndexes = [...selectedIndices].sort((a, b) => a - b);
  if (!movingIndexes.length) return showToast('请先选择要移动的帧');
  const movingSet = new Set(movingIndexes);
  const movingFrames = frames.filter((_, index) => movingSet.has(index));
  const removedBeforeTarget = movingIndexes.filter((index) => index < targetPosition).length;
  const insertionIndex = Math.max(0, targetPosition - removedBeforeTarget);
  frames = frames.filter((_, index) => !movingSet.has(index));
  frames.splice(insertionIndex, 0, ...movingFrames);
  selected = insertionIndex;
  selectionAnchor = insertionIndex;
  selectedIndices = new Set(movingFrames.map((_, offset) => insertionIndex + offset));
  renderTimeline();
  updateInspector();
  markProjectDirty();
  showToast(movingFrames.length > 1 ? `已移动 ${movingFrames.length} 帧` : '序列顺序已更新');
}

function readImageClip(file) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const url = URL.createObjectURL(file);
    image.onload = () => {
      const scale = Math.min(1, 320 / image.naturalWidth);
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
      resolve({ file, url, kind: 'image', name: file.name, duration: 0, width: image.naturalWidth, height: image.naturalHeight, thumbnail: canvas.toDataURL('image/jpeg', 0.82) });
    };
    image.onerror = () => { URL.revokeObjectURL(url); reject(new Error(file.name)); };
    image.src = url;
  });
}

function readClip(file) {
  if (isImageFile(file)) return readImageClip(file);
  return new Promise((resolve, reject) => {
    const probe = document.createElement('video');
    const url = URL.createObjectURL(file);
    probe.preload = 'metadata';
    probe.muted = true;
    probe.onloadedmetadata = () => { probe.currentTime = Math.min(0.1, Math.max(0, probe.duration / 20)); };
    probe.onseeked = () => {
      const canvas = document.createElement('canvas');
      const scale = Math.min(1, 320 / probe.videoWidth);
      canvas.width = Math.max(1, Math.round(probe.videoWidth * scale));
      canvas.height = Math.max(1, Math.round(probe.videoHeight * scale));
      canvas.getContext('2d').drawImage(probe, 0, 0, canvas.width, canvas.height);
      resolve({ file, url, kind: 'video', name: file.name, duration: probe.duration, width: probe.videoWidth, height: probe.videoHeight, thumbnail: canvas.toDataURL('image/jpeg', 0.72) });
    };
    probe.onerror = () => { URL.revokeObjectURL(url); reject(new Error(file.name)); };
    probe.src = url;
  });
}

function renderClips() {
  const list = $('#clipList');
  list.innerHTML = '';
  if (!clips.length) list.innerHTML = '<div class="clip-empty">将视频或图片拖到这里<br><span>支持同时拖入多个文件</span></div>';
  clips.forEach((clip, index) => {
    const item = document.createElement('article');
    item.className = `clip-card${index === activeClip ? ' active' : ''}`;
    const typeLabel = clip.kind === 'image' ? '图片' : formatTime(clip.duration);
    item.innerHTML = `<div class="clip-thumb"><img alt=""><span class="play-mini">${clip.kind === 'image' ? '▧' : '▶'}</span><span class="clip-duration">${typeLabel}</span></div><div class="clip-info"><strong></strong><span>${clip.width} × ${clip.height}</span></div><button class="more-button" title="素材操作" aria-label="${clip.name} 素材操作" aria-expanded="false">⋮</button>`;
    item.querySelector('img').src = clip.thumbnail;
    item.querySelector('strong').textContent = clip.name;
    item.addEventListener('click', (event) => { if (!event.target.closest('.more-button')) loadClip(index); });
    item.querySelector('.more-button').addEventListener('click', (event) => { event.stopPropagation(); openClipMenu(index, event.currentTarget); });
    list.append(item);
  });
  $('#clipCount').textContent = String(clips.length).padStart(2, '0');
}

function closeClipMenu() {
  document.querySelector('.clip-menu')?.remove();
  document.querySelectorAll('.more-button[aria-expanded="true"]').forEach((button) => button.setAttribute('aria-expanded', 'false'));
}

function resetVideoStage() {
  video.pause();
  video.removeAttribute('src');
  video.load();
  video.classList.remove('loaded');
  placeholder.classList.remove('hidden');
  previewOverlay.classList.remove('active');
  sourceImage.removeAttribute('src');
  sourceImage.classList.remove('loaded');
  setSequenceDisplay(false);
  displayMode = 'video';
  videoPanel.style.aspectRatio = '16 / 9';
  updateCanvasDisplaySize();
  $('#currentClipName').textContent = '未选择素材';
  updateAutoExtractEstimate();
}

function removeClip(index) {
  const removed = clips[index];
  if (!removed) return;
  const wasActive = activeClip === index;
  clips.splice(index, 1);
  if (removed.url) URL.revokeObjectURL(removed.url);
  if (wasActive) {
    activeClip = -1;
    resetVideoStage();
    if (clips.length) loadClip(Math.min(index, clips.length - 1));
    else renderClips();
  } else {
    if (activeClip > index) activeClip -= 1;
    renderClips();
  }
  schedulePanelStateSync();
  showToast(`已删除素材 ${removed.name}`);
}

function clearClips() {
  clips.forEach((clip) => { if (clip.url) URL.revokeObjectURL(clip.url); });
  clips = [];
  activeClip = -1;
  resetVideoStage();
  renderClips();
  schedulePanelStateSync();
  showToast('素材库已清空');
}

function newProject() {
  if ((frames.length || clips.length) && !window.confirm('当前项目中的素材和序列帧将被清空，是否继续？')) return;
  stopPreview();
  clips.forEach((clip) => { if (clip.url) URL.revokeObjectURL(clip.url); });
  clips = [];
  activeClip = -1;
  frames = [];
  selected = -1;
  selectedIndices = new Set();
  selectionAnchor = -1;
  previewElapsed = 0;
  previewIndex = 0;
  sequenceVariant = 'original';
  sequenceAnimation = FramePickSequenceAnimation.create();
  selectedMotionKeyframeId = sequenceAnimation.keyframes[0].id;
  fps = 12;
  $('#fpsValue').textContent = fps;
  $('#modalFpsLabel').textContent = `${fps} FPS`;
  $('#sequenceVariantBtn').textContent = '当前：原始序列';
  $('#sequenceVariantBtn').classList.remove('is-ai');
  $('#sequenceVariantBtn').setAttribute('aria-pressed', 'false');
  exportFollowsCanvas = true;
  exportResolutionExplicit = false;
  updateCanvasResolution(1920, 1080, false);
  projectFileHandle = null;
  projectFilePath = '';
  projectFileName = '未命名项目.fpproj';
  exportDirectory = null;
  renderClips();
  resetVideoStage();
  renderTimeline();
  updateInspector();
  updateMotionEditor();
  initializeHistory();
  updateProjectIdentity(projectFileName, false);
  try {
    localStorage.removeItem('framepick-project-path');
    localStorage.removeItem('framepick-project-name');
  } catch { /* Local storage may be unavailable. */ }
  schedulePanelStateSync();
  showToast('已新建空白项目');
}

async function openClipLocation(index) {
  const clip = clips[index];
  const path = clip?.file?.path || clip?.file?.webkitRelativePath;
  if (!path || path.includes('/') && !/^[A-Za-z]:[\\/]/.test(path)) {
    return showToast('浏览器未提供本地路径，无法打开资产所在位置');
  }
  try {
    const result = await window.framepickDesktop.system.openLocation(path);
    if (!result?.ok) throw new Error(result?.error || '打开位置失败');
    showToast('已打开资产所在位置');
  } catch (error) {
    showToast(`无法打开资产位置：${error.message}`);
  }
}

function openClipMenu(index, anchor) {
  const existing = anchor.closest('.clip-card').querySelector('.clip-menu');
  closeClipMenu();
  if (existing) return;
  const menu = document.createElement('div');
  menu.className = 'clip-menu';
  menu.innerHTML = '<button data-action="load">载入此素材</button><button data-action="open-location">打开资产所在位置</button><button class="danger" data-action="remove">删除此素材</button><button class="danger" data-action="clear">清空素材库</button>';
  anchor.closest('.clip-card').append(menu);
  anchor.setAttribute('aria-expanded', 'true');
  menu.addEventListener('click', (event) => {
    event.stopPropagation();
    const action = event.target.dataset.action;
    if (action === 'load') loadClip(index);
    if (action === 'open-location') openClipLocation(index);
    if (action === 'remove') removeClip(index);
    if (action === 'clear') clearClips();
    closeClipMenu();
  });
}

document.addEventListener('click', (event) => { if (!event.target.closest('.clip-menu') && !event.target.closest('.more-button')) closeClipMenu(); });

async function importFiles(fileList) {
  const files = Array.from(fileList).filter((file) => isVideoFile(file) || isImageFile(file));
  if (!files.length) return showToast('请拖入视频或图片文件');
  showToast(`正在导入 ${files.length} 个素材…`);
  let imported = 0;
  for (const file of files) {
    try { clips.push(await readClip(file)); imported += 1; }
    catch { showToast(`${file.name} 无法读取`); }
  }
  renderClips();
  if (activeClip < 0 && clips.length) loadClip(0);
  schedulePanelStateSync();
  showToast(`已导入 ${imported} 个素材`);
}

function loadClip(index, options = {}) {
  const clip = clips[index];
  if (!clip) return;
  if (panelMode && !clip.url) {
    activeClip = index;
    $('#currentClipName').textContent = clip.name || '未选择素材';
    renderClips();
    schedulePanelStateSync();
    return;
  }
  const preserveSequence = Boolean(options.preserveSequence && selected >= 0 && frames[selected]);
  sourceSeekRequest += 1;
  activeClip = index;
  stopPreview();
  if (!preserveSequence) {
    displayMode = 'video';
    previewOverlay.classList.remove('active');
    setSequenceDisplay(false);
  }
  video.pause();
  video.removeAttribute('src');
  video.classList.remove('loaded');
  sourceImage.removeAttribute('src');
  sourceImage.classList.remove('loaded');
  if (clip.kind === 'image') {
    sourceImage.src = clip.url;
    sourceImage.classList.add('loaded');
    videoPanel.style.aspectRatio = `${clip.width} / ${clip.height}`;
    $('#durationLabel').textContent = '图片';
    $('#timeLabel').textContent = '静态素材';
    $('#resolutionReadout').textContent = `${clip.width} × ${clip.height}`;
  } else {
    video.src = clip.url;
    video.classList.add('loaded');
  }
  placeholder.classList.add('hidden');
  if (preserveSequence) renderSequenceInMainWindow();
  else {
    previewOverlay.classList.remove('active');
    setSequenceDisplay(false);
  }
  $('#currentClipName').textContent = clip.name;
  renderClips();
  updateAutoExtractEstimate();
  schedulePanelStateSync();
  if (!options.silent) showToast(`已载入 ${clip.name}`);
}

function updateSourceTimelineReadout(clip, position) {
  const totalFrames = Math.max(0, Math.round(Number(clip.duration) * SOURCE_VIDEO_FPS));
  $('#scrubber').max = String(totalFrames);
  $('#scrubber').value = String(Math.min(totalFrames, position.frameIndex));
  $('#currentFrame').textContent = String(position.frameIndex).padStart(4, '0');
  $('#currentFrame').nextElementSibling.textContent = `/ ${String(totalFrames).padStart(4, '0')}`;
  $('#timeLabel').textContent = formatTime(position.timeSeconds, true);
  $('#durationLabel').textContent = formatTime(clip.duration, true);
}

function syncSourceTimelineToFrame(frame) {
  if (!frame || autoExtracting) return;
  const source = FrameModel.source(frame.source);
  if (source.type !== 'video') return;
  const sourceName = source.fileName.toLocaleLowerCase();
  let clipIndex = clips[activeClip]?.kind === 'video' && clips[activeClip].name.toLocaleLowerCase() === sourceName
    ? activeClip
    : clips.findIndex((clip) => clip.kind === 'video' && clip.name.toLocaleLowerCase() === sourceName);
  if (clipIndex < 0) return;
  if (clipIndex !== activeClip || !video.src) loadClip(clipIndex, { preserveSequence: true, silent: true });
  const clip = clips[clipIndex];
  const position = FramePickVideoSampling.sourcePosition(source, SOURCE_VIDEO_FPS);
  const request = ++sourceSeekRequest;
  updateSourceTimelineReadout(clip, position);
  const seek = () => {
    if (request !== sourceSeekRequest || activeClip !== clipIndex || clips[clipIndex] !== clip) return;
    video.pause();
    const duration = Number(video.duration);
    const targetTime = Number.isFinite(duration) ? Math.min(duration, position.timeSeconds) : position.timeSeconds;
    try { video.currentTime = Math.max(0, targetTime); }
    catch (error) { console.warn('无法定位序列帧对应的源视频位置', error); }
  };
  if (video.readyState >= 1) seek();
  else video.addEventListener('loadedmetadata', seek, { once: true });
}

function capturedFrameFromMedia({ clip, source, frameNumber, timeSeconds, sourceTimeMs, canvas }) {
  const frameCanvas = canvas || document.createElement('canvas');
  frameCanvas.width = source.naturalWidth || source.videoWidth;
  frameCanvas.height = source.naturalHeight || source.videoHeight;
  const context = frameCanvas.getContext('2d');
  context.clearRect(0, 0, frameCanvas.width, frameCanvas.height);
  context.drawImage(source, 0, 0, frameCanvas.width, frameCanvas.height);
  return FrameModel.create({
    id: crypto.randomUUID(),
    image: frameCanvas.toDataURL('image/png'),
    delay: Math.round(1000 / fps),
    time: timeSeconds,
    width: frameCanvas.width,
    height: frameCanvas.height,
    transform: { x: 0, y: 0, scale: 100, rotate: 0 },
    source: { type: clip.kind, fileName: clip.name || 'source', sourceTimeMs, sourceFrameIndex: frameNumber },
    name: `${(clip.name || 'video').replace(/\.[^.]+$/, '')}_${String(frameNumber).padStart(4, '0')}`
  });
}

function capture() {
  const clip = clips[activeClip];
  const isImage = clip?.kind === 'image';
  if (isImage && (!sourceImage.src || !sourceImage.naturalWidth)) return showToast('图片尚未载入');
  if (!isImage && (!video.src || video.readyState < 2 || !video.videoWidth)) return showToast('请先导入并载入视频');
  if (autoExtracting) return showToast('自动抽帧进行中');
  displayMode = 'video';
  previewOverlay.classList.remove('active');
  setSequenceDisplay(false);
  video.pause();
  const timeSeconds = isImage ? 0 : video.currentTime;
  const frameNumber = isImage ? 1 : Math.round(timeSeconds * SOURCE_VIDEO_FPS);
  frames.push(capturedFrameFromMedia({
    clip,
    source: isImage ? sourceImage : video,
    frameNumber,
    timeSeconds,
    sourceTimeMs: Math.round(timeSeconds * 1000)
  }));
  selected = frames.length - 1;
  selectedIndices = new Set([selected]);
  selectionAnchor = selected;
  renderTimeline();
  updateInspector();
  showToast(`已截取第 ${String(frames.length).padStart(2, '0')} 帧`);
  markProjectDirty();
}

function autoExtractPlan() {
  const clip = clips[activeClip];
  if (!clip || clip.kind !== 'video') return [];
  return FramePickVideoSampling.createPlan(clip.duration || video.duration, $('#autoExtractInterval').value, SOURCE_VIDEO_FPS);
}

function updateAutoExtractEstimate() {
  const status = $('#autoExtractStatus');
  if (!status || autoExtracting) return;
  const clip = clips[activeClip];
  if (!clip) return void (status.textContent = '请选择视频');
  if (clip.kind !== 'video') return void (status.textContent = '仅支持视频');
  status.textContent = `预计 ${autoExtractPlan().length} 帧`;
}

function setAutoExtractControls(running) {
  autoExtracting = running;
  const button = $('#autoExtractBtn');
  button.textContent = running ? '停止' : '抽取全片';
  button.classList.toggle('is-running', running);
  button.setAttribute('aria-pressed', String(running));
  $('#autoExtractInterval').disabled = running;
  ['#captureBtn', '#rewindBtn', '#playBtn', '#forwardBtn', '#scrubber'].forEach((selector) => {
    const control = $(selector);
    if (control) control.disabled = running;
  });
}

function seekVideoForCapture(timeSeconds) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const timeout = setTimeout(() => finish(reject, new Error('视频定位超时')), 15000);
    const cleanup = () => {
      clearTimeout(timeout);
      video.removeEventListener('seeked', onSeeked);
      video.removeEventListener('error', onError);
    };
    const finish = (callback, value) => {
      if (settled) return;
      settled = true;
      cleanup();
      callback(value);
    };
    const onSeeked = () => requestAnimationFrame(() => finish(resolve));
    const onError = () => finish(reject, new Error('视频帧读取失败'));
    video.addEventListener('seeked', onSeeked);
    video.addEventListener('error', onError);
    if (Math.abs(video.currentTime - timeSeconds) < 0.0005 && video.readyState >= 2) {
      requestAnimationFrame(() => finish(resolve));
      return;
    }
    try { video.currentTime = timeSeconds; }
    catch (error) { finish(reject, error); }
  });
}

async function extractVideoAtInterval() {
  if (autoExtracting) {
    autoExtractCancelled = true;
    $('#autoExtractStatus').textContent = '正在停止…';
    return;
  }
  const clip = clips[activeClip];
  if (!clip) return showToast('请先导入并载入视频');
  if (clip.kind !== 'video') return showToast('自动抽帧仅支持视频素材');
  if (!video.src || video.readyState < 2 || !video.videoWidth) return showToast('视频尚未载入完成');
  const interval = FramePickVideoSampling.normalizeIntervalFrames($('#autoExtractInterval').value);
  $('#autoExtractInterval').value = interval;
  const plan = FramePickVideoSampling.createPlan(video.duration || clip.duration, interval, SOURCE_VIDEO_FPS);
  if (!plan.length) return showToast('视频中没有可抽取的帧');
  if (plan.length > 500 && !window.confirm(`本次将从原视频抽取 ${plan.length} 帧，可能占用较多内存。是否继续？`)) return;

  stopPreview();
  displayMode = 'video';
  previewOverlay.classList.remove('active');
  setSequenceDisplay(false);
  video.pause();
  const clipIndex = activeClip;
  const originalTime = video.currentTime;
  const canvas = document.createElement('canvas');
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const extractedFrames = [];
  autoExtractCancelled = false;
  setAutoExtractControls(true);
  try {
    for (let index = 0; index < plan.length; index += 1) {
      if (autoExtractCancelled) break;
      if (activeClip !== clipIndex || clips[clipIndex] !== clip) throw new Error('抽取期间切换了视频素材');
      const sample = plan[index];
      $('#autoExtractStatus').textContent = `${index + 1} / ${plan.length}`;
      await seekVideoForCapture(sample.timeSeconds);
      if (autoExtractCancelled) break;
      extractedFrames.push(capturedFrameFromMedia({
        clip,
        source: video,
        frameNumber: sample.frameIndex,
        timeSeconds: sample.timeSeconds,
        sourceTimeMs: sample.sourceTimeMs,
        canvas
      }));
    }
    if (extractedFrames.length) {
      frames.push(...extractedFrames);
      selected = frames.length - 1;
      selectedIndices = new Set([selected]);
      selectionAnchor = selected;
      renderTimeline();
      updateInspector();
      renderSequenceInMainWindow();
      markProjectDirty();
    }
    const verb = autoExtractCancelled ? '已停止，保留' : '已抽取';
    $('#autoExtractStatus').textContent = `${verb} ${extractedFrames.length} 帧`;
    showToast(`${verb} ${extractedFrames.length} 帧，每隔 ${interval} 帧取一帧`);
  } catch (error) {
    $('#autoExtractStatus').textContent = '抽取失败';
    showToast(`自动抽帧失败：${error.message}`);
  } finally {
    if (activeClip === clipIndex && video.src) video.currentTime = Math.min(originalTime, video.duration || originalTime);
    setAutoExtractControls(false);
    autoExtractCancelled = false;
  }
}

function stopSequenceMotionClock() {
  if (previewMotionTimer != null) cancelAnimationFrame(previewMotionTimer);
  previewMotionTimer = null;
}

function startSequenceMotionClock() {
  stopSequenceMotionClock();
  const total = sequenceTotalMs();
  if (!previewPlaying || total <= 0) return;
  const loop = $('#loopToggle').classList.contains('active');
  const startedAt = performance.now();
  const baseElapsed = !loop && previewElapsed >= total ? 0 : previewElapsed;
  if (baseElapsed !== previewElapsed) {
    previewElapsed = 0;
    previewMotionElapsed = 0;
    previewIndex = -1;
    sequenceScrubber.value = '0';
    $('#sequenceTimeLabel').textContent = formatTime(0, true);
  }
  const tick = (timestamp) => {
    if (!previewPlaying) return;
    const rawElapsed = baseElapsed + timestamp - startedAt;
    previewElapsed = loop
      ? rawElapsed % total
      : Math.min(total, rawElapsed);
    previewMotionElapsed = previewElapsed;
    const frameIndex = frameIndexAtElapsed(previewElapsed);
    if (frameIndex !== previewIndex) renderPreviewFrame(frameIndex, { syncSelection: false });
    applySequenceAnimationPreview(previewElapsed);
    sequenceScrubber.value = String(previewElapsed);
    $('#sequenceTimeLabel').textContent = formatTime(previewElapsed / 1000, true);
    if (!loop && rawElapsed >= total) {
      previewPlaying = false;
      previewMotionTimer = null;
      $('#sequencePlayBtn').textContent = '▶';
      $('#sequencePlayBtn').classList.remove('is-playing');
      schedulePanelStateSync();
      return;
    }
    previewMotionTimer = requestAnimationFrame(tick);
  };
  previewMotionTimer = requestAnimationFrame(tick);
}

function stopPreview() {
  previewPlaying = false;
  stopSequenceMotionClock();
  previewOverlay.classList.remove('active');
  updateTimelinePlayhead(-1);
  updateOnionSkin();
  $('#sequencePlayBtn').classList.remove('is-playing');
  $('#sequencePlayBtn').textContent = '▶';
}

function activeFrameIndexes() { return FramePickTimeline.activeFrameIndexes(frames); }
function activeFrames() { return FramePickTimeline.activeFrames(frames); }
function sequenceTotalMs() { return FramePickTimeline.sequenceTotalMs(frames); }
function nextActiveFrameIndex(index, direction = 1) { return FramePickTimeline.nextActiveFrameIndex(frames, index, direction); }
function frameIndexAtElapsed(milliseconds) { return FramePickTimeline.frameIndexAtElapsed(frames, milliseconds); }
function normalizeDelay(value) { return FramePickTimeline.normalizeDelay(value); }
function effectiveFps(delayMs) { return 1000 / normalizeDelay(delayMs); }
function frameStartElapsed(frameIndex) {
  return activeFrameIndexes()
    .filter((index) => index < frameIndex)
    .reduce((sum, index) => sum + normalizeDelay(frames[index].delay), 0);
}

function applySequenceAnimationPreview(timeMs = previewElapsed) {
  const transform = sequenceTransformAt(timeMs);
  const scaleX = videoPanel.clientWidth / Math.max(1, canvasWidth);
  const scaleY = videoPanel.clientHeight / Math.max(1, canvasHeight);
  // The work area is a fixed viewport. Animation transforms the canvas content
  // only; never grow the surrounding layout to fit transformed bounds.
  videoPanel.style.margin = '0px';
  previewOverlay.style.transformOrigin = 'center center';
  previewOverlay.style.transform = `translate(${transform.x * scaleX}px, ${transform.y * scaleY}px) rotate(${transform.rotate}deg) scale(${transform.scale / 100})`;
}

function updateTimelinePlayhead(index) {
  document.querySelectorAll('#timeline .timeline-frame').forEach((item, itemIndex) => {
    item.classList.toggle('is-previewing', itemIndex === index);
  });
}

function renderPreviewFrame(index, { syncSelection = !previewPlaying } = {}) {
  const frame = frames[index];
  if (!frame) return;
  const enteringSequence = displayMode !== 'sequence' || !videoPanel.classList.contains('sequence-mode');
  previewIndex = index;
  displayMode = 'sequence';
  renderFrameIntoElement(previewOverlay, frame, sequenceVariant, canvasWidth, canvasHeight);
  previewOverlay.classList.add('active');
  if (enteringSequence) setSequenceDisplay(true);
  applySequenceAnimationPreview(previewElapsed);
  if (syncSelection) {
    selected = index;
    selectedIndices = new Set([index]);
    selectionAnchor = index;
    $('#selectedFrameNumber').textContent = String(index + 1).padStart(2, '0');
    updateInspector();
    updateTimelineSelection();
    updateOnionSkin();
  } else {
    updateTimelinePlayhead(index);
  }
}

function renderSequenceInMainWindow() {
  const frame = frames[selected];
  if (!frame) return;
  displayMode = 'sequence';
  video.pause();
  renderFrameIntoElement(previewOverlay, frame, sequenceVariant, canvasWidth, canvasHeight);
  previewOverlay.classList.add('active');
  setSequenceDisplay(true);
  updateCanvasDisplaySize();
  previewElapsed = frameStartElapsed(selected);
  applySequenceAnimationPreview(previewElapsed);
  updateOnionSkin();
}

function setPreviewElapsed(milliseconds, syncSelection = !previewPlaying) {
  const total = sequenceTotalMs();
  if (!activeFrameIndexes().length) {
    previewElapsed = 0;
    sequenceScrubber.value = '0';
    return;
  }
  previewElapsed = Math.max(0, Math.min(total, milliseconds));
  previewMotionElapsed = previewElapsed;
  const index = frameIndexAtElapsed(previewElapsed);
  renderPreviewFrame(index, { syncSelection });
  applySequenceAnimationPreview(previewElapsed);
  sequenceScrubber.value = previewElapsed;
  $('#sequenceTimeLabel').textContent = formatTime(previewElapsed / 1000, true);
  $('#sequenceDurationLabel').textContent = formatTime(total / 1000, true);
}

function startPreview() {
  if (!activeFrameIndexes().length) return showToast('请先截取至少一帧有效画面');
  video.pause();
  previewPlaying = true;
  previewOverlay.classList.add('active');
  setSequenceDisplay(true);
  $('#sequencePlayBtn').textContent = 'Ⅱ';
  $('#sequencePlayBtn').classList.add('is-playing');
  $('#modalFpsLabel').textContent = `${fps} FPS`;
  sequenceScrubber.max = sequenceTotalMs();
  setPreviewElapsed(previewElapsed >= sequenceTotalMs() ? 0 : previewElapsed);
  startSequenceMotionClock();
}

$('#importBtn').onclick = () => fileInput.click();
$('#placeholderImport').onclick = () => fileInput.click();
fileInput.onchange = (event) => { importFiles(event.target.files); fileInput.value = ''; };
['dragenter', 'dragover'].forEach((name) => sidebar.addEventListener(name, (event) => { event.preventDefault(); sidebar.classList.add('drag-over'); }));
['dragleave', 'drop'].forEach((name) => sidebar.addEventListener(name, (event) => { event.preventDefault(); sidebar.classList.remove('drag-over'); }));
sidebar.addEventListener('drop', (event) => importFiles(event.dataTransfer.files));

video.addEventListener('loadedmetadata', () => {
  if (displayMode === 'video') videoPanel.style.aspectRatio = `${video.videoWidth} / ${video.videoHeight}`;
  $('#durationLabel').textContent = formatTime(video.duration, true);
  $('#resolutionReadout').textContent = `${video.videoWidth} × ${video.videoHeight}`;
  $('#scrubber').max = Math.round(video.duration * SOURCE_VIDEO_FPS);
  $('#currentFrame').nextElementSibling.textContent = `/ ${String(Math.round(video.duration * SOURCE_VIDEO_FPS)).padStart(4, '0')}`;
  updateAutoExtractEstimate();
});
video.addEventListener('timeupdate', () => {
  $('#scrubber').value = Math.round(video.currentTime * SOURCE_VIDEO_FPS);
  $('#currentFrame').textContent = String(Math.round(video.currentTime * SOURCE_VIDEO_FPS)).padStart(4, '0');
  $('#timeLabel').textContent = formatTime(video.currentTime, true);
});
$('#scrubber').oninput = (event) => { if (video.src) { stopPreview(); displayMode = 'video'; previewOverlay.classList.remove('active'); setSequenceDisplay(false); video.currentTime = event.target.value / SOURCE_VIDEO_FPS; } };
$('#playBtn').onclick = () => { const clip = clips[activeClip]; if (!clip) return showToast('请先导入素材'); if (clip.kind === 'image') return showToast('图片是静态素材，无法播放'); stopPreview(); displayMode = 'video'; previewOverlay.classList.remove('active'); setSequenceDisplay(false); video.paused ? video.play() : video.pause(); };
video.onplay = () => { $('#playBtn').textContent = 'Ⅱ'; displayMode = 'video'; previewOverlay.classList.remove('active'); setSequenceDisplay(false); };
video.onpause = () => { $('#playBtn').textContent = '▶'; };
function step(direction) { const clip = clips[activeClip]; if (!clip) return showToast('请先导入素材'); if (clip.kind === 'image') return showToast('图片没有可逐帧浏览的时间轴'); stopPreview(); displayMode = 'video'; previewOverlay.classList.remove('active'); setSequenceDisplay(false); video.pause(); video.currentTime = Math.max(0, Math.min(video.duration, video.currentTime + direction / SOURCE_VIDEO_FPS)); }
$('#rewindBtn').onclick = () => step(-1);
$('#forwardBtn').onclick = () => step(1);
$('#captureBtn').onclick = capture;
$('#autoExtractInterval').oninput = updateAutoExtractEstimate;
$('#autoExtractInterval').onchange = () => {
  $('#autoExtractInterval').value = FramePickVideoSampling.normalizeIntervalFrames($('#autoExtractInterval').value);
  updateAutoExtractEstimate();
};
$('#autoExtractInterval').onkeydown = (event) => { if (event.key === 'Enter') extractVideoAtInterval(); };
$('#autoExtractBtn').onclick = extractVideoAtInterval;
$('.video-panel').addEventListener('click', (event) => { if (displayMode !== 'sequence' && !event.target.closest('.capture-fab') && !event.target.closest('.video-placeholder') && !previewPlaying) capture(); });
let transformDrag = null;
previewOverlay.addEventListener('pointerdown', (event) => {
  if (displayMode !== 'sequence' || !frames.length) return;
  finishTransformInteraction();
  event.preventDefault();
  previewOverlay.setPointerCapture(event.pointerId);
  transformDrag = { pointerId: event.pointerId, x: event.clientX, y: event.clientY };
});
previewOverlay.addEventListener('pointermove', (event) => {
  if (!transformDrag || transformDrag.pointerId !== event.pointerId) return;
  const dx = event.clientX - transformDrag.x;
  const dy = event.clientY - transformDrag.y;
  transformDrag.x = event.clientX;
  transformDrag.y = event.clientY;
  if (transformMode === 'rotate') {
    changeSelectedTransforms((transform) => ({ ...transform, rotate: transform.rotate + dx * 0.6 }));
  } else if (transformMode === 'scale') {
    changeSelectedTransforms((transform) => ({ ...transform, scale: Math.max(1, Math.min(1000, transform.scale - dy * 0.6)) }));
  } else {
    const displayFactor = Math.max(0.1, (workspaceScale || 55) / 55);
    changeSelectedTransforms((transform) => ({ ...transform, x: transform.x + dx / displayFactor, y: transform.y + dy / displayFactor }));
  }
});
previewOverlay.addEventListener('pointerup', () => { transformDrag = null; finishTransformInteraction(); });
previewOverlay.addEventListener('pointercancel', () => { transformDrag = null; finishTransformInteraction(); });
previewOverlay.addEventListener('wheel', (event) => {
  if (displayMode !== 'sequence' || !frames.length) return;
  if (event.ctrlKey) return;
  event.preventDefault();
  const amount = event.deltaY > 0 ? -5 : 5;
  if (transformMode === 'rotate') changeSelectedTransforms((transform) => ({ ...transform, rotate: transform.rotate + amount }), { commitAfterMs: 140 });
  else if (transformMode === 'scale') changeSelectedTransforms((transform) => ({ ...transform, scale: Math.max(1, transform.scale + amount) }), { commitAfterMs: 140 });
}, { passive: false });
function applyPreviewFps(nextFps) {
  fps = Math.max(1, Math.min(60, Math.round(Number(nextFps) || 12)));
  const delayMs = Math.round(1000 / fps);
  let applied = 0;
  frames.forEach((frame) => {
    if (frame.skip) return;
    frame.delay = delayMs;
    applied += 1;
  });
  $('#fpsValue').textContent = fps;
  $('#modalFpsLabel').textContent = `${fps} FPS`;
  refreshTimelineFrames(frames.map((_, index) => index));
  if (previewPlaying) startSequenceMotionClock();
  markProjectDirty();
  if (applied) showToast(`已将 ${fps} FPS（每帧 ${delayMs}ms）应用到 ${applied} 帧`);
}
$('#fpsDown').onclick = () => applyPreviewFps(fps - 1);
$('#fpsUp').onclick = () => applyPreviewFps(fps + 1);
function updateCanvasDisplaySize() {
  if (displayMode === 'sequence') {
    videoPanel.style.width = `${Math.max(1, Math.round(canvasWidth * workspaceScale / 100))}px`;
    videoPanel.style.aspectRatio = `${canvasWidth} / ${canvasHeight}`;
  } else {
    videoPanel.style.width = `${workspaceScale}%`;
    videoPanel.style.aspectRatio = videoPanel.style.aspectRatio || '16 / 9';
  }
}

function updateWorkspaceScale(value) {
  workspaceScale = Math.max(10, Math.min(400, Number(value) || 55));
  const slider = $('#previewSize');
  const readout = $('#previewSizeValue');
  if (slider) slider.value = String(workspaceScale);
  if (readout) readout.textContent = `${workspaceScale}%`;
  videoPanel.style.setProperty('--display-scale', `${workspaceScale}%`);
  updateCanvasDisplaySize();
  if (displayMode === 'sequence') applySequenceAnimationPreview(previewPlaying ? previewMotionElapsed : previewElapsed);
}
$('#previewSize').oninput = (event) => updateWorkspaceScale(event.target.value);
$('#previewSizeMinus').onclick = () => updateWorkspaceScale(workspaceScale - 5);
$('#previewSize100').onclick = () => updateWorkspaceScale(100);
$('#previewSizePlus').onclick = () => updateWorkspaceScale(workspaceScale + 5);
videoPanel.addEventListener('wheel', (event) => {
  if (!event.ctrlKey) return;
  event.preventDefault();
  updateWorkspaceScale(workspaceScale + (event.deltaY < 0 ? 5 : -5));
}, { passive: false });
$('#onionSkinToggle').onclick = () => {
  const button = $('#onionSkinToggle');
  const active = !button.classList.contains('active');
  button.classList.toggle('active', active);
  button.setAttribute('aria-pressed', String(active));
  button.setAttribute('aria-label', active ? '洋葱皮已开启' : '洋葱皮已关闭');
  updateOnionSkin();
};
$('#previewBtn').onclick = () => {
  if (displayMode === 'sequence') {
    stopPreview();
    displayMode = 'video';
    previewOverlay.classList.remove('active');
    setSequenceDisplay(false);
    if (video.src) video.play().catch(() => {});
    return;
  }
  if (!frames.length) return showToast('请先截取至少一帧画面');
  stopPreview();
  selected = selected >= 0 ? selected : 0;
  renderSequenceInMainWindow();
};
$('#sequenceVariantBtn').onclick = () => {
  sequenceVariant = sequenceVariant === 'original' ? 'ai' : 'original';
  const button = $('#sequenceVariantBtn');
  button.textContent = sequenceVariant === 'ai' ? '当前：AI 抠图序列' : '当前：原始序列';
  button.classList.toggle('is-ai', sequenceVariant === 'ai');
  button.setAttribute('aria-pressed', String(sequenceVariant === 'ai'));
  refreshTimelineFrames(frames.map((_, index) => index), { thumbnails: true, summary: false });
  if (selected >= 0) {
    renderSequenceInMainWindow();
    updateInspector();
  }
  markProjectDirty();
  showToast(sequenceVariant === 'ai' ? '已切换到 AI 抠图序列' : '已切换到原始序列');
};
$('#aiSettingsBtn').onclick = () => { closeSettings(); openAiModal(false); };
$('#aiSaveBtn').onclick = async () => {
  try {
    await saveAiConfig();
    setAiSettingsStatus('设置已保存，可以继续测试连接或关闭窗口', 'success');
    showToast('AI 设置已保存');
  } catch (error) {
    setAiSettingsStatus(`设置保存失败：${error.message}`, 'error');
    showToast(error.message);
  }
};
$('#testConnectionBtn').onclick = testAiConnection;
$('#apiKeyToggle').onclick = () => {
  const input = $('#aiApiKey');
  const visible = input.type === 'text';
  input.type = visible ? 'password' : 'text';
  const button = $('#apiKeyToggle');
  button.setAttribute('aria-pressed', String(!visible));
  button.setAttribute('aria-label', visible ? '隐藏 API Key' : '显示 API Key');
  button.title = visible ? '隐藏 API Key' : '显示 API Key';
  button.textContent = visible ? '◉' : '◌';
};
$('#aiModalClose').onclick = closeAiModal;
$('#aiCancelBtn').onclick = closeAiModal;
$('#aiStartBtn').onclick = runBatchBackgroundRemoval;
aiModal.addEventListener('click', (event) => { if (event.target === aiModal) closeAiModal(); });
$('#settingsBtn').onclick = openSettings;
$('#settingsClose').onclick = closeSettings;
$('#settingsDone').onclick = closeSettings;
$('#themeSelect').onchange = (event) => applyTheme(event.target.value);
$('#selectPythonBtn').onclick = () => chooseRuntimePath('python_path', [{ name: 'Python', extensions: ['exe'] }]);
$('#selectFfmpegBtn').onclick = () => chooseRuntimePath('ffmpeg_path', [{ name: 'FFmpeg', extensions: ['exe'] }]);
$('#selectBirefnetBtn').onclick = () => chooseRuntimePath('birefnet_model_path', [{ name: 'BiRefNet ONNX', extensions: ['onnx'] }]);
$('#runtimeDiagnoseBtn').onclick = loadRuntimeDiagnostics;
$('#canvasPreset').onchange = (event) => {
  const value = event.target.value;
  if (value === 'custom') return;
  const [width, height] = value.split('x').map(Number);
  exportFollowsCanvas = true;
  exportResolutionExplicit = false;
  updateCanvasResolution(width, height);
};
['canvasWidth', 'canvasHeight'].forEach((id) => {
  $(`#${id}`).onchange = () => {
    $('#canvasPreset').value = 'custom';
    exportFollowsCanvas = true;
    exportResolutionExplicit = false;
    updateCanvasResolution($('#canvasWidth').value, $('#canvasHeight').value);
  };
});
$('#motionEnabled').onchange = (event) => {
  sequenceAnimation = FramePickSequenceAnimation.create({ ...sequenceAnimation, enabled: event.target.checked });
  updateMotionEditor();
  refreshSequenceAnimationViews();
  markProjectDirty();
};
$('#motionBreathingPreset').onclick = () => {
  sequenceAnimation = FramePickSequenceAnimation.breathing(sequenceTotalMs(), 3);
  selectedMotionKeyframeId = sequenceAnimation.keyframes[0].id;
  updateMotionEditor();
  refreshSequenceAnimationViews();
  markProjectDirty();
  showToast('已创建整图 100% → 103% → 100% 呼吸循环');
};
$('#motionReset').onclick = () => {
  sequenceAnimation = FramePickSequenceAnimation.create();
  selectedMotionKeyframeId = sequenceAnimation.keyframes[0].id;
  updateMotionEditor();
  refreshSequenceAnimationViews();
  markProjectDirty();
};
$('#motionUsePlayhead').onclick = () => {
  $('#motionTime').value = Math.round(previewPlaying ? previewMotionElapsed : previewElapsed);
};
$('#motionCurve').onchange = (event) => {
  const preset = FramePickSequenceAnimation.CURVES[event.target.value];
  if (preset) ['motionBezierX1', 'motionBezierY1', 'motionBezierX2', 'motionBezierY2'].forEach((id, index) => { $(`#${id}`).value = preset[index]; });
  updateMotionCurvePreview();
};
['motionBezierX1', 'motionBezierY1', 'motionBezierX2', 'motionBezierY2'].forEach((id) => {
  $(`#${id}`).oninput = () => { $('#motionCurve').value = 'custom'; updateMotionCurvePreview(); };
});
$('#motionSaveKeyframe').onclick = () => {
  const total = sequenceTotalMs();
  if (total <= 0) return showToast('请先创建序列帧');
  const timeMs = Math.max(0, Math.min(total, Math.round(Number($('#motionTime').value) || 0)));
  const existingAtTime = sequenceAnimation.keyframes.find((item) => item.timeMs === timeMs);
  const keyframe = {
    id: existingAtTime?.id || crypto.randomUUID(),
    timeMs,
    x: Number($('#motionX').value) || 0,
    y: Number($('#motionY').value) || 0,
    scale: Math.max(1, Number($('#motionScale').value) || 100),
    rotate: Number($('#motionRotate').value) || 0,
    curve: $('#motionCurve').value,
    bezier: motionBezierFromInputs()
  };
  const keyframes = sequenceAnimation.keyframes.filter((item) => item.id !== keyframe.id);
  keyframes.push(keyframe);
  sequenceAnimation = FramePickSequenceAnimation.create({ enabled: true, keyframes });
  selectedMotionKeyframeId = sequenceAnimation.keyframes.find((item) => item.timeMs === keyframe.timeMs)?.id || keyframe.id;
  updateMotionEditor();
  setPreviewElapsed(keyframe.timeMs, false);
  refreshSequenceAnimationViews();
  markProjectDirty();
};
$('#motionDeleteKeyframe').onclick = () => {
  const keyframes = sequenceAnimation.keyframes.filter((item) => item.id !== selectedMotionKeyframeId);
  sequenceAnimation = FramePickSequenceAnimation.create({ enabled: sequenceAnimation.enabled, keyframes });
  selectedMotionKeyframeId = sequenceAnimation.keyframes[0].id;
  updateMotionEditor();
  refreshSequenceAnimationViews();
  markProjectDirty();
};
$('#openLogFolderBtn').onclick = async () => {
  if (!window.framepickDesktop?.logs?.openFolder) return showToast('请在 FramePick 桌面 App 中使用日志功能');
  const error = await window.framepickDesktop.logs.openFolder();
  showToast(error ? `无法打开日志目录：${error}` : '已打开日志文件夹');
};
$('#clearLogBtn').onclick = async () => {
  if (!window.framepickDesktop?.logs?.clear) return showToast('请在 FramePick 桌面 App 中使用日志功能');
  await window.framepickDesktop.logs.clear();
  showToast('调试日志已清空');
};
settingsModal.addEventListener('click', (event) => { if (event.target === settingsModal) closeSettings(); });
$('#sequencePlayBtn').onclick = () => {
  if (!activeFrameIndexes().length) return showToast('请先截取至少一帧有效画面');
  if (previewPlaying) {
    previewElapsed = previewMotionElapsed;
    previewPlaying = false;
    stopSequenceMotionClock();
    $('#sequencePlayBtn').textContent = '▶';
    $('#sequencePlayBtn').classList.remove('is-playing');
    schedulePanelStateSync();
  } else {
    previewPlaying = true;
    $('#sequencePlayBtn').textContent = 'Ⅱ';
    $('#sequencePlayBtn').classList.add('is-playing');
    startSequenceMotionClock();
    schedulePanelStateSync();
  }
};
sequenceScrubber.oninput = (event) => {
  previewPlaying = false;
  stopSequenceMotionClock();
  $('#sequencePlayBtn').textContent = '▶';
  $('#sequencePlayBtn').classList.remove('is-playing');
  setPreviewElapsed(Number(event.target.value), false);
  schedulePanelStateSync();
};
sequenceScrubber.onpointerdown = () => {
  previewPlaying = false;
  stopSequenceMotionClock();
  $('#sequencePlayBtn').textContent = '▶';
  $('#sequencePlayBtn').classList.remove('is-playing');
};
sequenceScrubber.onchange = (event) => {
  setPreviewElapsed(Number(event.target.value), true);
  schedulePanelStateSync();
  console.info(`[序列进度条] position=${Number(event.target.value)}ms total=${sequenceTotalMs()}ms frame=${selected + 1}`);
};
$('#delayInput').onchange = (event) => { if (selected < 0) return; frames[selected].delay = normalizeDelay(event.target.value); refreshTimelineFrames([selected]); setPreviewElapsed(Math.min(previewElapsed, sequenceTotalMs())); if (previewPlaying) startSequenceMotionClock(); markProjectDirty(); };
$('#skipFrame').onchange = (event) => {
  if (selected < 0) return;
  const changedIndex = selected;
  frames[selected].skip = event.target.checked;
  if (frames[selected].skip) {
    const next = nextActiveFrameIndex(selected, 1);
    if (frames[next] && !frames[next].skip) {
      selected = next;
      selectedIndices = new Set([next]);
      selectionAnchor = next;
    }
  }
  refreshTimelineFrames([changedIndex, selected]);
  updateInspector();
  if (frames.length && selected >= 0) renderSequenceInMainWindow();
  markProjectDirty();
};
$('#delayUp').onclick = () => { $('#delayInput').value = Number($('#delayInput').value) + 10; $('#delayInput').dispatchEvent(new Event('change')); };
$('#delayDown').onclick = () => { $('#delayInput').value = Math.max(20, Number($('#delayInput').value) - 10); $('#delayInput').dispatchEvent(new Event('change')); };
document.querySelectorAll('.quick-delays button').forEach((button) => button.onclick = () => { $('#delayInput').value = button.dataset.delay; $('#delayInput').dispatchEvent(new Event('change')); document.querySelectorAll('.quick-delays button').forEach((item) => item.classList.remove('active')); button.classList.add('active'); });
$('#frameName').onchange = (event) => { if (selected >= 0) { frames[selected].name = event.target.value; markProjectDirty(); } };
function updateSelectedTransforms() {
  finishTransformInteraction();
  const indexes = selectedIndices.size ? [...selectedIndices] : (selected >= 0 ? [selected] : []);
  if (!indexes.length) return;
  const values = {
    x: Number($('#transformX').value) || 0,
    y: Number($('#transformY').value) || 0,
    scale: Math.max(1, Number($('#transformScale').value) || 100),
    rotate: Number($('#transformRotate').value) || 0
  };
  indexes.forEach((index) => { setFrameTransform(frames[index], values); });
  updateInspector();
  refreshTimelineFrames(indexes, { thumbnails: true, summary: false });
  if (selected >= 0) renderSequenceInMainWindow();
  markProjectDirty();
}
['transformX', 'transformY', 'transformScale', 'transformRotate'].forEach((id) => { $(`#${id}`).onchange = updateSelectedTransforms; });
$('#resetTransformBtn').onclick = () => {
  $('#transformX').value = 0;
  $('#transformY').value = 0;
  $('#transformScale').value = 100;
  $('#transformRotate').value = 0;
  updateSelectedTransforms();
};
$('#deleteBtn').onclick = () => {
  if (selected < 0 || !frames.length) return showToast('当前没有可删除的帧');
  const indexesToDelete = selectedIndices.size ? selectedIndices : new Set([selected]);
  const deletedCount = indexesToDelete.size;
  frames = frames.filter((_, index) => !indexesToDelete.has(index));
  selected = Math.min(selected, frames.length - 1);
  selectedIndices = selected >= 0 ? new Set([selected]) : new Set();
  selectionAnchor = selected;
  renderTimeline();
  updateInspector();
  if (selected >= 0 && displayMode === 'sequence') renderSequenceInMainWindow();
  else updateOnionSkin();
  markProjectDirty();
  showToast(`已删除 ${deletedCount} 帧`);
};
function stepSequenceFrame(direction) {
  if (!frames.length) return showToast('请先截取至少一帧画面');
  stopPreview();
  const current = selected >= 0 ? selected : 0;
  const next = nextActiveFrameIndex(current, direction);
  selectFrame(next);
}

function selectAllFrames() {
  if (!frames.length) return showToast('当前没有可选择的序列帧');
  selectedIndices = new Set(frames.map((_, index) => index));
  selected = selected >= 0 ? selected : 0;
  selectionAnchor = selected;
  displayMode = 'sequence';
  updateTimelineSelection();
  updateInspector();
  renderSequenceInMainWindow();
  schedulePanelStateSync();
}

document.addEventListener('keydown', (event) => {
  const target = event.target;
  const editingField = target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
  const key = event.key.toLowerCase();
  const sequenceTarget = panelMode === 'sequence' || displayMode === 'sequence' || Boolean(target?.closest?.('#timeline, .sequence-section'));
  if (!editingField && (event.ctrlKey || event.metaKey) && key === 'a' && sequenceTarget) {
    event.preventDefault();
    selectAllFrames();
    return;
  }
  if (!editingField && event.ctrlKey && key === 'z') {
    event.preventDefault();
    if (event.shiftKey) redoProjectChange(); else undoProjectChange();
    return;
  }
  if (!editingField && event.ctrlKey && key === 'y') {
    event.preventDefault();
    redoProjectChange();
    return;
  }
  if (!editingField && key === 'delete') {
    event.preventDefault();
    if (displayMode === 'sequence' && (selected >= 0 || selectedIndices.size)) $('#deleteBtn').click();
    else if (activeClip >= 0) removeClip(activeClip);
    return;
  }
  if (!editingField && (key === 'w' || key === 'e' || key === 'r')) {
    transformMode = { w: 'move', e: 'rotate', r: 'scale' }[key];
    updateTransformModeReadout();
    event.preventDefault();
    return;
  }
  if (event.key === 'Backspace' && !editingField) $('#deleteBtn').click();
  if (!editingField && event.key === 'ArrowLeft') {
    event.preventDefault();
    if (displayMode === 'sequence') stepSequenceFrame(-1);
    else step(-1);
  }
  if (!editingField && event.key === 'ArrowRight') {
    event.preventDefault();
    if (displayMode === 'sequence') stepSequenceFrame(1);
    else step(1);
  }
});
$('#loopToggle').onclick = () => {
  const button = $('#loopToggle');
  const active = button.classList.toggle('active');
  button.setAttribute('aria-pressed', String(active));
  button.title = active ? '循环播放已开启' : '循环播放已关闭';
  markProjectDirty();
};
function buildSequenceManifest(outputWidth = canvasWidth, outputHeight = canvasHeight, exportLayout = null) {
  return FramePickExport.buildSequenceManifest({
    frames,
    sequenceVariant,
    sequenceAnimation,
    fps,
    loop: $('#loopToggle').classList.contains('active'),
    width: outputWidth,
    height: outputHeight,
    sourceCanvas: exportLayout?.sourceCanvas,
    contentBounds: exportLayout?.contentBounds,
    frameTransform
  });
}

function dataUrlToBlob(dataUrl) {
  return FramePickExport.dataUrlToBlob(dataUrl);
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

async function loadAiConfig() {
  try {
    const config = await window.framepickDesktop.config.read();
    $('#aiApiKey').value = config.api_key || '';
    $('#aiApiUrl').value = config.api_url || 'https://api.openai.com/v1/images/edits';
    $('#aiModel').value = config.model || 'gpt-image-2';
    $('#aiEngine').value = config.engine || 'comfyui';
    if (config.prompt) $('#aiPrompt').value = config.prompt;
  } catch { /* Static-only mode keeps the fields manual. */ }
}

function setRuntimeText(id, value) {
  const element = $(`#${id}`);
  if (!element) return;
  element.textContent = value || '未检测';
  element.title = value || '';
}

async function loadRuntimeDiagnostics() {
  try {
    const [config, diagnostic] = await Promise.all([window.framepickDesktop.config.read(), window.framepickDesktop.runtime.diagnose()]);
    setRuntimeText('pythonRuntimeText', diagnostic.python.path || config.python_path || '未找到');
    setRuntimeText('ffmpegRuntimeText', diagnostic.ffmpeg.path || config.ffmpeg_path || '未找到');
    setRuntimeText('birefnetModelText', diagnostic.birefnet.modelPath || config.birefnet_model_path || '未找到');
    const summary = diagnostic.ready ? 'Python、FFmpeg、BiRefNet 已就绪' : '缺少一个或多个运行时，请选择路径';
    $('#runtimeDiagnosticText').textContent = summary;
    $('#runtimeDiagnosticText').title = JSON.stringify(diagnostic);
  } catch (error) {
    $('#runtimeDiagnosticText').textContent = `诊断失败：${error.message}`;
  }
}

async function chooseRuntimePath(field, filters) {
  try {
    const result = await window.framepickDesktop.system.selectFile({ filters });
    if (result?.canceled) return;
    await window.framepickDesktop.config.write({ [field]: result.filePath });
    await loadRuntimeDiagnostics();
    showToast('运行时路径已保存');
  } catch (error) { showToast(`运行时路径保存失败：${error.message}`); }
}

async function saveAiConfig() {
  if (!$('#aiSaveConfig').checked) return;
  await window.framepickDesktop.config.write({ api_key: $('#aiApiKey').value.trim(), api_url: $('#aiApiUrl').value.trim(), prompt: $('#aiPrompt').value.trim(), model: $('#aiModel').value.trim() || 'gpt-image-2', engine: $('#aiEngine').value });
}

async function testAiConnection() {
  const button = $('#testConnectionBtn');
  const progress = $('#aiProgressText');
  const apiKey = $('#aiApiKey').value.trim();
  const apiUrl = $('#aiApiUrl').value.trim();
  const engine = FramePickAi.validateEngine($('#aiEngine').value);
  if (engine === 'comfyui') {
    button.disabled = true;
    button.textContent = '测试中…';
    setAiSettingsStatus('正在检查本地 BiRefNet…', 'testing');
    try {
      const result = await window.framepickDesktop.ai.testConnection({ engine: 'comfyui' });
      if (!result?.ok) throw new Error('本地运行环境不可用');
      const message = '本地 BiRefNet 运行环境已就绪';
      setAiSettingsStatus(message, 'success');
      progress.textContent = '本地引擎已就绪';
      showToast(message);
    } catch (error) {
      setAiSettingsStatus(`检查失败：${error.message}`, 'error');
      progress.textContent = '本地引擎不可用';
    } finally { button.disabled = false; button.textContent = '测试连接'; }
    return;
  }
  if (!apiKey) {
    setAiSettingsStatus('连接失败：请先输入 OpenAI API Key', 'error');
    return showToast('请先输入 OpenAI API Key');
  }
  try {
    FramePickAi.validateApiUrl(apiUrl);
  } catch (error) {
    progress.textContent = '地址无效';
    setAiSettingsStatus(`连接失败：${error.message || 'API 请求地址无效'}`, 'error');
    return showToast(error.message || 'API 请求地址无效');
  }
  button.disabled = true;
  button.textContent = '测试中…';
  progress.textContent = '正在连接 AI 服务';
  setAiSettingsStatus('正在连接 AI 服务，请稍候…', 'testing');
  try {
    const result = await window.framepickDesktop.ai.testConnection({ engine: 'openai', api_key: apiKey, api_url: apiUrl });
    if (!result?.ok) throw new Error(result?.error || '连接失败');
    progress.textContent = '连接成功';
    const message = result.message || 'AI 服务连接正常';
    setAiSettingsStatus(`连接成功：${message}`, 'success');
    showToast(message);
  } catch (error) {
    progress.textContent = '连接失败';
    setAiSettingsStatus(`连接失败：${error.message}`, 'error');
    showToast(`AI 连接失败：${error.message}`);
  } finally {
    button.disabled = false;
    button.textContent = '测试连接';
  }
}

async function findSequenceRoot(directory) {
  try { await directory.getFileHandle('sequence.json'); return directory; }
  catch { throw new Error('所选文件夹中没有找到 FramePick sequence.json'); }
}

async function readDirectoryImage(root, relativePath) {
  const parts = relativePath.replace(/\\/g, '/').split('/').filter(Boolean);
  let directory = root;
  for (const part of parts.slice(0, -1)) directory = await directory.getDirectoryHandle(part);
  const handle = await directory.getFileHandle(parts.at(-1));
  return blobToDataUrl(await handle.getFile());
}

function sequenceFramePaths(entry, index) {
  const number = String(index + 1).padStart(4, '0');
  const legacyPath = `frames/frame_${number}.png`;
  if (!entry.files) {
    if (entry.file !== legacyPath) throw new Error(`第 ${index + 1} 帧文件路径无效`);
    return { legacy: legacyPath };
  }
  const original = `original/frame_${number}.png`;
  const transformed = `transformed/frame_${number}.png`;
  const ai = entry.files.ai;
  if (entry.file !== transformed || entry.files.original !== original || entry.files.transformed !== transformed || ai !== null && ai !== `ai/frame_${number}.png`) throw new Error(`第 ${index + 1} 帧文件路径无效`);
  return { original, ai, transformed };
}

async function importSequenceFolder() {
  if (!window.showDirectoryPicker) return showToast('当前浏览器不支持文件夹导入');
  try {
    const picked = await window.showDirectoryPicker({ mode: 'readwrite' });
    const root = await findSequenceRoot(picked);
    const manifestFile = await root.getFileHandle('sequence.json');
    const manifest = JSON.parse(await (await manifestFile.getFile()).text());
    const sourceCanvas = manifest.sourceCanvas || manifest.canvas;
    if (manifest.format !== 'framepick-sequence' || manifest.schemaVersion !== 1 || !manifest.canvas || !Number.isInteger(manifest.canvas.width) || !Number.isInteger(manifest.canvas.height) || manifest.canvas.width < 1 || manifest.canvas.width > 32767 || manifest.canvas.height < 1 || manifest.canvas.height > 32767 || !sourceCanvas || !Number.isInteger(sourceCanvas.width) || !Number.isInteger(sourceCanvas.height) || sourceCanvas.width < 1 || sourceCanvas.width > 8192 || sourceCanvas.height < 1 || sourceCanvas.height > 8192 || !Number.isFinite(Number(manifest.fps)) || Number(manifest.fps) < 1 || Number(manifest.fps) > 60 || !['original', 'ai'].includes(manifest.variant) || !Array.isArray(manifest.frames) || manifest.frameCount !== manifest.frames.length || manifest.frameCount < 1) throw new Error('序列格式不受支持');
    const restored = [];
    for (const [index, entry] of manifest.frames.entries()) {
      if (!entry || entry.index !== index || typeof entry.file !== 'string' || !Number.isFinite(Number(entry.delayMs)) || Number(entry.delayMs) < 20 || Number(entry.delayMs) > 5000 || typeof entry.skipped !== 'boolean' || entry.skipped || entry.source && (!['video', 'image'].includes(entry.source.type) || typeof entry.source.fileName !== 'string' || !entry.source.fileName || !Number.isFinite(Number(entry.source.sourceTimeMs)) || Number(entry.source.sourceTimeMs) < 0 || entry.source.sourceFrameIndex != null && (!Number.isInteger(Number(entry.source.sourceFrameIndex)) || Number(entry.source.sourceFrameIndex) < 0)) || entry.sourceTimeMs != null && (!Number.isFinite(Number(entry.sourceTimeMs)) || Number(entry.sourceTimeMs) < 0)) throw new Error(`第 ${index + 1} 帧格式不受支持`);
      const paths = sequenceFramePaths(entry, index);
      const legacyImage = paths.legacy ? await readDirectoryImage(root, paths.legacy) : null;
      const originalImage = paths.original ? await readDirectoryImage(root, paths.original) : (manifest.variant === 'original' ? legacyImage : '');
      const aiImage = paths.ai ? await readDirectoryImage(root, paths.ai) : (paths.legacy && manifest.variant === 'ai' ? legacyImage : null);
      const frame = FrameModel.create({
        id: crypto.randomUUID(),
        image: originalImage,
        aiImage,
        delayMs: Number(entry.delayMs),
        time: Number(entry.sourceTimeMs || entry.source?.sourceTimeMs || 0) / 1000,
        width: sourceCanvas.width,
        height: sourceCanvas.height,
        transform: assertTransform(entry.transforms?.original || entry.transform || FrameModel.DEFAULT_TRANSFORM, `第 ${index + 1} 帧原图`),
        aiTransform: assertTransform(entry.transforms?.ai || entry.transform || FrameModel.DEFAULT_TRANSFORM, `第 ${index + 1} 帧 AI`),
        source: entry.source || { type: 'video', fileName: 'imported-sequence', sourceTimeMs: Number(entry.sourceTimeMs || 0) },
        name: entry.name || `frame_${String(restored.length + 1).padStart(4, '0')}`,
        skip: false
      });
      restored.push(frame);
    }
    frames = restored;
    fps = Number(manifest.fps);
    sequenceVariant = manifest.variant;
    sequenceAnimation = FramePickSequenceAnimation.create(manifest.sequenceAnimation);
    selectedMotionKeyframeId = sequenceAnimation.keyframes[0]?.id || '';
    const loopEnabled = manifest.loop !== false;
    $('#loopToggle').classList.toggle('active', loopEnabled);
    $('#loopToggle').setAttribute('aria-pressed', String(loopEnabled));
    $('#loopToggle').title = loopEnabled ? '循环播放已开启' : '循环播放已关闭';
    updateCanvasResolution(sourceCanvas.width, sourceCanvas.height, false);
    $('#fpsValue').textContent = fps;
    $('#modalFpsLabel').textContent = `${fps} FPS`;
    $('#sequenceVariantBtn').textContent = sequenceVariant === 'ai' ? '当前：AI 抠图序列' : '当前：原始序列';
    $('#sequenceVariantBtn').classList.toggle('is-ai', sequenceVariant === 'ai');
    selected = frames.length ? 0 : -1;
    selectedIndices = selected >= 0 ? new Set([selected]) : new Set();
    selectionAnchor = selected;
    exportDirectory = picked;
    renderTimeline(); updateInspector(); updateMotionEditor();
    showToast(`已还原 ${frames.length} 帧动画序列`);
  } catch (error) {
    if (error?.name !== 'AbortError') showToast(`导入失败：${error.message}`);
  }
}

async function openSequenceFolder() {
  if (!exportDirectory) return showToast('请先导入或导出一个序列文件夹');
  const path = exportDirectory.path || exportDirectory.filePath || exportDirectory.__path;
  if (path) {
    try {
      const result = await window.framepickDesktop.system.openLocation(path);
      if (!result?.ok) throw new Error(result?.error || '打开位置失败');
      showToast('已打开序列文件夹');
      return;
    } catch (error) {
      return showToast(`无法打开序列文件夹：${error.message}`);
    }
  }
  if (!window.showDirectoryPicker) return showToast('当前浏览器无法打开系统文件夹，请使用系统文件管理器定位');
  try {
    const picked = await window.showDirectoryPicker({ mode: 'readwrite' });
    const root = await findSequenceRoot(picked);
    exportDirectory = root;
    showToast(`已定位序列文件夹：${root.name || '已选择目录'}（浏览器无法直接唤起系统文件管理器）`);
  } catch (error) {
    if (error?.name !== 'AbortError') showToast(`无法定位序列文件夹：${error.message}`);
  }
}

async function editImageWithOpenAI(apiKey, apiUrl, model, imageDataUrl, prompt) {
  const result = await window.framepickDesktop.ai.removeBackground({ engine: 'openai', api_key: apiKey, api_url: apiUrl, model, image: imageDataUrl, prompt });
  if (!result?.data) throw new Error('图片接口没有返回图像');
  return result.data;
}

async function editImageWithBiRefNet(imageDataUrl) {
  const result = await window.framepickDesktop.ai.removeBackground({ engine: 'comfyui', image: imageDataUrl });
  if (!result?.data) throw new Error('本地 BiRefNet 抠图失败');
  return result.data;
}

function openAiModal(requireSelection = false) {
  if (requireSelection) {
    if (!selectedIndices.size && selected < 0) return showToast('请先选择要抠图的序列帧');
    if (!selectedIndices.size && selected >= 0) selectedIndices = new Set([selected]);
  }
  aiModal.classList.add('open');
  aiModal.setAttribute('aria-hidden', 'false');
}

function closeAiModal() {
  aiModal.classList.remove('open');
  aiModal.setAttribute('aria-hidden', 'true');
}

function setAiSettingsStatus(message, state = 'idle') {
  const status = $('#aiSettingsStatus');
  if (!status) return;
  status.className = `connection-result ${state}`;
  status.querySelector('.connection-result-text').textContent = message;
}

async function runBatchBackgroundRemoval() {
  const apiKey = $('#aiApiKey').value.trim();
  const engine = FramePickAi.validateEngine($('#aiEngine').value);
  const apiUrl = $('#aiApiUrl').value.trim();
  const model = $('#aiModel').value.trim() || 'gpt-image-2';
  const indexes = [...selectedIndices].sort((a, b) => a - b);
  const frameCountBefore = frames.length;
  if (engine === 'openai' && !apiKey) return showToast('请先输入 OpenAI API Key');
  try { FramePickAi.validateApiUrl(apiUrl); }
  catch { return showToast('API 请求地址必须是 http 或 https 地址'); }
  if (!indexes.length) return showToast('请先选择序列帧');
  const button = $('#aiStartBtn');
  const progress = $('#aiProgressText');
  const batchProgress = $('#aiBatchProgress');
  button.disabled = true;
  try {
    try {
      await saveAiConfig();
    } catch (configError) {
      showToast(`配置未保存，将继续尝试 AI：${configError.message}`);
    }
    for (let position = 0; position < indexes.length; position += 1) {
      const index = indexes[position];
      progress.textContent = `正在处理 ${position + 1} / ${indexes.length}`;
      batchProgress.max = indexes.length;
      batchProgress.value = position;
      const sourceFrame = frames[index];
      if (!sourceFrame) continue;
      sourceFrame.variants ||= {};
      const processedImage = engine === 'comfyui'
        ? await editImageWithBiRefNet(frames[index].image)
        : await editImageWithOpenAI(apiKey, apiUrl, model, frames[index].image, $('#aiPrompt').value.trim());
      // AI output is a variant attached to the existing frame, never a new timeline frame.
      sourceFrame.variants.backgroundRemoved = processedImage;
      if (!sourceFrame.variants.transform) sourceFrame.variants.transform = { ...frameTransform(sourceFrame, 'original') };
      refreshTimelineFrames([index], { thumbnails: sequenceVariant === 'ai', summary: false });
      updateInspector();
      if (sequenceVariant === 'ai' && selected === index) renderSequenceInMainWindow();
      batchProgress.value = position + 1;
      markProjectDirty();
    }
    if (frames.length !== frameCountBefore) {
      frames.length = frameCountBefore;
      renderTimeline();
    }
    progress.textContent = '处理完成';
    showToast(`已完成 ${indexes.length} 帧背景移除`);
    setTimeout(closeAiModal, 700);
  } catch (error) {
    progress.textContent = '处理失败';
    showToast(`AI 抠图失败：${error.message}`);
  } finally {
    button.disabled = false;
  }
}

function downloadBlob(blob, name) {
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}

function markProjectDirty() {
  recordHistoryChange();
  updateProjectIdentity(projectFileName, false);
  schedulePanelStateSync();
}

function projectNameWithoutExtension() {
  return projectFileName.replace(/\.fpproj$/i, '') || '未命名项目';
}

function frameSourceDescriptor(frame) {
  return FrameModel.source(frame.source || {
    type: frame.sourceType || 'video',
    fileName: String(frame.source || 'source'),
    sourceTimeMs: Math.max(0, Math.round(Number(frame.time || 0) * 1000))
  });
}

function assetPathForFrame(index, variant) {
  return FramePickProjectIo.assetPathForFrame(index, variant);
}

function buildProjectDocument() {
  return FramePickProjectIo.buildDocument({ projectName: projectNameWithoutExtension(), canvasWidth, canvasHeight, fps, loop: Boolean($('#loopToggle')?.classList.contains('active')), sequenceVariant, sequenceAnimation, frames, assetPathForFrame });
}

function restoreRuntimeState(state) {
  frames = Array.isArray(state.frames) ? state.frames.map((frame) => FrameModel.create(frame)) : [];
  fps = Math.max(1, Math.min(60, Number(state.fps) || 12));
  sequenceAnimation = FramePickSequenceAnimation.create(state.sequenceAnimation);
  selectedMotionKeyframeId = sequenceAnimation.keyframes[0]?.id || '';
  exportFollowsCanvas = true;
  exportResolutionExplicit = false;
  updateCanvasResolution(state.canvasWidth || 1024, state.canvasHeight || 1024, false);
  sequenceVariant = state.sequenceVariant === 'ai' ? 'ai' : 'original';
  $('#loopToggle')?.classList.toggle('active', state.loop !== false);
  $('#loopToggle')?.setAttribute('aria-pressed', String(state.loop !== false));
  $('#fpsValue').textContent = fps;
  $('#modalFpsLabel').textContent = `${fps} FPS`;
  $('#sequenceVariantBtn').textContent = sequenceVariant === 'ai' ? '当前：AI 抠图序列' : '当前：原始序列';
  $('#sequenceVariantBtn').classList.toggle('is-ai', sequenceVariant === 'ai');
  selected = frames.length ? 0 : -1;
  selectedIndices = selected >= 0 ? new Set([selected]) : new Set();
  selectionAnchor = selected;
  stopPreview();
  renderTimeline();
  updateInspector();
  if (selected >= 0) renderSequenceInMainWindow();
  updateMotionEditor();
  if (!historyApplying) initializeHistory();
}

function assertTransform(transform, label) {
  return FramePickProjectIo.validateTransform(transform, label);
}

async function restoreProjectDocument(documentData, projectPath) {
  const validated = FramePickProjectIo.validateDocument(documentData);
  const projectName = validated.name;
  const restored = [];
  for (const [index, entry] of documentData.frames.entries()) {
    const originalPath = entry?.variants?.original?.imagePath;
    const aiPath = entry?.variants?.ai?.imagePath;
    const original = await window.framepickDesktop.project.readAsset({ projectPath, assetPath: entry.variants.original.imagePath });
    if (!original?.ok || !original.data) throw new Error(`第 ${index + 1} 帧原图资产缺失`);
    let aiImage = null;
    if (entry.variants.ai.available) {
      const ai = await window.framepickDesktop.project.readAsset({ projectPath, assetPath: entry.variants.ai.imagePath });
      if (!ai?.ok || !ai.data) throw new Error(`第 ${index + 1} 帧 AI 资产缺失`);
      aiImage = ai.data;
    }
    restored.push(FrameModel.fromProjectEntry(entry, { original: original.data, ai: aiImage }, documentData.canvas));
  }
  projectFileName = `${projectName}.fpproj`;
  restoreRuntimeState({ frames: restored, fps: Number(documentData.playback.fps), canvasWidth: documentData.canvas.width, canvasHeight: documentData.canvas.height, sequenceVariant: documentData.sequenceVariant, sequenceAnimation: validated.sequenceAnimation, loop: documentData.playback.loop });
}

async function buildProjectPayload() {
  const documentData = buildProjectDocument();
  const assets = {};
  frames.forEach((frame, index) => {
    assets[assetPathForFrame(index, 'original')] = frame.image;
    if (frame.variants?.backgroundRemoved) assets[assetPathForFrame(index, 'ai')] = frame.variants.backgroundRemoved;
  });
  const sequence = await buildSequenceSnapshot();
  return { data: JSON.stringify(documentData, null, 2), assets, sequence: { manifest: sequence.manifest, files: sequence.files } };
}

async function saveProjectAs() {
  if (window.framepickDesktop?.project?.saveAs) {
    if (projectSaving) return showToast('项目正在保存，请稍候');
    projectSaving = true;
    $('#saveProjectBtn').disabled = true;
    $('#saveProjectAsBtn').disabled = true;
    try {
      showToast('正在准备完整项目快照…');
      const result = await window.framepickDesktop.project.saveAs({ fileName: projectFileName, ...await buildProjectPayload() });
      if (result?.canceled) return;
      if (result?.error) return showToast(`项目保存失败：${result.error}`);
      projectFilePath = result.filePath;
      projectFileName = result.filePath.split(/[\\/]/).pop() || projectFileName;
      projectFileHandle = null;
      rememberProjectLocation();
      updateProjectIdentity(projectFileName, true);
      showToast('完整项目已保存（项目文件、原图、AI 图和最终序列）');
    } catch (error) {
      showToast(`项目保存失败：${error.message}`);
    } finally {
      projectSaving = false;
      $('#saveProjectBtn').disabled = false;
      $('#saveProjectAsBtn').disabled = false;
    }
    return;
  }
  showToast('项目保存仅支持 FramePick 桌面版');
}

async function saveProject() {
  if (window.framepickDesktop?.project?.write && projectFilePath) {
    if (projectSaving) return showToast('项目正在保存，请稍候');
    projectSaving = true;
    $('#saveProjectBtn').disabled = true;
    $('#saveProjectAsBtn').disabled = true;
    try {
      showToast('正在准备完整项目快照…');
      const result = await window.framepickDesktop.project.write({ filePath: projectFilePath, ...await buildProjectPayload() });
      if (!result?.ok) return showToast(`项目保存失败：${result?.error || '写入失败'}`);
      updateProjectIdentity(projectFileName, true);
      showToast('完整项目已保存（项目文件、原图、AI 图和最终序列）');
    } catch (error) {
      showToast(`项目保存失败：${error.message}`);
    } finally {
      projectSaving = false;
      $('#saveProjectBtn').disabled = false;
      $('#saveProjectAsBtn').disabled = false;
    }
    return;
  }
  return saveProjectAs();
}

async function loadProjectFile(file) {
  try {
    if (!file.name?.toLowerCase().endsWith('.fpproj')) throw new Error('项目格式不受支持');
    projectFileHandle = null;
    projectFilePath = window.framepickDesktop?.system?.getPathForFile?.(file) || file.path || '';
    if (!projectFilePath) throw new Error('无法读取项目资产路径');
    await restoreProjectDocument(JSON.parse(await file.text()), projectFilePath);
    projectFileName = file.name || '未命名项目.fpproj';
    rememberProjectLocation();
    updateProjectIdentity(projectFileName, true);
    showToast(`已打开项目：${projectFileName}`);
  } catch (error) {
    showToast(`项目打开失败：${error.message}`);
  }
}

async function openProject() {
  if (window.framepickDesktop?.project?.open) {
    const result = await window.framepickDesktop.project.open();
    if (result?.canceled) return;
    if (result?.error) return showToast(`项目打开失败：${result.error}`);
    try {
      await restoreProjectDocument(JSON.parse(result.data), result.filePath);
      projectFilePath = result.filePath;
      projectFileName = result.filePath.split(/[\\/]/).pop() || projectFileName;
      projectFileHandle = null;
      rememberProjectLocation();
      updateProjectIdentity(projectFileName, true);
      showToast(`已打开项目：${projectFileName}`);
    } catch (error) { showToast(`项目打开失败：${error.message}`); }
    return;
  }
  if (window.showOpenFilePicker) {
    try {
      const [handle] = await window.showOpenFilePicker({
        multiple: false,
        types: [{ description: 'FramePick 项目', accept: { 'application/json': ['.fpproj'] } }]
      });
      projectFileHandle = handle;
      await loadProjectFile(await handle.getFile());
      projectFileHandle = handle;
      return;
    } catch (error) {
      if (error?.name === 'AbortError') return;
    }
  }
  projectFileInput.click();
}

async function openProjectLocation() {
  restoreRememberedProjectLocation();
  if (!projectFilePath && projectFileHandle) {
    try {
      const file = await projectFileHandle.getFile();
      projectFilePath = window.framepickDesktop?.system?.getPathForFile?.(file) || file.path || '';
    } catch { /* The browser may not expose a filesystem path. */ }
  }
  if (!projectFilePath && window.framepickDesktop?.project?.open) {
    const result = await window.framepickDesktop.project.open();
    if (result?.canceled) return;
    if (result?.error) return showToast(`无法打开项目位置：${result.error}`);
    projectFilePath = result.filePath || '';
    projectFileName = projectFilePath.split(/[\\/]/).pop() || projectFileName;
    rememberProjectLocation();
  }
  if (projectFilePath && window.framepickDesktop?.system?.openLocation) {
    const result = await window.framepickDesktop.system.openLocation(projectFilePath);
    if (!result?.ok) showToast(`无法打开项目位置：${result?.error || '路径不可用'}`);
    return;
  }
  showToast('请先保存或打开项目文件');
}

projectFileInput.onchange = (event) => { const [file] = event.target.files; if (file) loadProjectFile(file); projectFileInput.value = ''; };

async function measureImageContent(source, cache) {
  if (cache.has(source)) return cache.get(source);
  const measurement = new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      const width = Math.max(1, image.naturalWidth || image.width || 1);
      const height = Math.max(1, image.naturalHeight || image.height || 1);
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext('2d', { willReadFrequently: true });
      context.clearRect(0, 0, width, height);
      context.drawImage(image, 0, 0, width, height);
      try {
        const pixels = context.getImageData(0, 0, width, height).data;
        const rowHasAlpha = (y) => {
          const start = y * width * 4 + 3;
          for (let offset = start; offset < start + width * 4; offset += 4) if (pixels[offset] !== 0) return true;
          return false;
        };
        const columnHasAlpha = (x, top, bottom) => {
          for (let y = top; y < bottom; y += 1) if (pixels[(y * width + x) * 4 + 3] !== 0) return true;
          return false;
        };
        let top = 0;
        while (top < height && !rowHasAlpha(top)) top += 1;
        if (top >= height) return resolve({ imageWidth: width, imageHeight: height, contentBounds: { empty: true } });
        let bottom = height;
        while (bottom > top && !rowHasAlpha(bottom - 1)) bottom -= 1;
        let left = 0;
        while (left < width && !columnHasAlpha(left, top, bottom)) left += 1;
        let right = width;
        while (right > left && !columnHasAlpha(right - 1, top, bottom)) right -= 1;
        resolve({ imageWidth: width, imageHeight: height, contentBounds: { left, top, right, bottom } });
      } catch {
        resolve({ imageWidth: width, imageHeight: height, contentBounds: { left: 0, top: 0, right: width, bottom: height } });
      }
    };
    image.onerror = () => reject(new Error('无法读取序列帧内容尺寸'));
    image.src = source;
  });
  cache.set(source, measurement);
  return measurement;
}

async function transformedSequenceLayout(entries) {
  const cache = new Map();
  const bounds = [];
  for (const { frame } of entries) {
    const source = frameImageSource(frame, sequenceVariant);
    const measurement = await measureImageContent(source, cache);
    bounds.push(FramePickExportLayout.transformedContentBounds({
      ...measurement,
      frameTransform: frameTransform(frame, sequenceVariant),
      canvasWidth,
      canvasHeight
    }));
  }
  const contentBounds = FramePickExportLayout.unionBounds(bounds);
  if (contentBounds.width > 32767 || contentBounds.height > 32767) throw new Error(`变换后内容尺寸 ${contentBounds.width} × ${contentBounds.height} 超过 PNG 导出上限 32767`);
  return {
    ...contentBounds,
    viewport: FramePickExportLayout.viewportForBounds(contentBounds, canvasWidth, canvasHeight),
    sourceCanvas: { width: canvasWidth, height: canvasHeight },
    contentBounds: { x: contentBounds.minX, y: contentBounds.minY, width: contentBounds.width, height: contentBounds.height }
  };
}

async function buildSequenceSnapshot(entries = exportableFrameEntries()) {
  let layout;
  if (entries.length) layout = await transformedSequenceLayout(entries);
  else {
    const emptyBounds = FramePickExportLayout.unionBounds([]);
    layout = {
      ...emptyBounds,
      viewport: FramePickExportLayout.viewportForBounds(emptyBounds, canvasWidth, canvasHeight),
      sourceCanvas: { width: canvasWidth, height: canvasHeight },
      contentBounds: { x: 0, y: 0, width: 1, height: 1 }
    };
  }
  const files = {};
  for (let index = 0; index < entries.length; index += 1) {
    const { frame } = entries[index];
    const fileName = `frame_${String(index + 1).padStart(4, '0')}.png`;
    files[`original/${fileName}`] = frame.image;
    if (frame.variants?.backgroundRemoved) files[`ai/${fileName}`] = frame.variants.backgroundRemoved;
    files[`transformed/${fileName}`] = await renderFrameToCanvasDataUrl(frame, sequenceVariant, 'image/png', undefined, canvasWidth, canvasHeight, 1, layout.viewport);
  }
  return {
    entries,
    files,
    layout,
    manifest: JSON.stringify(buildSequenceManifest(layout.width, layout.height, layout), null, 2)
  };
}

async function exportSequence() {
  const entries = exportableFrameEntries();
  const activeFrames = entries.map((entry) => entry.frame);
  if (!entries.length) {
    showToast('请先截取至少一帧有效画面');
    return { ok: false, error: '没有可导出的有效帧' };
  }
  let snapshot;
  try {
    snapshot = await buildSequenceSnapshot(entries);
  } catch (error) {
    showToast(`导出失败：${error.message}`);
    return { ok: false, error: error.message };
  }
  const { files: outputFiles, layout: exportLayout, manifest } = snapshot;
  if (window.framepickDesktop?.export?.sequence && window.framepickDesktop?.system?.selectDirectory) {
    const selectedDirectory = await window.framepickDesktop.system.selectDirectory();
    if (selectedDirectory?.canceled) return { canceled: true };
    const result = await window.framepickDesktop.export.sequence({ directoryPath: selectedDirectory.filePath, manifest, files: outputFiles });
    if (!result?.ok) {
      const error = result?.error || '写入失败';
      showToast(`序列导出失败：${error}`);
      return { ok: false, error };
    }
    showToast(`已导出 ${activeFrames.length} 帧，最终内容尺寸 ${exportLayout.width} × ${exportLayout.height}`);
    return { ok: true, frameCount: activeFrames.length, layout: exportLayout };
  }
  if (window.showDirectoryPicker) {
    try {
      const directory = exportDirectory || await window.showDirectoryPicker({ mode: 'readwrite' });
      exportDirectory = directory;
      const root = directory;
      const directories = {};
      for (const directoryName of ['original', 'ai', 'transformed']) {
        const imageDirectory = await root.getDirectoryHandle(directoryName, { create: true });
        directories[directoryName] = imageDirectory;
        for await (const [name, handle] of imageDirectory.entries()) {
          if (handle.kind === 'file' && /^frame_[0-9]{4}\.png$/i.test(name)) await imageDirectory.removeEntry(name);
        }
      }
      try {
        const legacyDirectory = await root.getDirectoryHandle('frames');
        for await (const [name, handle] of legacyDirectory.entries()) if (handle.kind === 'file' && /^frame_[0-9]{4}\.png$/i.test(name)) await legacyDirectory.removeEntry(name);
        let hasLegacyEntries = false;
        for await (const _entry of legacyDirectory.entries()) { hasLegacyEntries = true; break; }
        if (!hasLegacyEntries) await root.removeEntry('frames');
      } catch { /* A new export has no legacy frames directory. */ }
      const manifestHandle = await root.getFileHandle('sequence.json', { create: true });
      const manifestWriter = await manifestHandle.createWritable();
      await manifestWriter.write(manifest);
      await manifestWriter.close();
      for (const [relativePath, dataUrl] of Object.entries(outputFiles)) {
        const [directoryName, fileName] = relativePath.split('/');
        const handle = await directories[directoryName].getFileHandle(fileName, { create: true });
        const writer = await handle.createWritable();
        await writer.write(dataUrlToBlob(dataUrl));
        await writer.close();
      }
      showToast(`已导出 ${activeFrames.length} 帧，最终内容尺寸 ${exportLayout.width} × ${exportLayout.height}`);
      return { ok: true, frameCount: activeFrames.length, layout: exportLayout };
    } catch (error) {
      if (error?.name === 'AbortError') return { canceled: true };
      showToast('文件夹写入失败，改为下载文件');
    }
  }
  downloadBlob(new Blob([manifest], { type: 'application/json' }), 'sequence.json');
  Object.entries(outputFiles).forEach(([relativePath, dataUrl]) => downloadBlob(dataUrlToBlob(dataUrl), relativePath.replace('/', '_')));
  showToast('浏览器下载不支持子目录，已使用 original_ / ai_ / transformed_ 文件名前缀');
  return { ok: true, frameCount: activeFrames.length, layout: exportLayout };
}

function exportableFrameEntries() {
  let elapsed = 0;
  return frames.flatMap((frame) => {
    if (frame.skip) return [];
    const entry = { frame, timeMs: elapsed, delayMs: normalizeDelay(frame.delay) };
    elapsed += entry.delayMs;
    return [entry];
  });
}

function exportableFrames() { return exportableFrameEntries().map((entry) => entry.frame); }

function mediaAnimationSamples() {
  return exportableFrameEntries();
}

async function buildSpriteSheet(columns, rows, outputWidth = exportWidth, outputHeight = exportHeight) {
  const items = exportableFrameEntries().slice(0, columns * rows);
  if (!items.length) throw new Error('没有可导出的有效帧');
  const cellWidth = outputWidth;
  const cellHeight = outputHeight;
  const canvas = document.createElement('canvas');
  canvas.width = cellWidth * columns;
  canvas.height = cellHeight * rows;
  const context = canvas.getContext('2d');
  context.clearRect(0, 0, canvas.width, canvas.height);
  for (let index = 0; index < items.length; index += 1) {
    const image = new Image();
    image.src = await renderFrameToCanvasDataUrl(items[index].frame, sequenceVariant, 'image/png', undefined, outputWidth, outputHeight);
    await new Promise((resolve, reject) => { image.onload = resolve; image.onerror = reject; });
    context.drawImage(image, index % columns * cellWidth, Math.floor(index / columns) * cellHeight, cellWidth, cellHeight);
  }
  return canvas.toDataURL('image/png');
}

function pluginExportValue(pluginId, formatId) {
  return `plugin:${encodeURIComponent(pluginId)}:${encodeURIComponent(formatId)}`;
}

function renderPluginExportSettings(selectedValue) {
  const container = $('#pluginExportSettings');
  const entry = exportPluginFormats.get(selectedValue);
  container.replaceChildren();
  if (!entry || !entry.plugin.actions.length) {
    container.style.display = 'none';
    return;
  }
  container.style.display = 'block';
  for (const action of entry.plugin.actions) {
    const row = document.createElement('div');
    row.className = 'settings-row';
    const copy = document.createElement('div');
    const title = document.createElement('strong');
    const description = document.createElement('span');
    const button = document.createElement('button');
    title.textContent = action.label;
    description.textContent = action.description || '';
    button.type = 'button';
    button.className = 'connection-test-button';
    button.textContent = action.buttonLabel || action.label;
    button.onclick = async () => {
      const originalLabel = button.textContent;
      button.disabled = true;
      button.textContent = '处理中…';
      try {
        const payload = {};
        if (action.requiresDirectory) {
          const selectedDirectory = await window.framepickDesktop?.system?.selectDirectory?.();
          if (!selectedDirectory || selectedDirectory.canceled) return;
          payload.directoryPath = selectedDirectory.filePath;
        }
        const result = await window.framepickDesktop?.plugins?.action?.({
          pluginId: entry.plugin.id,
          actionId: action.id,
          payload
        });
        if (!result?.ok) throw new Error(result?.error || `${action.label}失败`);
        showToast(result.message || `${action.label}完成`);
      } catch (error) {
        showToast(`${action.label}失败：${error.message}`);
      } finally {
        button.disabled = false;
        button.textContent = originalLabel;
      }
    };
    copy.append(title, description);
    row.append(copy, button);
    container.append(row);
  }
}

async function initializeExportPlugins() {
  if (!window.framepickDesktop?.plugins?.list) return;
  try {
    const plugins = await window.framepickDesktop.plugins.list();
    const select = $('#mediaExportFormat');
    select.querySelectorAll('option[data-plugin-id]').forEach((option) => option.remove());
    exportPluginFormats.clear();
    for (const plugin of Array.isArray(plugins) ? plugins : []) {
      const normalizedPlugin = {
        ...plugin,
        exportFormats: Array.isArray(plugin.exportFormats) ? plugin.exportFormats : [],
        actions: Array.isArray(plugin.actions) ? plugin.actions : []
      };
      for (const format of normalizedPlugin.exportFormats) {
        const value = pluginExportValue(normalizedPlugin.id, format.id);
        const option = document.createElement('option');
        option.value = value;
        option.dataset.pluginId = normalizedPlugin.id;
        option.textContent = format.label;
        select.append(option);
        exportPluginFormats.set(value, { plugin: normalizedPlugin, format });
      }
    }
    select.dispatchEvent(new Event('change'));
  } catch (error) {
    console.error('加载导出插件失败', error);
  }
}

async function exportMedia() {
  const format = $('#mediaExportFormat').value;
  const pluginExport = exportPluginFormats.get(format);
  const status = $('#mediaExportStatus');
  const activeFrames = exportableFrames();
  if (!activeFrames.length) return showToast('没有可导出的有效帧');
  if (!exportResolutionExplicit) updateExportResolution(canvasWidth, canvasHeight, true);
  $('#mediaExportStart').disabled = true;
  status.textContent = '处理中…';
  try {
    if (pluginExport) {
      if (!window.framepickDesktop?.plugins?.export || !window.framepickDesktop?.system?.selectDirectory) throw new Error('插件导出仅支持 FramePick 桌面版');
      status.textContent = `正在生成${pluginExport.format.label}…`;
      const snapshot = await buildSequenceSnapshot();
      const selectedDirectory = await window.framepickDesktop.system.selectDirectory();
      if (selectedDirectory?.canceled) {
        status.textContent = '已取消';
        return;
      }
      const result = await window.framepickDesktop.plugins.export({
        pluginId: pluginExport.plugin.id,
        formatId: pluginExport.format.id,
        payload: {
          directoryPath: selectedDirectory.filePath,
          name: projectNameWithoutExtension(),
          manifest: snapshot.manifest,
          files: snapshot.files
        }
      });
      if (!result?.ok) throw new Error(result?.error || '插件导出失败');
      status.textContent = `已导出 ${result.frameCount} 帧`;
      showToast(result.message || `${pluginExport.format.label}已导出`);
      return;
    }
    if (format === 'png-sequence') {
      status.textContent = '正在渲染最终单帧序列…';
      const result = await exportSequence();
      if (result?.canceled) {
        status.textContent = '已取消';
        return;
      }
      if (!result?.ok) {
        status.textContent = '导出失败';
        return;
      }
      status.textContent = `已导出 ${result.frameCount} 帧`;
      return;
    }
    if (format === 'sprite') {
      const columns = Math.max(1, Math.min(64, Number($('#spriteColumns').value) || 1));
      const rows = Math.max(1, Math.min(64, Number($('#spriteRows').value) || 1));
      const sheet = await buildSpriteSheet(columns, rows, exportWidth, exportHeight);
      if (window.framepickDesktop?.export?.spritesheet) {
        const result = await window.framepickDesktop.export.spritesheet({ data: sheet, fileName: `sequence_${columns}x${rows}.png` });
        if (result?.canceled) return;
        if (!result?.ok) throw new Error(result?.error || '写入失败');
        status.textContent = '导出完成';
        showToast('已导出 Sprite Sheet');
        return;
      }
      downloadBlob(dataUrlToBlob(sheet), `sequence_${columns}x${rows}.png`);
      status.textContent = '导出完成';
      showToast(`已导出 ${columns} × ${rows} PNG 序列帧格子`);
      return;
    }
    const samples = mediaAnimationSamples();
    const renderedFrames = [];
    for (let index = 0; index < samples.length; index += 1) {
      const { frame, delayMs } = samples[index];
      status.textContent = `渲染动画帧 ${index + 1} / ${samples.length}`;
      renderedFrames.push({
        image: await renderFrameToCanvasDataUrl(frame, sequenceVariant, 'image/png', undefined, exportWidth, exportHeight),
        delayMs
      });
    }
    const result = await window.framepickDesktop.export.animation({ format, frames: renderedFrames });
    if (!result?.data) throw new Error('动画导出失败');
    downloadBlob(dataUrlToBlob(`data:${result.mime};base64,${result.data}`), `sequence.${result.extension}`);
    status.textContent = '导出完成';
    showToast(`已导出 ${format.toUpperCase()} 动画`);
  } catch (error) {
    status.textContent = '导出失败';
    showToast(`导出失败：${error.message}`);
  } finally { $('#mediaExportStart').disabled = false; }
}

$('#newProjectBtn').onclick = newProject;
const importExportButton = $('#importExportBtn');
const importExportMenu = $('#importExportMenu');
function closeImportExportMenu() {
  importExportMenu.classList.remove('open');
  importExportMenu.setAttribute('aria-hidden', 'true');
  importExportButton.setAttribute('aria-expanded', 'false');
}
importExportButton.onclick = (event) => {
  event.stopPropagation();
  const open = !importExportMenu.classList.contains('open');
  importExportMenu.classList.toggle('open', open);
  importExportMenu.setAttribute('aria-hidden', String(!open));
  importExportButton.setAttribute('aria-expanded', String(open));
};
importExportMenu.addEventListener('click', (event) => {
  if (event.target.closest('button')) closeImportExportMenu();
});
$('#menuImportMediaBtn').onclick = () => $('#importBtn').click();
document.addEventListener('click', (event) => {
  if (!event.target.closest('.import-export-menu-wrap')) closeImportExportMenu();
});
$('#openProjectBtn').onclick = openProject;
$('#openProjectLocationBtn').onclick = openProjectLocation;
$('#saveProjectBtn').onclick = saveProject;
$('#saveProjectAsBtn').onclick = saveProjectAs;
function openMediaExport() {
  if (exportFollowsCanvas) updateExportResolution(canvasWidth, canvasHeight, true);
  $('#mediaExportModal').classList.add('open');
  $('#mediaExportModal').setAttribute('aria-hidden', 'false');
}
$('#mediaExportBtn').onclick = openMediaExport;
$('#mediaExportClose').onclick = () => { $('#mediaExportModal').classList.remove('open'); $('#mediaExportModal').setAttribute('aria-hidden', 'true'); };
$('#mediaExportStart').onclick = exportMedia;
$('#mediaExportFormat').onchange = (event) => {
  const format = event.target.value;
  const isPngSequence = format === 'png-sequence';
  const pluginExport = exportPluginFormats.get(format);
  $('#spriteGridSettings').style.display = format === 'sprite' ? 'flex' : 'none';
  renderPluginExportSettings(format);
  $('#exportResolutionSettings').style.display = isPngSequence || pluginExport?.format.usesResolution === false ? 'none' : 'flex';
  $('#mediaExportFormatHint').textContent = pluginExport?.format.hint
    || (isPngSequence
      ? '逐帧导出最终效果，并附带可重新导入的序列数据'
      : format === 'sprite'
      ? '把最终序列逐帧排入一张透明 PNG 大图；整图曲线不烘焙'
      : '使用实际帧停留时长生成动画；整图曲线不烘焙');
};
$('#mediaExportFormat').dispatchEvent(new Event('change'));
initializeExportPlugins();
$('#exportPreset').onchange = (event) => {
  const value = event.target.value;
  if (value === 'custom') return;
  const [width, height] = value.split('x').map(Number);
  updateExportResolution(width, height, false);
};
['exportWidth', 'exportHeight'].forEach((id) => {
  $(`#${id}`).onchange = () => {
    updateExportResolution($('#exportWidth').value, $('#exportHeight').value, false);
  };
});
$('#importSequenceBtn').onclick = importSequenceFolder;

$('#assetsPopoutBtn').onclick = () => openPanelWindow('assets');
$('#workspacePopoutBtn').onclick = () => openPanelWindow('workspace');
$('#sequencePopoutBtn').onclick = () => openPanelWindow('sequence');
$('#inspectorPopoutBtn').onclick = () => openPanelWindow('inspector');
$('#assetsCollapseBtn').onclick = () => setPanelCollapsed('assets', true);
$('#assetsRestoreTab').onclick = () => setPanelCollapsed('assets', false);
$('#inspectorCollapseBtn').onclick = () => setPanelCollapsed('inspector', true);
$('#inspectorRestoreTab').onclick = () => setPanelCollapsed('inspector', false);
$('#timelineSize').oninput = (event) => updateTimelineScale(event.target.value);

if (window.framepickDesktop?.panels) {
  window.framepickDesktop.panels.onRequestState(() => {
    if (!panelSyncApplying) window.framepickDesktop.panels.sendState(panelStateSnapshot());
  });
  window.framepickDesktop.panels.onState((state) => applyPanelState(state));
  window.framepickDesktop.panels.onVisibility(({ panel, open }) => setPanelDetached(panel, open));
}

renderTimeline();
updateInspector();
updateMotionEditor();
loadAiConfig();
restoreRememberedProjectLocation();
updateCanvasResolution(canvasWidth, canvasHeight, false);
initializeHistory();
updateTransformModeReadout();
updateProjectIdentity(projectFileName, false);
let savedTheme = 'dark';
try { savedTheme = localStorage.getItem('framepick-theme') || 'dark'; } catch { /* Use the requested dark default. */ }
applyTheme(savedTheme);
updateTimelineScale(timelineScale);

if (panelMode) {
  window.framepickDesktop?.panels?.requestState?.();
} else {
  schedulePanelStateSync();
}
