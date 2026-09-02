# FramePick

FramePick 是一个动画序列帧编辑器（Electron 桌面应用），用于从视频素材中提取、整理和编辑序列帧，并支持 AI 抠像与序列导出。

## 主要功能

- **取帧工作区**：从视频中按需求提取帧，组织为序列帧项目（`.fpproj`）。
- **多项目窗口**：同一进程内通过「文件 → 新窗口」打开多个独立项目窗口，各自拥有素材、序列、播放状态、撤销记录与保存路径。
- **序列编辑**：画布内支持框选/画笔选区擦除（进入撤销历史），以及竖线/横线辅助线用于对齐（不进入导出图）。
- **AI 抠像**：BiRefNet 作为独立 Python worker 由 Electron 按需管理。
- **导出**：FFmpeg 由 Electron 直接调用，序列目录使用 `framepick-sequence` schema v1。
- **插件体系**：见 `docs/PLUGIN_API.md`。

## 环境要求

- Node.js 18+
- Python 3.11+（或在设置中指定便携 Python runtime）
- FFmpeg（PATH 中可用，或在设置中指定）

## 快速开始

```powershell
npm install
npm start
```

也可以直接双击 `启动 FramePick.cmd`（或英文备用入口 `start-framepick.cmd`）；启动器会在 Electron 运行时不完整时自动恢复依赖。

在新电脑上克隆仓库后：

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\setup-windows.ps1
npm start
```

## 常用命令

| 命令 | 说明 |
| --- | --- |
| `npm start` | 启动桌面应用 |
| `npm test` | 运行测试（node --test） |
| `npm run dist` | 构建 NSIS 安装包 |
| `npm run dist:portable` | 构建 Windows 便携版 |

## 构建与发布

`.github/workflows/windows.yml` 在 GitHub Actions 中运行测试并构建 Windows 安装包；推送 `v*` tag 会产出 `FramePick-windows` 工件，可发布到 Releases。

## 仓库说明

- 仓库只提交源码与 `package-lock.json`；`node_modules`、Electron 缓存、个人配置、素材与模型不入库。
- `projects-local/`、`assets-local/`、`models/`、`runtime/` 为本机专用目录（已在 `.gitignore`）。
- API Key 保存在 Windows 用户目录，不会提交到 GitHub。

更多细节见 `README-DESKTOP.md` 与 `docs/` 目录。

## 许可与版权

本仓库为**公开可见但非开源**项目，版权所有（All Rights Reserved），详见 `LICENSE`：

- 允许查看代码、个人学习参考；
- 未经许可不得复制、修改、再分发或商业使用。
