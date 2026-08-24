# FramePick 桌面版

桌面版直接加载本地页面，不启动 FramePick HTTP 服务。BiRefNet 作为独立 Python worker 由 Electron 按需管理，FFmpeg 由 Electron 直接启动。

## 环境要求

- Python 3.11 或更高版本，或在设置中指定便携 Python runtime
- Node.js 18 或更高版本
- FFmpeg（PATH 中可用，或在设置中指定）

## 开发运行

可以直接双击项目目录中的 `启动 FramePick.cmd`，也可以使用纯英文备用入口 `start-framepick.cmd`。

启动器发现 Electron 运行时不完整时会自动恢复依赖，并省略当前 NSIS/Portable 构建不使用的 Squirrel 与签名 peer 工具；项目级 `.npmrc` 让手动执行 `npm ci` 时保持相同的精简依赖布局。项目目录的大部分体积来自 Electron 内置 Chromium 运行时，而不是 FramePick 源码；不要手动删除 `node_modules/electron/dist` 中的运行文件。

也可以使用命令：

```powershell
npm install
npm start
```

### 同时编辑多个项目

FramePick 桌面版支持在同一个进程中打开多个项目窗口。点击顶部的“新窗口”会创建一个独立的空白项目窗口，然后在该窗口点击“打开项目”载入另一个 `.fpproj`。每个窗口都有自己的素材、序列帧、播放状态、撤销记录和保存路径；在某个窗口打开素材库、取帧工作区、序列帧或属性面板时，面板只属于该项目窗口，不会串到其他项目。

关闭某个项目窗口只会关闭它所属的独立面板，其他项目窗口继续工作。当前版本不自动阻止同一个 `.fpproj` 在多个窗口重复打开，也不会在关闭时自动合并未保存内容；需要在对应窗口分别保存。启动第二个 FramePick 程序时仍会复用已有进程，使用“新窗口”按钮即可继续打开更多项目。

### 选区擦除

进入“编辑序列”后，画布工具栏提供“框选”和“画笔”两种选区方式。框选可拖出矩形范围，画笔可按笔刷大小涂出不规则范围；完成选区后点击“擦除”，当前显示的原始或 AI 帧图像会在选区内变为透明。擦除会进入撤销历史，并随项目保存、序列导出和面板同步生效。

画布工具栏还提供“＋竖线”和“＋横线”辅助线按钮。启用后在画布上点击即可连续添加多条辅助线，拖动虚线可以调整位置，双击或右键可以删除单条；“辅助线/显示线”按钮可以整体隐藏或显示，“清空”会移除全部辅助线。辅助线只用于编辑对齐，不会进入导出图片。

### 在其他电脑上开发

仓库只提交 FramePick 源码和 `package-lock.json`，不提交 `node_modules`、Electron 缓存、个人配置、视频素材或模型文件。新电脑克隆仓库后，在项目根目录运行：

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\setup-windows.ps1
npm start
```

准备脚本会检查 Node.js 版本并执行锁定版本的 `npm ci`，同时提示 Python 和 FFmpeg 是否可用。Python、FFmpeg 和 BiRefNet 模型可以在每台电脑分别安装，并在 FramePick 设置中选择路径。API Key 保存在 Windows 用户目录，不会进入 GitHub。

`projects-local/`、`assets-local/`、`models/` 和 `runtime/` 是本机专用目录，已加入 `.gitignore`。需要跨电脑版本管理的大型项目素材，建议使用 Git LFS 或单独的云盘目录。

### GitHub 自动构建

`.github/workflows/windows.yml` 会在 GitHub Actions 中执行测试并构建 Windows 安装包。手动运行 workflow 可以验证当前 `main` 分支；推送形如 `v0.1.0` 的 tag 后，Actions 会构建并上传 `FramePick-windows` 工件，适合发布到 GitHub Releases。

同一时间重复运行不会创建第二个窗口。

项目文件使用 `.fpproj` 扩展名，序列目录使用 `framepick-sequence` schema v1。旧项目格式不受支持。

“保存”和“另存为”会写入完整项目快照，而不只是 `.fpproj`：

```text
项目目录/
├─ 项目名.fpproj
├─ frames/                 # 项目重开所需的原始帧和 AI 资产
└─ sequence/
   ├─ sequence.json
   ├─ original/
   ├─ ai/
   └─ transformed/
```

保存时会重新生成 `sequence/transformed/`，并清理由删除帧产生的旧项目资产和旧序列图片。完整序列快照准备失败时会显示错误，不会更新 `.fpproj` 文件。

## 序列整体动画

右侧“整图节点动画”用于控制输出序列所在节点的位移、统一缩放和旋转，不会改变角色在单帧画布内部的位置。关键帧显示在序列播放进度条下方，可以直接左右拖动时间位置，并支持预设缓动和自定义 Cubic Bezier 曲线。

“呼吸循环”会按当前有效序列总时长生成 `100% → 103% → 100%` 的闭环缩放。源序列仍按各帧停留时长切换，整图曲线由独立的连续播放时间计算，因此低帧率待机也能预览平滑的节点呼吸效果。

整图节点动画会保存到 `.fpproj` 和序列清单的 `sequenceAnimation` 字段。它不会烘焙进 PNG、Sprite Sheet、GIF 或 MP4 的帧像素，也不会触发 60 FPS 补帧；12 个有效序列帧始终对应 12 张导出帧。清单使用 `target: output-node`、`bakedIntoFrames: false`、中心 Pivot 和明确的像素/百分比/角度单位。引擎适配由可选插件负责，FramePick 核心不依赖具体引擎。

编辑器预览会把当前帧 Canvas 当作完整输出节点进行位移、缩放和旋转。棋盘背景、画布边界和帧像素会作为一个整体变换；放大或旋转后超出原始画布槽位的区域不会被裁切，并可通过工作区滚动条完整查看。这只模拟运行时节点状态，不会改变或补帧导出的 PNG 像素。

统一“导出”面板原生支持 GIF、MP4、PNG 序列帧格子和最终 PNG 单帧序列；安装的导出插件可以动态增加其他格式。选择最终 PNG 单帧序列后，会在所选目录中创建三个子目录：

- `original/`：未应用变换的原始截取 PNG。
- `ai/`：未应用变换的 AI 抠图 PNG；没有 AI 结果的帧不会生成占位图。
- `transformed/`：按当前原始/AI 序列选择，只应用单帧自身的位移、缩放和旋转；整图节点动画作为独立曲线保存在 `sequence.json`。尺寸来自整段序列可见内容的联合包围盒，而不是项目画布分辨率。

计算最终尺寸时会读取 Alpha 实际可见范围，并纳入每帧自身的位移、缩放和旋转。所有 `transformed/` 帧使用同一个联合尺寸和裁切原点，因此会去掉无效透明画布，同时保留角色在不同帧之间的真实位移；不会对每帧单独居中裁切。

再次导出到同一目录时会先清理三个子目录中的旧编号帧，并移除已经弃用且为空的 `frames/` 目录。`sequence.json` 同时记录最终内容尺寸、源画布、裁切偏移、三种文件路径和原图/AI 的独立变换，FramePick 可以从新目录完整还原；旧 `frames/frame_XXXX.png` 序列仍可读取。

## 导出插件

FramePick 通过 `plugins/*/framepick.plugin.json` 发现可选导出插件。核心只向插件提供通用序列 manifest、最终帧数据和目录选择能力，不包含任何 Godot、Unity 或其他引擎的格式与节点知识。插件可以注册导出格式及附加动作，移除插件目录后对应选项不会出现在界面中。接口说明见 `docs/PLUGIN_API.md`。

## Godot 4 插件

发行包可附带独立的 Godot 4 适配插件；它不是 FramePick 核心功能。插件提供 `.fpseq` 导出器、Godot addon 安装动作和 Godot 端导入器。使用流程：

1. 在“导出”中选择“Godot 4 动画包”。
2. 点击“安装插件”，选择包含 `project.godot` 的 Godot 项目根目录。
3. 在 Godot 的“项目 → 项目设置 → 插件”中启用 **FramePick Importer**。
4. 回到 FramePick 开始导出，选择 Godot 项目 `res://` 范围内的目标文件夹，例如项目的 `assets/animations/`。
5. 简单场景可新建 `FramePickPlayer2D`；已有角色节点结构则新建 `FramePickSequenceController`，把生成的 `.fpseq` 资源拖到它的 `sequence` 属性。

FramePick 会在目标目录下建立以项目名命名的资源包：

```text
项目名/
├─ 项目名.fpseq
└─ frames/
   ├─ frame_0001.png
   ├─ frame_0002.png
   └─ ...
```

Godot 导入 `.fpseq` 后，还会在同一目录生成可见的 `项目名_animations.tres` 原生 `AnimationLibrary`。其中 `motion` 包含五条整图 Bezier 曲线，`controller` 在此基础上增加按每帧 `delayMs` 排列的离散切帧轨道。该 `.tres` 可以加载到标准 `AnimationPlayer`，在 Godot Animation 面板中直接查看和播放；重新导入 `.fpseq` 会重建它，需要保留 Godot 侧改动时先复制为其他资源。

导入后的 `FramePickSequence` 资源还包含按每帧 `delayMs` 精确换算的 `SpriteFrames`、原始毫秒数组、循环状态和画布元数据。`FramePickPlayer2D` 适合独立播放；`FramePickSequenceController` 适合接入现有 `Sprite2D` 和独立视觉根节点。

对于 `Player/FootPivot/Sprite` 结构，建议把控制器放在 `Player` 下，并设置：

```text
frame_target_path  = ../FootPivot/Sprite
motion_target_path = ../FootPivot
```

要直接浏览 Godot 原生动画，在 `FramePickSequenceController` 下添加 `FramePickAnimationPlayer`，并关闭 Controller 自己的 `autoplay`。该节点会自动继承父 Controller 的 sequence、设置 `root_node=..` 并加载生成的 `项目名_animations.tres`。选中它后，Godot Animation 面板会直接显示 `framepick/controller` 和 `framepick/motion`；前者同时执行精确切帧和整图曲线，后者只执行整图曲线。

Godot addon 可以只在本机使用而不进入 SVN：在本机 `%APPDATA%\Subversion\config` 的 `global-ignores` 中加入 `framepick_importer`，不要为项目目录新增 `svn:ignore` 属性。这样 `res://addons/framepick_importer` 仍可正常加载，但 SVN 递归添加和提交会跳过该目录。

序列换帧只修改 `Sprite.texture`；整体位移、缩放和旋转作用于 `FootPivot`。曲线按目标初始变换相对执行，因此 Godot 中 `FootPivot.position = (0, 12)` 不会被 FramePick 的 `(0, 0)` 关键帧覆盖，`100%` 缩放也不会覆盖已有基础缩放。呼吸缩放围绕脚底原点执行，主图、星级副本、`MaxStarGlow` 和姿势替换图会一起运动，而 `Player` 的世界位置和碰撞保持不变。不要把整体曲线绑到 `Sprite.scale`，因为角色代码可能根据贴图尺寸持续重算它。

插件只复制到 `addons/framepick_importer/`，不会自动修改或启用 Godot 项目的插件配置。FramePick 侧适配器和 Godot addon 均位于 `plugins/godot4/`。

## 调试日志

桌面 App 会自动记录启动、IPC、页面错误和未处理异常。日志位置可在“设置 → 调试日志 → 打开日志文件夹”中打开。

默认路径为 Windows 用户数据目录下的 `FramePick\logs\framepick.log`。日志超过 5 MB 时会自动轮转为 `framepick.previous.log`，不会记录 API Key 或图片数据。

## 打包 Windows 安装程序

```powershell
npm run dist
```

安装包会输出到 `dist/`。构建过程中 Electron Builder 会临时生成 `dist/win-unpacked/`，构建成功后 FramePick 会自动清理这个未压缩中间目录，只保留安装包、blockmap 和更新元数据，避免在项目目录中长期保留第二份约 348 MB 的 Electron。也可以单独运行 `npm run clean:dist` 清理已有的打包中间目录。远程 AI 请求由 Electron 主进程发出，本地抠图依赖 `workers/birefnet_worker.py` 和可用的 BiRefNet 模型。
