(function exposeFramePickState(global) {
  function create() {
    return {
      clips: [],
      activeClip: -1,
      frames: [],
      selected: -1,
      selectedIndices: new Set(),
      selectionAnchor: -1,
      fps: 12,
      projectFilePath: '',
      projectFileName: '未命名项目.fpproj',
      sequenceVariant: 'original',
      sequenceAnimation: FramePickSequenceAnimation.create(),
      canvasWidth: 1920,
      canvasHeight: 1080,
      exportWidth: 1920,
      exportHeight: 1080
    };
  }

  global.FramePickState = { create };
})(window);
