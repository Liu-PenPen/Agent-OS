# ML AOS 任务看板 + Gitee 改状态 · 设计规格

**日期**: 2026-09-23  
**仓库**: `E:\Python_Project\ml-aos`（全部能力仅落本仓；不改飞书版 `agent-os`）  
**状态**: 已批准（2026-09-23）  
**关联**: 取代 `docs/tickets-module-grill.md` 中 **ADR-5（Gitee 写回首版不做）**

---

## 1. 背景与目标

用户需要：

1. 在工单 Inbox 里，「交给 CEO」旁能 **改 Gitee 工作项状态**（人点选目标状态）。
2. 有 **全局任务看板**（桌面侧栏新菜单页），看清哪些任务已完成，以便对照工单列表去改状态。

成功标准：使用者打开「任务看板」能分辨进行中 / 已完成 / 失败；对已完成且关联 Gitee 的条目，回到工单列表点「改状态」写回企业，无需靠记忆。

---

## 2. 已确认决策

| 项 | 决策 |
|----|------|
| 工程边界 | **仅 ml-aos**；零改动飞书 `agent-os` |
| 本轮范围 | 任务账本 + 侧栏「任务看板」页 + 工单「改状态」 |
| 不做 | 看板内改 Gitee、交付/发版层、写回评论、确定性状态机大重构（可另开） |
| 完成判定 | 流水线自然结束（回传结束且不再派发 / `pipelineStage === completed`）→ 账本 `completed` |
| 改状态交互 | 每次弹出该工作项类型的可选状态列表（B），人单选后确认 |
| 看板载体 | `apps/desktop` 侧栏新菜单，路由 `/board`；不是独立端口站 |
| 改状态入口 | 仅工单 Inbox（「交给 CEO」旁）；看板只做对照与详情 |
| 架构方案 | 方案 1：宿主任务账本 + 桌面看板页 + Inbox 确定性改状态 |
| 视觉 | 参考「顶栏摘要 + 左列表 + 右详情」信息结构；遵守 `PRODUCT.md`：**克制摘要，避免 SaaS 大数字营销卡** |

---

## 3. 与现有能力的关系

| 已有 | 本规格用法 |
|------|------------|
| `TicketInbox` /「交给 CEO」 | 旁加「改状态」按钮 |
| `TicketStatusPopover`（流水线轨） | 保留；不替代「改 Gitee 状态」 |
| `gitee-dispatches.json` | 作为工单 ↔ `topicId` 绑定源；账本 `gitee` 字段与之对齐 |
| `PipelineService` / `topic.pipelineStage` | **完成判定与阶段展示的权威源**；账本同步写入，避免双真相 |
| `TicketService` + `gitee/client.ts` | 扩展：列状态、更新 `issue_state_id` |
| 侧栏导航 | 增加「任务看板」 |

**ADR-5 修订**：允许人在 Inbox 写回 Gitee `issue_state`；仍不做评论写回（本轮）。

---

## 4. 数据面 · 任务账本

### 4.1 存储

- 路径：`data/task-board.json`（runtime `dataDir` 下）
- 形状：`{ tasks: BoardTask[] }`，Zod 校验

### 4.2 `BoardTask`（MVP）

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | string | 稳定 ID。Gitee 派发：`gitee:{programId}:{ident}`；纯话题流水线：`pipeline:{pipelineId}` 或 `topic:{topicId}` |
| `title` | string | 展示标题 |
| `status` | `running` \| `completed` \| `failed` | 看板主状态 |
| `source` | `gitee` \| `pipeline` \| `direct` | 来源 |
| `gitee?` | object | `{ programId, issueId, issueIdent, url, issueTypeId?, lastSyncedStateId?, lastSyncedStateTitle?, lastSyncedAt? }` |
| `topicId?` | string | 关联话题 |
| `pipelineId?` | string | 关联流水线 |
| `botId?` | string | 当前/最后执行 bot |
| `stage?` | string | 对齐 `pipelineStage`（developing / testing / …） |
| `tokens?` | object | `{ input?, output?, total? }` 有 CLI stats 则累加 |
| `failureReason?` | string | 枚举见下 |
| `createdAt` / `updatedAt` / `completedAt?` | ISO string | |

**failureReason 枚举（MVP）**：`cli_crash` \| `user_reject` \| `timeout` \| `pipeline_blocked` \| `unknown`

### 4.3 写入时机（确定性，不靠 Prompt）

1. **派发开始**：`TicketService`「交给 CEO」成功，或流水线进入非 `idle` → upsert `running`，带上 `gitee`（若有）。
2. **阶段推进**：`PipelineService` / runner 更新 `pipelineStage` → 同步 `stage`、`botId`、`updatedAt`。
3. **完成**：`pipelineStage`（或等价）变为 `completed` → `status=completed`，写 `completedAt`。
4. **失败 / 阻塞**：进入 `blocked` 或 CLI 崩溃路径 → `status=failed`（blocked 可映射为 `failed` + `failureReason=pipeline_blocked`），或保留 `running`+stage=blocked——**本规格选定：`blocked` → `failed` + `pipeline_blocked`**，便于看板筛选「需关注」。
5. **Gitee 改状态成功**：只更新 `gitee.lastSynced*`，不改变 `status`（通常已是 `completed`）。

### 4.4 API（runtime）

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/board/tasks` | 列表；query：`status?`、`source?` |
| GET | `/api/board/summary` | `{ running, completed, failed, tokensToday }` |
| GET | `/api/tickets/:issueId/states` | 该 issue 可用状态列表（需 program / type 上下文，实现时用 query 或 path 约定） |
| POST | `/api/tickets/:issueId/state` | body：`{ projectId, issueStateId }` → 调 Gitee update；成功写账本 `lastSynced*` |

具体 path 命名实现时可与现有 `registerTicketRoutes` 风格对齐（集中在 tickets / board 路由模块）。

---

## 5. UI · 任务看板页

### 5.1 导航

- `Sidebar`：`NavLink to="/board"` 文案 **「任务看板」**（位置建议在「待确认」与「定时任务」之间）。
- `App.tsx`：`<Route path="board" element={<TaskBoardPage />} />`。

### 5.2 布局

落在现有 `AppLayout` 主内容区：

```text
┌─ 顶栏：标题 + 一句话说明 + 健康态（无 failed=状态良好 / 有=需关注）─┐
├─ 摘要条：进行中 | 已完成 | 失败 | 今日 token（克制，非营销大卡）──────┤
├─ 左列表（约 2/3）────────────┬─ 右详情（约 1/3）─────────────────────┤
│ 筛选：全部/进行中/已完成/失败 │ 标题、阶段轨、话题、工单链接、          │
│ 行：标题 · 来源 · bot · 状态  │ 失败原因、token、时间；                 │
│ 已完成且有 gitee 且无同步痕迹 │ **无「改 Gitee 状态」按钮**             │
│ → 徽章「待改状态」            │                                       │
└──────────────────────────────┴───────────────────────────────────────┘
```

- 数据：`api.boardTasks` / `api.boardSummary`；轮询约 5s 或窗口 focus 时刷新。
- 视觉：沿用 ML AOS token / 间距；实现时可用 frontend-design 细化，但不得违背 `PRODUCT.md` 反模式。

### 5.3 本页不做

- 改 Gitee 状态、发起派发、编辑 pipeline。

---

## 6. UI · 工单改状态

### 6.1 Inbox 行操作

每条工单主操作区：

- 保留：**交给 CEO**
- 新增：**改状态**（次按钮 / ghost）

### 6.2 交互

1. 点「改状态」→ 请求可用状态列表（按该 issue 的 `issue_type`）。
2. 弹出层（Popover / Sheet，风格对齐现有 `TicketStatusPopover`）：单选状态 + 确认 / 取消。
3. 确认 → `POST` 更新 Gitee；成功 toast/notice「已同步：{状态名}」；失败展示 API 错误原文摘要。
4. 成功后：刷新 Inbox 列表该项 `stateTitle`；若账本有对应 task，写 `lastSynced*`。

### 6.3 鉴权与配置

复用现有 Gitee env（`MI_CLAW_GITEE_TOKEN` 等）与 MCP 风格 `User-Agent`；与 `listMyTodoIssues` 同一客户端。

---

## 7. Gitee 客户端扩展

在 `packages/runtime/src/gitee/client.ts`（及必要时 MCP 封装）增加：

1. **列出 issue 类型状态**：企业 API / 已有 MCP `list_issue_type_states` 等价调用；入参含 enterprise、issue_type_id（从 issue detail 取）。
2. **更新 issue 状态**：`issue_state_id`（对齐 MCP `update_enterprise_issue`）。

错误：非 2xx 抛出带 status + body 截断的 Error，由 UI 展示。

---

## 8. 明确不做（本规格）

- 飞书版 agent-os 任何改动
- 看板内写回 Gitee
- Gitee 评论写回
- 排队深度 / 并行度控制（仅摘要里可后续加「队列」字段占位，本轮可不实现）
- 跨会话项目记忆库
- 交付 / PR / 发版层
- 宿主「缺工具即 fallback」大重构（另开规格）

---

## 9. 验收标准

1. 侧栏可进入「任务看板」，摘要与列表反映 `running` / `completed` / `failed`。
2. 工单「交给 CEO」后，看板出现带 `gitee` 关联的 `running` 任务；流水线 `completed` 后看板为 `completed`。
3. Inbox「改状态」可选状态并写回 Gitee；成功后列表状态文案更新；账本有 `lastSynced*`。
4. 看板详情无改状态按钮；已完成未同步的行显示「待改状态」。
5. 相关单测：账本 upsert/完成映射；Gitee update 客户端（可 mock fetch）；可选组件测「改状态」确认调用 API。

---

## 10. 文档与后续

- 实现后更新 `docs/tickets-module-grill.md` ADR-5 为「人机 Inbox 可改状态；不做评论」。
- 确定性调度加固、看板 token 精度与并行度可视化 → 后续规格。

---

## 11. Spec 自检

- [x] 无 TBD/占位未决（path 允许实现期与现有 routes 对齐）
- [x] 与 ADR-5 冲突已显式修订
- [x] 完成判定与「仅 Inbox 改状态」无矛盾
- [x] 范围未混入交付层 / agent-os
- [x] `blocked` → 看板 `failed` 已选定，避免双解释
