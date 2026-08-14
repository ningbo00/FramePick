# FramePick 插件接口

FramePick 核心保持引擎无关。可选插件位于 `plugins/<plugin-id>/`，通过 `framepick.plugin.json` 注册导出格式和附加动作。

## 目录结构

```text
plugins/example/
├─ framepick.plugin.json
└─ index.js
```

清单包含稳定的插件 ID、入口文件、导出格式以及可选动作：

```json
{
  "id": "example",
  "name": "Example Engine",
  "version": "1.0.0",
  "entry": "index.js",
  "exportFormats": [
    {
      "id": "package",
      "label": "Example 动画包",
      "hint": "插件提供的格式说明",
      "usesResolution": false
    }
  ],
  "actions": [
    {
      "id": "install",
      "label": "安装导入插件",
      "description": "选择目标项目目录",
      "buttonLabel": "安装",
      "requiresDirectory": true
    }
  ]
}
```

入口模块按需实现两个方法：

```js
function exportPackage({ appRoot, paths, formatId, payload }) {}
function runAction({ appRoot, paths, actionId, payload }) {}
```

`exportPackage` 接收 FramePick 生成的通用序列 manifest、对应 PNG 数据和用户选择的输出目录。`runAction` 用于安装引擎侧插件等可选操作。两者应返回 `{ ok: true }`，可以附带 `message`、`frameCount` 或输出路径；失败时抛出明确错误。

插件在 Electron 主进程中运行，属于受信任的本地代码。核心只负责发现、校验、IPC 分发和通用界面，不应该出现某个具体引擎的格式、文件扩展名、节点类型或项目目录规则。

当前 `plugins/godot4/` 是参考实现。删除该目录后，FramePick 仍可正常使用所有原生编辑与导出功能，界面也不会显示 Godot 选项。
