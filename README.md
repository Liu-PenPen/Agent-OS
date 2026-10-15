# ML AOS

Desktop workbench for multi-bot local agents: workspaces, topic chat, dispatch pipelines, and clarification HITL. Phase 1 ships a Tauri + React UI and a Node runtime on `127.0.0.1:17890`.

**License:** [MIT](./LICENSE)

This repo is **independent of agent-os** — no shared runtime, no Feishu, no coupling to that codebase. Secrets stay out of the tree; Claude/Codex use their own user-level CLI logins.

**Product / decisions:** [PRODUCT.md](./PRODUCT.md) · [GLOSSARY.md](./GLOSSARY.md) · [adr/](./adr/)

### Gitee credentials (optional)

工单 / 定时拉单需要 Gitee 企业凭证。仓库只提交 [`.env.example`](.env.example) 与 [`config/gitee-projects.example.json`](config/gitee-projects.example.json)；真实 token、企业 ID、项目白名单不要提交。

双通道（**环境变量优先**于设置页存档）：

1. **设置 → 应用偏好 → 集成 / Gitee**（推荐桌面用户；写入 `dataDir/gitee-credentials.json`，UI 遮罩 token）
2. **本机 `.env` / 环境变量**（适合克隆源码开发）：`ML_AOS_GITEE_TOKEN`、`ML_AOS_GITEE_ENTERPRISE_ID`、`ML_AOS_GITEE_USER_ID`（旧名 `MI_CLAW_*` / `GITEE_USER_ID` 仍可读）

未配置时工作台与对话仍可用；仅 Gitee 相关能力提示去设置。可用设置页「测试连接」验证。

## Requirements

- Node 22+
- [pnpm](https://pnpm.io/) 9+
- Optional: Git on `PATH` (workspace clone)
- Optional: [Claude Code](https://docs.anthropic.com/en/docs/claude-code) CLI on `PATH` (real engine)
- Optional for native window: Rust toolchain + **MSVC Build Tools** (`link.exe`) on Windows

## Download (Windows installer)

安装包通过 GitHub Releases 发布（打 `v*` 标签后自动构建）：

1. 打开 [Releases](https://github.com/Liu-PenPen/MLAOS/releases)
2. 下载最新的 `MLAOS_x.y.z_x64-setup.exe`（NSIS；不要下 Source code zip）
3. 安装后启动 **ML AOS**；内置便携 Node + runtime，**不必**再装 Node 才能开应用
4. 在 **设置 → 集成 / Gitee** 填写自己的凭证（或开发时用 `.env`）
5. 跑真实智能体仍需本机安装并登录 [Claude Code](https://docs.anthropic.com/en/docs/claude-code) 或 Codex CLI

本地打安装包（需 Windows + MSVC + 网络以下载便携 Node）：

```bash
pnpm install
pnpm build:desktop
```

产物目录：`apps/desktop/src-tauri/target/release/bundle/nsis/`。

## Install from source

```bash
pnpm install
```

## Dev

Start the runtime and UI in two terminals:

```bash
pnpm dev:runtime   # http://127.0.0.1:17890
pnpm dev:ui        # Vite UI http://localhost:1420
```

### Tauri (native window)

```bash
pnpm tauri dev
```

On Windows, `tauri build` / `tauri dev` need the MSVC linker (`link.exe`). If it is missing, use `pnpm dev:runtime` + `pnpm dev:ui` instead — the browser UI talks to the same runtime. When the native shell starts, it probes `/health` and may spawn the runtime sidecar (see `apps/desktop/src-tauri/sidecars/README.md`).

## Data directory

Runtime persists JSON under a data directory:

- Default when started via `pnpm dev:runtime`: `./data` (cwd = `packages/runtime`, overridable with `ML_AOS_DATA_DIR`)
- App setting `dataDir` is stored in settings and shown under App Settings → Workspace Environment
- Spec default for packaged apps: OS app-data folder (`…/ml-aos`)

Do not commit local `data/` contents.

## Engines: mock vs Claude

| Engine | Behavior |
|--------|----------|
| `mock` (default) | In-process mock adapter; no CLI binary required. Use for UI and acceptance. |
| `claude` | Spawns `claude` (`shell: false`). Missing binary → HTTP **503** with install/login message. |
| `codex` | Stub only; returns unavailable until implemented. |

Set the default under App Settings, or per-bot on the Bot settings page.

## Workspace Git

Configure `gitUrl` on a workspace, then Clone. Requires `git` on `PATH`. Integration tests skip when Git is unavailable; see `packages/runtime/README.md`.

## 真实流水线

Dispatch 后默认由 `PipelineRunner` 按阶段真正跑各 Bot 的 CLI（mock / claude），阶段成功再推进；失败标为 `blocked`。不再依赖 5 秒假定时器（仅当 `ML_AOS_MOCK_PIPELINE_TIMER=1` 时恢复旧行为）。

### 配置三个角色 Bot

在 **智能体配置** 页创建并启用三个 Bot，`role` 必须精确匹配（大小写不敏感）：

| 阶段 | `role` | 说明 |
|------|--------|------|
| developing | `developer` | 实现变更 |
| testing | `tester` | 测试验证 |
| reviewing | `reviewer` | 审查 / PR |

引擎可先全部设为 `mock`（无需本机 Claude）；需要真 CLI 时把对应 Bot 的 `defaultEngine` 改为 `claude`。

也可在 Dispatch API 里传 `assigneeBotIds: [devId, testId, reviewId]` 覆盖角色自动匹配。

### 启动与观察

1. 选中工作区话题 → 右侧「启动流水线」（或 `POST /api/topics/:id/dispatch`）
2. 右侧面板显示当前阶段负责人 Bot 名；`blocked` 时出现 **Blocked** 徽章
3. 流水线详情页展示各阶段 `detail`（CLI 摘要 / 失败原因）
4. 阶段中出现澄清 → 停在当前阶段，回答后继续；Abort → 当前阶段失败并 `blocked`

## Tests

```bash
pnpm test
```

## Phase 1 acceptance

本地跑通：`pnpm test`，以及 `pnpm dev:runtime` + `pnpm dev:ui`（或 `pnpm tauri`）完成工作区 / 话题 / 引擎冒烟。架构决策见 [adr/](./adr/)。
