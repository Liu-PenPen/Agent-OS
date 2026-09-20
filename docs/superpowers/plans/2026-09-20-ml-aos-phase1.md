# ML AOS Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 `E:\Python_Project\ml-aos` 交付可运行的 ML AOS 桌面一期：三栏工作台、工作区（目录+Git）、Bot 配置、话题聊天（先 Mock CLI）、派发流水线、澄清 HITL、主题切换；不修改现有 `agent-os` 仓库。

**Architecture:** Tauri 2 壳负责窗口、文件夹选择、拉起 Node Runtime sidecar；React (Vite) 经 `http://127.0.0.1:17890` REST + WebSocket 与 Runtime 通信；Runtime 持有领域状态、JSON 持久化、CLI 适配（一期先 Mock，再接 Claude/Codex）。UI 按已批准 Superdesign 稿实现。

**Tech Stack:** Tauri 2 · React 19 · Vite · TypeScript · pnpm · Node 22+ · Zod · Vitest · (可选) Tailwind CSS

**Spec:** `docs/superpowers/specs/2026-09-20-ml-aos-desktop-design.md`  
**Design canvas:** https://superdesign.dev/teams/fd792fcc-1ab4-4e30-adb7-6d52f4682245/projects/2e5cbb8c-5c17-4318-82d3-c94073e063e5

## Global Constraints

- 仓库路径仅限 `E:\Python_Project\ml-aos`；**禁止**修改 `E:\Python_Project\agent-os\**` 功能代码
- 产品名窗口/顶栏文案：**ML AOS**
- 无飞书依赖；密钥不进仓库；Claude/Codex 用用户级配置
- Runtime 默认监听 `127.0.0.1:17890`（仅本机）
- 持久化：JSON 文件，目录由 AppSettings.dataDir 决定（默认 `appData/ml-aos`）
- 切换 Workspace.localPath 必须清除该工作区话题的 CLI sessionId
- 主题：`dark` | `light` | `system`，默认 `dark`，CSS 变量换肤
- Windows：spawn CLI 优先无 shell；取消任务杀进程树（对齐 agent-os 教训，实现真 CLI 时遵守）
- 包管理：pnpm；ESM only

---

## Locked open items (from spec §9)

| 项 | 一期锁定 |
|----|----------|
| UI ↔ Runtime | HTTP REST + WebSocket（非纯 Tauri IPC 业务） |
| 持久化 | JSON 文件（非 SQLite） |
| CLI | Task 7–8 用 **MockCliAdapter**；Task 11 接 **ClaudeCliAdapter**（Codex 可同接口后置） |

---

## File structure (target)

```text
ml-aos/
  package.json                 # pnpm workspace root
  pnpm-workspace.yaml
  packages/
    shared/                    # Zod schemas + types shared by UI & runtime
      src/index.ts
      src/models.ts
      package.json
    runtime/                   # Desktop Runtime (Node)
      src/index.ts             # HTTP+WS server entry
      src/store/json-store.ts
      src/services/*.ts
      src/cli/mock-adapter.ts
      src/cli/claude-adapter.ts
      src/cli/types.ts
      package.json
  apps/
    desktop/                   # Vite React + Tauri
      src/
        main.tsx
        App.tsx
        styles/tokens.css
        lib/api.ts
        lib/ws.ts
        lib/theme.ts
        components/shell/*
        pages/*
      src-tauri/
        tauri.conf.json
        src/main.rs            # spawn runtime, folder dialog
      package.json
  docs/superpowers/...
```

---

## Domain types (shared contract)

```ts
// packages/shared/src/models.ts — canonical shapes

export type ThemeMode = "dark" | "light" | "system";
export type EngineKind = "claude" | "codex" | "mock";
export type PipelineStage =
  | "idle"
  | "developing"
  | "testing"
  | "reviewing"
  | "completed"
  | "blocked";

export interface AppSettings {
  theme: ThemeMode;
  defaultEngine: EngineKind;
  dataDir: string;
  notifications: boolean;
}

export interface BotConfig {
  id: string;
  name: string;
  role: string; // e.g. ceo | product | developer | tester | reviewer
  defaultEngine: EngineKind;
  instructions: string;
  enabled: boolean;
}

export interface Workspace {
  id: string;
  name: string;
  localPath: string;
  gitUrl?: string;
}

export interface Topic {
  id: string;
  workspaceId: string;
  title: string;
  createdAt: string;
  cliSessionId?: string;
  pipelineStage: PipelineStage;
  pipelineTaskId?: string;
}

export type MessageAuthor = "user" | "bot" | "system";

export interface ChatMessage {
  id: string;
  topicId: string;
  author: MessageAuthor;
  botId?: string;
  content: string;
  createdAt: string;
  kind?: "text" | "clarification" | "tool";
  clarification?: {
    id: string;
    prompt: string;
    options: { id: string; label: string }[];
    selectedOptionId?: string;
    status: "pending" | "answered";
  };
}

export interface PipelineTask {
  id: string;
  topicId: string;
  title: string;
  stage: PipelineStage;
  stages: {
    stage: PipelineStage;
    botId?: string;
    status: "pending" | "running" | "done" | "failed";
    detail?: string;
    at?: string;
  }[];
}
```

---

### Task 1: Monorepo scaffold + shared models

**Files:**
- Create: `package.json`, `pnpm-workspace.yaml`, `.gitignore`
- Create: `packages/shared/package.json`, `packages/shared/tsconfig.json`, `packages/shared/src/models.ts`, `packages/shared/src/index.ts`
- Create: `packages/shared/src/models.test.ts`
- Test: `packages/shared` via vitest

**Interfaces:**
- Produces: `@ml-aos/shared` exports all types above + Zod parsers `AppSettingsSchema`, `BotConfigSchema`, `WorkspaceSchema`

- [ ] **Step 1: Init workspace root**

```json
// package.json
{
  "name": "ml-aos",
  "private": true,
  "packageManager": "pnpm@9.15.0",
  "scripts": {
    "test": "pnpm -r test",
    "dev:runtime": "pnpm --filter @ml-aos/runtime dev",
    "dev:ui": "pnpm --filter @ml-aos/desktop dev",
    "tauri": "pnpm --filter @ml-aos/desktop tauri"
  }
}
```

```yaml
# pnpm-workspace.yaml
packages:
  - "packages/*"
  - "apps/*"
```

`.gitignore`: `node_modules`, `dist`, `src-tauri/target`, `.env`, `data/`, `.superdesign/tmp`

- [ ] **Step 2: Write failing Zod round-trip test**

```ts
// packages/shared/src/models.test.ts
import { describe, it, expect } from "vitest";
import { AppSettingsSchema } from "./models.js";

describe("AppSettingsSchema", () => {
  it("defaults theme to dark when parsing partial", () => {
    const parsed = AppSettingsSchema.parse({
      theme: "dark",
      defaultEngine: "mock",
      dataDir: "C:/tmp/ml-aos",
      notifications: true,
    });
    expect(parsed.theme).toBe("dark");
  });
});
```

- [ ] **Step 3: Run test — expect FAIL (module missing)**

Run: `cd E:\Python_Project\ml-aos\packages\shared && pnpm exec vitest run src/models.test.ts`  
Expected: FAIL resolve or export missing

- [ ] **Step 4: Implement models + Zod + package.json**

Implement `models.ts` with schemas matching Domain types section. Export from `index.ts`. Add vitest/typescript deps.

- [ ] **Step 5: Run test — expect PASS**

- [ ] **Step 6: Commit**

```bash
cd E:/Python_Project/ml-aos
git init   # if not already
git add package.json pnpm-workspace.yaml .gitignore packages/shared
git commit -m "chore: scaffold shared models and workspace"
```

---

### Task 2: JSON store + Runtime HTTP skeleton

**Files:**
- Create: `packages/runtime/package.json`, `packages/runtime/src/store/json-store.ts`, `packages/runtime/src/store/json-store.test.ts`, `packages/runtime/src/index.ts`, `packages/runtime/src/app-state.ts`

**Interfaces:**
- Consumes: `@ml-aos/shared` schemas
- Produces:
  - `JsonStore.load(): Promise<AppState>`
  - `JsonStore.save(state: AppState): Promise<void>`
  - `AppState = { settings, bots, workspaces, topics, messages, pipelines }`
  - HTTP `GET /health` → `{ ok: true }`

- [ ] **Step 1: Failing test for load/save round-trip**

```ts
// packages/runtime/src/store/json-store.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { JsonStore } from "./json-store.js";
import type { AppState } from "../app-state.js";

describe("JsonStore", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "ml-aos-"));
  });

  it("round-trips empty state", async () => {
    const store = new JsonStore(dir);
    const empty: AppState = {
      settings: {
        theme: "dark",
        defaultEngine: "mock",
        dataDir: dir,
        notifications: true,
      },
      bots: [],
      workspaces: [],
      topics: [],
      messages: [],
      pipelines: [],
    };
    await store.save(empty);
    const loaded = await store.load();
    expect(loaded.settings.theme).toBe("dark");
    expect(loaded.bots).toEqual([]);
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

Run: `pnpm --filter @ml-aos/runtime exec vitest run src/store/json-store.test.ts`

- [ ] **Step 3: Implement JsonStore + empty AppState + `node:http` server with GET /health**

Listen `127.0.0.1:17890`. Persist files: `settings.json`, `bots.json`, `workspaces.json`, `topics.json`, `messages.json`, `pipelines.json` under dataDir.

- [ ] **Step 4: Tests PASS; manual `curl http://127.0.0.1:17890/health`**

Expected: `{"ok":true}`

- [ ] **Step 5: Commit**

```bash
git add packages/runtime
git commit -m "feat: add runtime json store and health endpoint"
```

---

### Task 3: Workspace + Bot CRUD APIs

**Files:**
- Create: `packages/runtime/src/services/workspace-service.ts`, `bot-service.ts`
- Create: `packages/runtime/src/routes/workspaces.ts`, `bots.ts`
- Test: `packages/runtime/src/services/workspace-service.test.ts`, `bot-service.test.ts`

**Interfaces:**
- Produces REST:
  - `GET/POST /api/workspaces`, `PATCH/DELETE /api/workspaces/:id`
  - `POST /api/workspaces/:id/clone` body `{ }` → runs `git clone <gitUrl> <localPath>` if gitUrl set and path empty (skip with 400 if no git)
  - `GET/POST /api/bots`, `PATCH/DELETE /api/bots/:id`
- Changing `localPath` via PATCH must set all topics in that workspace `cliSessionId = undefined`

- [ ] **Step 1: Failing test — create workspace requires localPath**

```ts
it("rejects workspace without localPath", async () => {
  const svc = new WorkspaceService(store);
  await expect(
    svc.create({ name: "x", localPath: "" }),
  ).rejects.toThrow(/localPath/);
});
```

- [ ] **Step 2: Implement services + routes; tests PASS**

- [ ] **Step 3: Failing test — clear cliSessionId on localPath change**

```ts
it("clears topic cliSessionId when localPath changes", async () => {
  // create workspace + topic with cliSessionId "abc"
  // patch localPath
  // expect topic.cliSessionId to be undefined
});
```

- [ ] **Step 4: Implement clear logic; PASS; Commit**

```bash
git commit -m "feat: workspace and bot CRUD APIs"
```

---

### Task 4: Topics, messages, Mock CLI streaming

**Files:**
- Create: `packages/runtime/src/cli/types.ts`, `mock-adapter.ts`, `mock-adapter.test.ts`
- Create: `packages/runtime/src/services/chat-service.ts`, `chat-service.test.ts`
- Create: `packages/runtime/src/ws.ts` (WebSocket `/ws`)

**Interfaces:**
- Produces:
  - `CliAdapter.run(input: { prompt, cwd, sessionId?, signal }): AsyncIterable<CliEvent>`
  - `CliEvent = { type: "text_delta" | "tool" | "done" | "error" | "clarification"; ... }`
  - `POST /api/topics`, `GET /api/topics?workspaceId=`
  - `GET /api/topics/:id/messages`
  - `POST /api/topics/:id/messages` body `{ content, mentionBotId? }`
  - WS events: `message.upsert`, `pipeline.update`

- [ ] **Step 1: Mock adapter test — yields text then done**

```ts
it("streams hello", async () => {
  const adapter = new MockCliAdapter();
  const chunks: string[] = [];
  for await (const ev of adapter.run({
    prompt: "hi",
    cwd: process.cwd(),
  })) {
    if (ev.type === "text_delta") chunks.push(ev.text);
  }
  expect(chunks.join("")).toContain("Mock");
});
```

- [ ] **Step 2: Implement MockCliAdapter (fake latency ~20ms deltas)**

- [ ] **Step 3: ChatService — user message + bot reply via mock; mentionBotId required to pick bot**

- [ ] **Step 4: Wire WS broadcast on new messages**

- [ ] **Step 5: Commit**

```bash
git commit -m "feat: topics chat with mock CLI streaming"
```

---

### Task 5: Collaboration pipeline + clarification

**Files:**
- Create: `packages/runtime/src/services/pipeline-service.ts`, `clarification-service.ts` + tests
- Modify: chat-service to emit clarification events from mock when prompt contains `[clarify]`

**Interfaces:**
- Produces:
  - `POST /api/topics/:id/dispatch` body `{ title, assigneeBotIds?: string[] }` → creates PipelineTask, stage `developing`
  - Advances mock: developing→testing→reviewing→completed on timer or `POST /api/pipelines/:id/advance` (test helper)
  - `POST /api/clarifications/:id/answer` body `{ optionId }` → marks answered, appends system message
  - `GET /api/clarifications?status=pending`

- [ ] **Step 1: Pipeline create test — stage developing**

- [ ] **Step 2: Clarification answer test — pending → answered**

- [ ] **Step 3: Implement; MockCliAdapter: if prompt includes `[clarify]`, emit clarification event with 2 options**

- [ ] **Step 4: Commit**

```bash
git commit -m "feat: pipeline dispatch and clarification HITL"
```

---

### Task 6: Desktop UI shell + theme

**Files:**
- Create: `apps/desktop` via `pnpm create vite` (React-TS) + `pnpm tauri init` (product name ML AOS)
- Create: `apps/desktop/src/styles/tokens.css`, `lib/theme.ts`, `lib/api.ts`, `lib/ws.ts`
- Create: `apps/desktop/src/components/shell/TopBar.tsx`, `Sidebar.tsx`, `RightPanel.tsx`, `AppLayout.tsx`
- Create: `apps/desktop/src/pages/HomePage.tsx`
- Reference drafts: Home https://p.superdesign.dev/draft/4d00e536-fcbd-4eb0-a9f5-a372c9bcbeb5

**Interfaces:**
- Consumes: Runtime REST/WS
- Produces: `applyTheme(mode: ThemeMode)` sets `data-theme` on `document.documentElement`; `system` listens `prefers-color-scheme`

- [ ] **Step 1: Scaffold Vite+React+Tauri; window title `ML AOS`**

- [ ] **Step 2: tokens.css with dark/light variables from `.superdesign/design-system.md`**

- [ ] **Step 3: Theme unit test (jsdom) — applyTheme("light") sets data-theme=light**

```ts
it("applies light", () => {
  applyTheme("light");
  expect(document.documentElement.dataset.theme).toBe("light");
});
```

- [ ] **Step 4: Build three-pane Home layout (static mock data OK initially)**

- [ ] **Step 5: Wire TopBar theme toggle calling PATCH `/api/settings`**

- [ ] **Step 6: `pnpm --filter @ml-aos/desktop dev` shows ML AOS chrome**

- [ ] **Step 7: Commit**

```bash
git commit -m "feat: desktop shell layout and theme tokens"
```

---

### Task 7: UI pages — Workspace, Bots, Settings, Queue, Pipeline

**Files:**
- Create: `pages/WorkspaceFormPage.tsx`, `BotSettingsPage.tsx`, `AppSettingsPage.tsx`, `ClarificationQueuePage.tsx`, `PipelineDetailPage.tsx`
- Create: `App.tsx` routes (react-router)
- Drafts:
  - Workspace https://p.superdesign.dev/draft/e5ba38ea-18c9-4bf2-b8e1-f1497f3bc6d4
  - Bots https://p.superdesign.dev/draft/27171bf2-798a-45ff-99d7-de679c68e127
  - Queue https://p.superdesign.dev/draft/88c3b020-2d8d-43bb-946b-d153a2e2fdfe
  - Pipeline https://p.superdesign.dev/draft/949a92f9-aef8-423c-812a-0459abfa61a9
  - Settings https://p.superdesign.dev/draft/caa116af-d072-4fc7-a7dd-fbbeab2d9f59
  - Settings light https://p.superdesign.dev/draft/6d10e4e1-5734-4db1-8eb3-a9674939e877

**Interfaces:**
- Tauri command `pick_folder() -> string` for Browse buttons
- Clone button → `POST /api/workspaces/:id/clone`

- [ ] **Step 1: Implement Workspace form (name, localPath browse, gitUrl, save, clone)**

- [ ] **Step 2: Bot settings list + editor CRUD**

- [ ] **Step 3: App settings — theme segmented control dark/light/system**

- [ ] **Step 4: Clarification queue + answer flow**

- [ ] **Step 5: Pipeline detail from right panel click**

- [ ] **Step 6: Manual smoke: create workspace, add bot, open home**

- [ ] **Step 7: Commit**

```bash
git commit -m "feat: settings workspace bots queue and pipeline pages"
```

---

### Task 8: Wire Home chat end-to-end (Mock)

**Files:**
- Modify: `HomePage.tsx`, `Sidebar.tsx`, `RightPanel.tsx`, composer component
- Create: `components/chat/MessageList.tsx`, `Composer.tsx`, `ClarificationCard.tsx`

**Interfaces:**
- Composer: `@` picker from enabled bots; Send → POST message; Abort → `POST /api/topics/:id/abort`
- Right panel shows localPath, gitUrl, pipeline stage, pending count

- [ ] **Step 1: Connect WS; render live messages**

- [ ] **Step 2: Send with @bot; see mock stream**

- [ ] **Step 3: Send `[clarify]` prompt; answer card; appears in queue**

- [ ] **Step 4: Dispatch pipeline; right panel stages update**

- [ ] **Step 5: Commit**

```bash
git commit -m "feat: wire home chat pipeline and clarification"
```

---

### Task 9: Tauri sidecar lifecycle

**Files:**
- Modify: `apps/desktop/src-tauri/src/main.rs`, `tauri.conf.json`
- Create: `apps/desktop/src-tauri/sidecars` note or bundle script to run `node packages/runtime/dist/index.js`

**Interfaces:**
- On app start: spawn runtime if `/health` fails
- On app exit: kill runtime process tree (Windows `taskkill /T`)

- [ ] **Step 1: Implement spawn + health wait (timeout 10s)**

- [ ] **Step 2: Implement pick_folder command**

- [ ] **Step 3: `pnpm tauri dev` launches UI + runtime without manual terminal**

- [ ] **Step 4: Commit**

```bash
git commit -m "feat: tauri spawns runtime sidecar and folder picker"
```

---

### Task 10: Git clone integration test

**Files:**
- Create: `packages/runtime/src/services/git-service.ts`, `git-service.test.ts`
- Modify: workspace clone route

**Interfaces:**
- `cloneRepo(gitUrl: string, localPath: string): Promise<void>` using `git` executable (no shell quoting issues — args array)

- [ ] **Step 1: Test with skip if `git --version` fails**

```ts
const hasGit = /* sync which git */;
(hasGit ? it : it.skip)("clones into empty dir", async () => { ... });
```

- [ ] **Step 2: Implement; document in README if git missing**

- [ ] **Step 3: Commit**

```bash
git commit -m "feat: workspace git clone via local git"
```

---

### Task 11: Real Claude CLI adapter (feature-flagged)

**Files:**
- Create: `packages/runtime/src/cli/claude-adapter.ts` (spawn pattern inspired by agent-os `src/cli` — **read only**, do not copy into agent-os)
- Modify: chat-service to pick adapter from bot.defaultEngine / settings.defaultEngine
- Reference (read-only): `E:/Python_Project/agent-os/agent-team/agent-os/src/cli/AGENTS.md`

**Interfaces:**
- Same `CliAdapter` interface as Mock
- If `claude` binary missing, API returns 503 with message to install/login; UI shows toast

- [ ] **Step 1: Adapter unit test with mocked spawn (no real network)**

- [ ] **Step 2: Implement spawn without shell; parse stdout lines as text_delta best-effort**

- [ ] **Step 3: Manual optional: set bot engine claude, @bot real prompt**

- [ ] **Step 4: Commit**

```bash
git commit -m "feat: optional Claude CLI adapter behind engine setting"
```

---

### Task 12: README + acceptance checklist

**Files:**
- Create: `README.md`
- Modify: spec status already 已批准; add link to this plan from README

- [ ] **Step 1: Write README — install, `pnpm install`, `pnpm tauri dev`, data dir, no agent-os coupling**

- [ ] **Step 2: Run acceptance checklist from spec §7 (all 8 items)**

| # | Check | Pass? |
|---|--------|-------|
| 1 | Window title / top bar ML AOS | |
| 2 | Configure bot + @ in topic (mock OK) | |
| 3 | Workspace localPath visible | |
| 4 | gitUrl + clone (or skip documented) | |
| 5 | Dispatch shows pipeline stages | |
| 6 | Clarification answer writes back | |
| 7 | Theme dark/light/system persists | |
| 8 | agent-os git status clean / untouched | |

- [ ] **Step 3: Commit**

```bash
git commit -m "docs: README and phase-1 acceptance notes"
```

---

## Spec coverage self-check

| Spec requirement | Task |
|------------------|------|
| Tauri + React + Runtime | 1, 2, 6, 9 |
| No Feishu / no agent-os edits | Global + 12 |
| Workspace localPath + gitUrl | 3, 7, 10 |
| Bot CRUD | 3, 7 |
| Topic chat @ bots | 4, 8 |
| Pipeline dispatch | 5, 8 |
| Clarification HITL | 5, 7, 8 |
| Theme dark/light/system | 6, 7 |
| Eyes / schedule | Out of scope (二期) |
| Mock then real CLI | 4, 11 |

## Placeholder scan

No TBD steps; open items locked in plan header.

## Type consistency

Shared names: `ThemeMode`, `BotConfig`, `Workspace`, `Topic`, `ChatMessage`, `PipelineTask`, `PipelineStage`, `CliAdapter`, `AppState` — use exactly these across tasks.

---

## Design draft map (implement UI against)

| Screen | Preview |
|--------|---------|
| Home | https://p.superdesign.dev/draft/4d00e536-fcbd-4eb0-a9f5-a372c9bcbeb5 |
| Workspace | https://p.superdesign.dev/draft/e5ba38ea-18c9-4bf2-b8e1-f1497f3bc6d4 |
| Bot Settings | https://p.superdesign.dev/draft/27171bf2-798a-45ff-99d7-de679c68e127 |
| Clarification Queue | https://p.superdesign.dev/draft/88c3b020-2d8d-43bb-946b-d153a2e2fdfe |
| Pipeline Detail | https://p.superdesign.dev/draft/949a92f9-aef8-423c-812a-0459abfa61a9 |
| App Settings | https://p.superdesign.dev/draft/caa116af-d072-4fc7-a7dd-fbbeab2d9f59 |
| App Settings (light) | https://p.superdesign.dev/draft/6d10e4e1-5734-4db1-8eb3-a9674939e877 |
