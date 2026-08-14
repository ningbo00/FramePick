# FramePick 重构基线

审计日期：2026-08-14

目标目录：`G:\AI\FramePick`

原项目：`G:\AI\Video2Sequcene`（本次不修改）

当前基线问题：

- Electron 通过随机本地端口启动旧 Python HTTP 服务，窗口使用 `loadURL`。
- Renderer 通过 `/api/*` 调用配置、AI、素材位置和 FFmpeg 导出。
- Python 服务同时承担静态文件、远程 AI 转发、本地 BiRefNet worker 和 FFmpeg。
- 项目仍是内嵌 Base64 的普通 JSON，扩展名为旧项目扩展名，并保留旧命名兼容分支。
- 序列导出使用旧的 snake_case 字段，原图为 JPG，跳过帧仍会被导出。
- `G:\ComfyUI` 路径、系统 Python、PATH 中 FFmpeg 均为运行时隐式依赖。
- 源码目录的配置文件曾包含真实 API Key；重构后仅用户数据目录允许保存密钥。
- `dist/`、`node_modules/`、`__pycache__/`、`*.pyc` 和日志均为可重建产物。

重构约束：

- 只修改 `G:\AI\FramePick`。
- 新项目格式为 `.fpproj`，严格 `framepick-project` / `schemaVersion: 1`。
- 新序列格式为 `framepick-sequence` / `schemaVersion: 1`。
- 旧项目扩展名、旧 JSON、旧目录、旧 localStorage、旧环境变量直接拒绝或删除。
- FramePick 不启动 HTTP 服务；Renderer 只通过 preload IPC 使用桌面能力。
