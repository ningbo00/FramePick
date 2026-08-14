# FramePick 重构状态

更新时间：2026-08-15

## 已完成

- Electron 使用本地 `index.html`，不启动 FramePick HTTP 服务。
- Renderer 桌面能力通过 preload IPC 调用；项目、配置、日志、AI、序列、动画和 Sprite Sheet 均有明确入口。
- 项目格式固定为 `.fpproj`，严格使用 `framepick-project` / `schemaVersion: 1`。
- “保存/另存为”生成完整快照：`.fpproj`、`frames/` 项目资产以及 `sequence/` 下的 original、AI、transformed 和 manifest。
- 保存前在 Renderer 完成联合包围盒与最终帧渲染，Electron 校验资产集合后写盘，并最后更新 `.fpproj`。
- 序列格式固定为 `framepick-sequence` / `schemaVersion: 1`，跳过帧不导出且不计时。
- 帧模型集中在 `renderer/frame-model.js`，原图和 AI 变体保留独立变换。
- 主预览、Inspector、时间轴缩略图、洋葱皮和媒体导出共用 Canvas 渲染管线。
- BiRefNet 为 JSONL worker，FFmpeg 由 Electron 主进程管理。
- 运行时诊断检查 Python、BiRefNet 依赖、模型和 FFmpeg。
- electron-builder 产物已验证包含 `renderer/frame-model.js`，安装包名称为 FramePick。
- Electron 版本已固定为 `43.4.0`；目录版打包会通过 `plugins/**/*` 收集可选适配插件，核心不直接打包任何引擎专用模块。
- 已移除旧构建产物、`node_modules`、Python 缓存、日志和重复启动脚本；依赖可用 `npm ci` 重建。
- 已移除旧的 `comfy_url` 配置字段，本地 AI 只通过 BiRefNet worker 运行。
- Electron 已升级到 `43.4.0`，`npm audit`（含开发依赖）结果为 0 漏洞。
- 播放时序统一以每帧 `delayMs` 为权威；调整预览 FPS 会批量设置所有未跳过帧，单帧可在 Inspector 中覆写。
- 时间轴缩略图显示实际停留毫秒数和等效 FPS；循环播放在最后一帧计时结束时直接回到第一帧。
- 统一渲染管线按原始素材像素 1:1 绘制；画布尺寸变化只改变透明工作区或裁切范围，不自动缩放帧内容。
- 工作区画布视图按画布像素和视图缩放显示，超出窗口时可滚动；视图缩放不会改变导出分辨率。
- 序列播放只更新主 Canvas 和时间轴播放游标，不再逐帧重建缩略图、Inspector 或洋葱皮。
- 时间轴按帧 ID 复用 DOM；选中只更新样式，停留时间只更新标签，变换和 AI 仅重绘受影响缩略图。
- 时间轴缩略图按约 `160 × 104` 的显示栅格渲染，不再为 78px 小图创建完整 2K/4K Canvas。
- 位移、缩放和旋转拖动按 `requestAnimationFrame` 合并预览；松手后才更新 Inspector、缩略图和撤销历史。
- 画布视图缩放只改变 CSS 显示尺寸，不再逐次重绘主画布与洋葱皮，也不再叠加宽度过渡动画。
- 序列支持独立的整图节点 X/Y、统一缩放和旋转关键帧；关键帧位于播放进度条下方，可拖动时间位置，并支持预设或自定义 Cubic Bezier 曲线。
- 整图节点动画在预览中通过 CSS 作用于完整 Canvas，而不是烘焙成角色在画布内的变换；呼吸预设按序列总时长生成 `100% → 103% → 100%` 闭环。
- 整图预览 Canvas 不再被固定 `video-panel` 裁切；棋盘画布、边界和帧像素共同变换，并按缩放、旋转和位移后的包围盒动态增加四向滚动空间。
- 播放使用单一 `requestAnimationFrame` 时钟：源序列仅在帧索引变化时重绘，整图节点曲线每次刷新连续更新。
- `.fpproj` 和 sequence manifest 均保存可选 `sequenceAnimation`；缺少该字段的 schema v1 项目按禁用整体动画读取。
- PNG、Sprite Sheet、GIF 和 MP4 均只导出有效源帧，不烘焙整图节点动画，也不因曲线执行 60 FPS 补帧；曲线单独保存在项目与 sequence manifest。
- PNG 序列导出分为 `original/`、`ai/`、`transformed/` 三个子目录；manifest 保存三类路径和原图/AI 独立变换。
- 原独立“导出序列文件夹”入口已合并到统一“导出”面板；除 GIF、MP4 和 PNG 格子外，可选择最终 PNG 单帧序列。
- `transformed/` 使用所有有效帧 Alpha 内容经过单帧自身变换后的联合包围盒，不再固定使用项目画布分辨率；全部成品帧共享尺寸与裁切原点。
- sequence manifest 分开记录最终 `canvas`、原工作区 `sourceCanvas` 和 `contentBounds`，重新导入时恢复源画布坐标系。
- 重复导出会清理三类目录中的旧编号帧并移除空的旧 `frames/`；新旧 sequence schema v1 目录均可重新导入。
- 通用插件管理器从 `plugins/*/framepick.plugin.json` 动态发现导出格式和动作；主进程、preload、`index.html` 与 `app.js` 不再硬编码 Godot。
- 可选 Godot 4 插件提供 `.fpseq` 清单、最终 PNG、精确逐帧 `delayMs`、循环状态和未烘焙整图曲线。
- Godot 插件可把 `addons/framepick_importer` 安装到用户选择的 Godot 项目根目录；安装前严格检查 `project.godot`，不会自动启用插件。
- Godot 4 插件使用 `EditorImportPlugin` 生成 `FramePickSequence`：含时长感知 `SpriteFrames`、原始毫秒数组及 position X/Y、scale X/Y、rotation 五条 Bezier 轨道。
- Godot 插件导入 `.fpseq` 时同步生成可见的 `项目名_animations.tres` 原生 `AnimationLibrary`；`motion` 提供五条可视 Bezier 曲线，`controller` 额外提供按 `delayMs` 定时的离散切帧轨道。
- 原生 `controller` 动画写入 `FramePickSequenceController` 的动画通道，由 Controller 相对应用到 `FootPivot` 基础变换；标准 `AnimationPlayer` 可直接加载、查看和播放，脚底锚点不被覆盖。
- `FramePickPlayer2D` 在运行时同时播放逐帧序列和整图节点动画，节点动画不修改 PNG 像素。
- Godot 插件新增 `FramePickSequenceController`，可在不替换现有 `Sprite2D` 的情况下把换帧绑定到 `Sprite`、把整图曲线绑定到 `FootPivot`；位移相加、缩放相乘、旋转相加，保留脚底基准与游戏侧基础变换。
- 启动脚本在缺少依赖或 Electron 二进制时自动执行 `npm ci` 和 Electron 安装脚本。
- 启动脚本恢复依赖时使用 `npm ci --omit=peer`，不安装当前 NSIS/Portable 目标未使用的 Squirrel、签名 peer 工具和调试文件；Electron/Chromium 运行时保持完整。
- 未指定 Python 时会遍历候选解释器并优先选择已安装 Pillow、rembg 和 onnxruntime 的环境。

## 模块拆分

- `renderer/state.js`：初始工作区状态。
- `renderer/timeline.js`：有效帧、时长和时间映射。
- `renderer/render-pipeline.js`：Canvas 统一渲染。
- `renderer/project-io.js`：项目 schema、帧资产路径和校验。
- `renderer/ai.js`：AI 引擎和 URL 校验。
- `renderer/export.js`：序列 manifest 和数据 URL 导出辅助。
- `renderer/sequence-animation.js`：整体动画数据归一化、呼吸预设和 Cubic Bezier 求值。
- `electron/plugin-manager.js`：通用插件发现、导出分发和动作分发，不依赖具体引擎。
- `plugins/godot4/export.js`：Godot 插件的 `.fpseq` 清单、最终 PNG 资源包和旧帧清理。
- `plugins/godot4/install.js`：Godot 插件的项目根目录验证和 addon 安装。
- `plugins/godot4/framepick_importer/`：Godot 4 导入器、资源类型和播放节点。

## 端到端验收

- Electron 43.4.0 开发版、Portable 版和临时安装版均启动并加载页面。
- 项目写入黑盒测试确认 `.fpproj` 和外部 PNG 资产可写入，删除帧后的旧资产会清理。
- 旧项目格式被拒绝；AI 独立变换和跳过帧时长映射通过契约测试。
- 主进程 GIF、MP4、Sprite Sheet 写入和 BiRefNet JSONL worker 均通过实际测试。
- 临时静态 UI 回归完成：图片和视频批量导入、连续取帧、多选同步变换、跳过帧、删除、Ctrl+Z/Ctrl+Y 均已操作验证。
- Electron 开发版、Portable 版和临时安装版均使用 Electron 43.4.0 启动；验收后已删除所有构建产物和依赖目录。
- 本机 Godot 4.6.3 实际加载 FramePick 插件、导入 `.fpseq` 和 PNG，运行时成功读取 `FramePickSequence` 并绑定 `FramePickPlayer2D`。

## 已验证

- `node --check`：`app.js`、Electron 主进程、preload、路径和运行时模块。
- `python -m py_compile workers/birefnet_worker.py`。
- ComfyUI Python + BiRefNet JSONL worker 实际处理 PNG，输出 RGBA PNG。
- FFmpeg GIF 和奇数尺寸 MP4 导出；MP4 使用偶数尺寸 padding。
- FrameModel 项目条目往返转换。
- 开发版和打包版 Electron 启动并加载页面，无 Python HTTP 子进程。
- `npm test`：22 项通过，覆盖完整项目动画字段往返、插件发现与隔离、Godot 包写盘、旧帧清理、插件安装、序列 manifest 和 Canvas 渲染契约。
- `scripts/validate-godot-plugin.js`：Godot 4.6.3 真实导入，验证生成的原生 `.tres`、`motion/controller` 动画、Bezier 控制点换算、`83ms + 125ms` 原生切帧时间、播放器资源绑定，以及标准 `AnimationPlayer` 对 `Player/FootPivot/Sprite2D` 脚底锁定结构的实际驱动。
- Electron 四帧循环烟雾回归：跨循环边界持续播放，1.15 秒内主 Canvas 仅随源帧切换重绘 5 次，时间轴重建 0 次，页面异常 0 个。

## 后续回归重点

- 使用真实 `.fpproj` 完成保存、删除帧后重写、重新打开的完整往返测试。
- 测试旧项目扩展名、普通 JSON 和旧序列目录均被拒绝。
- 测试多选排序、快速切换缩略图、跳过帧播放和导出的变换一致性。
- 在缺少 Python、FFmpeg 或模型时确认设置界面的诊断提示。
