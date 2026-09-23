---
name: agent-browser
description: 用浏览器做真实页面验收（CLI agent-browser 或等价手工检查清单）。
---

# agent-browser（ML AOS）

用于验证 Web UI 是否满足验收标准。

## 优先路径

若已安装 `agent-browser`：

```bash
npm i -g agent-browser && agent-browser install
agent-browser skills get core
```

按 CLI 提供的工作流打开目标 `baseURL`，对关键验收点做导航 / 点击 / 截图 / 断言。

## 回退路径

未安装 CLI 时：

1. 确认本地服务是否已按项目约定启动（或 `reuseExistingServer`）。
2. 列出可手工执行的验收清单（步骤、期望、实际）。
3. 能跑的命令行检查（curl、构建产物）一并执行。
4. 在结论中标明「未做真实浏览器自动化」及原因。

## 输出

- 通过项 / 失败项 / 复现步骤 / 严重级别
- 失败时明确应打回开发修什么；通过时给出可进入审查的结论
- 不要重写业务代码来「顺便修好」
