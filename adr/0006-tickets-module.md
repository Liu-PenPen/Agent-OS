# ADR 0006：工单模块设计定稿

> 状态：**已定稿**。变更需改 ADR 编号。  
> 由私有工作文档抽离到公开 `adr/`，供开源协作者理解工单 / Gitee 集成语义。

## 信息架构

```
左：工作区 / 话题
中：话题聊天（执行场）
右：工单 Inbox（输入源）
    ├─ 项目切换 + 待办列表（迭代分组）
    ├─ 每条工单：主按钮「交给 CEO」（必选入口）；点卡片 → 详情浮层
    ├─ 列表：迭代分组内按优先级高→低
    └─ 图标「工单状态」→ 浮层：流水线、引擎、工作目录（与详情分离）
独立：工单/项目「配置」（Bot 参与集、本地目录、默认引擎）
可选：聊天 /gitee 快捷打开右栏
```

**迁出右栏的原「流水线状态 / 工作环境」**：不再常驻右栏；改为工单上下文下的「工单状态」图标查看。不展示 Git 远程地址。

---

## 词汇表

| 术语 | 含义 |
|------|------|
| **工单 Ticket** | Gitee 企业 Issue（待办 Inbox 条目） |
| **工单项目 Project** | 企业项目（program），默认从 Gitee API 拉取；可选 `gitee-projects.json` 做白名单；本地目录 / 引擎 / Cast 写在 `data/gitee-project-settings.json` |
| **参与集 Cast** | 本项目允许上场的 Bot 角色；CEO 调度时的白名单 |
| **交给 CEO** | 唯一主操作：新建话题 + 派发 CEO（必选） |
| **工单状态** | 图标入口：查看当前工单/项目的流水线阶段、引擎、工作目录 |
| **工单详情** | 点卡片展开的 Issue 内容：描述、优先级、创建人、时间范围、链接 |
| **附图灯箱** | 详情内放大看图（应用内）；可另开系统浏览器看原图 |
| **派发补充** | 详情底「补充说明」；仅本次交给 CEO 写入 prompt，不持久化 |

本地规格 `ticketsPath` / `implement-ticket` **不是** Gitee 工单。

---

## ADR

### ADR-1 入口与布局

- **决策**：右栏以工单 Inbox 为主；独立配置面管理项目信息；可选命令快捷入口。
- **理由**：桌面适合列表浏览；话题保留为执行场；多项目本地路径不同，环境信息必须挂在工单/项目上，而非全局右栏。

### ADR-2 列表范围

- **决策**：默认「指派给我 + 待办」，按迭代分组；设置可切换更广范围（全量）。
- **理由**：对齐 agent-os `/gitee` 首版；全量作进阶。

### ADR-3 派发与 Cast

- **决策**：
  1. **主按钮固定为「交给 CEO」**，不可改成旁路。
  2. 项目配置里设定 **Cast（参与 Bot）**、**工作目录**、**引擎**。
  3. 协作语义取混合白名单：**始终先 CEO**；CEO 后续 `dispatch_task` **只能派给 Cast 内角色**（Cast 为空则不限制，等同全团队）。
- **理由**：保住 Team Leader 边界；「只选某些 Bot」= 缩窄可派发集合，不是跳过 CEO。
- **不做（首版）**：无 CEO 的纯自动链；主按钮改成直接派开发。

### ADR-4 Topic 绑定

- **决策**：每次「交给 CEO」**新建话题**；标题=`{ident} {标题}`；消息/元数据含 Gitee URL、ident、所属项目、工作目录、引擎、Cast。
- **理由**：隔离上下文、可追溯；避免同项目多工单互相污染。

### ADR-5 Gitee 写回

- **决策**：允许在工单 Inbox 写回 Gitee `issue_state`（「改状态」）；本轮不做评论写回。
- **理由**：任务看板完成后需对照工单改 Gitee 状态；评论写回留后续规格。

### ADR-6 项目级运行时配置

- **决策**：配置挂在 **工单项目（Gitee Program）** 上，不是每张 Issue 单独一套（Issue 继承项目配置）。字段至少：
  - `localPath`：本地工作目录（必填才可派发）
  - `defaultEngine`：`claude` | `codex`
  - `cast`：角色 id 列表（可空=全员）
- **理由**：用户明确「工单里有多个项目，每个项目本地地址不一样」；引擎与目录是项目属性。
- **派发前校验**：缺 `localPath` → 引导去配置，不创建话题。

### ADR-7 「工单状态」图标

- **决策**：右栏提供「工单状态」图标；点击展示：
  - 该工单所属项目的流水线进展（若已派发并有 topic/pipeline）
  - 当前引擎
  - 工作目录（`localPath`）
  - **不展示** Git remote URL
- **未派发时**：显示项目配置中的目录/引擎 +「尚未派发」空态。
- **落点**：右栏标题区或当前选中工单行的状态图标（实现可选；优先标题区 + 跟随当前选中工单）。

### ADR-8 工单详情（2026-09-22 定稿）

- **入口**：点卡片主体 → 右侧浮层/抽屉展开 **Issue 详情**（「交给 CEO」仍留在卡上）。
- **加载**：点开时再调 Gitee Issue 详情 API（列表保持轻量）。
- **首版字段**：描述、优先级、创建人、计划开始 / 截止时间、Gitee 链接。
- **与「工单状态」**：分开。详情看 Issue 内容；状态图标看执行态（流水线/引擎/目录）。
- **写回**：详情浮层只读 Issue 内容；改 Gitee 状态仅在 Inbox（沿用 ADR-5）。
- **附加**：详情内提供「在 Gitee 打开」。

### ADR-9 列表按优先级排序

- **决策**：Inbox 在**每个迭代分组内**，按优先级从高到低排序；同优先级再按 ident。
- **展示**：卡片上显示优先级徽章（如「紧急 / 主要 / 次要」），便于扫读。
- **数据**：待办列表接口需带回 `priority`（及可排序权重）；映射以 Gitee `priority_human` 为准。
- **不做（首版）**：跨迭代全局混排；用户自定义拖拽排序。

### ADR-10 交给 CEO 的上下文（标题不够）

- **问题**：仅标题时 CEO 无法理解任务；描述里常含截图/示意图。
- **决策**：
  1. 派发前 **必须再拉一次 Issue 详情**（不依赖列表缓存）。
  2. 写入 CEO prompt 至少包含：项目、迭代、ident、标题、**完整描述**、Gitee URL、工作目录、引擎、Cast（**不含**优先级/创建人/计划时间——详情浮层已展示，派发不必重复）。
  3. **图片**：从描述中解析附图（markdown / HTML `img`）；用当前 token **下载到** `{localPath}/.ml-aos/tickets/{ident}/`，prompt 中列出本地路径，便于引擎 `Read`；下载失败则附上原始 URL 并注明需人工打开链接。
  4. 描述为空时明确写「（无描述）」，避免 CEO 臆造需求。
- **不做（首版）**：把图片嵌进聊天气泡 UI；改 Gitee 描述。

### ADR-11 附图灯箱（2026-09-22 定稿）

- **决策**：详情内点缩略图 → **应用内灯箱**放大（桌面 WebView 内层，不依赖再开一套浏览器）。
- **附加**：灯箱提供「在系统浏览器打开原图」（Tauri / OS 用默认浏览器打开图片 URL）。
- **说明**：ml-aos 是桌面壳 + 内嵌页面；日常浏览工单不需要单独「浏览器窗口」。只有点「在 Gitee 打开 / 打开原图」时才会调系统默认浏览器。
- **多图**：同一工单多附图时可在灯箱内切换；Esc / 点遮罩关闭。
- **文案**：Markdown 默认 alt（如「输入图片说明」）不展示为可编辑框；无意义 alt 可隐藏。

### ADR-12 派发补充说明（2026-09-22 定稿）

- **问题**：Gitee 描述可能不准，用户要临时纠偏后再交给 CEO。
- **入口**：工单**详情浮层底部**常驻「补充说明」多行输入（方案 B）；列表上点「交给 CEO」时，若尚未打开详情，先打开详情或带上当前已填补充（实现取：从详情状态读取；无则空）。
- **进 prompt**：补充非空时，**追加在 Gitee 描述后面**一节「用户补充」，不宣称覆盖描述（方案 B）。
- **持久化**：不落库、不写 Gitee（方案 A）；关掉详情即丢，除非本次已派发进 prompt/系统消息。
- **可空**：可不填直接派发（方案 A）。
- **不做**：写回 Issue、按 issue 记忆草稿。

---

## 领域模型

```
GiteeProjectConfig {
  id, name, programId, ident,
  localPath?,
  defaultEngine: claude|codex,
  cast: Role[]           // 空 = 不限制
}

TicketSummary (list) {
  id, ident, title, state, sprint, url, programId,
  priority, priorityRank   // 用于排序与徽章
}

TicketDetail (lazy) {
  ...TicketSummary,
  description,           // markdown/html 原文
  authorName,
  planStartedAt?, deadline?,
  imageUrls[]            // 解析自 description
}

Dispatch {
  ticketId,
  topicId,
  projectId,
  targetBot: ceo,        // 主路径固定
  castSnapshot: Role[],
  localPath, engine,
  at
}

Topic.meta? {
  source: "gitee",
  issueIdent, issueUrl, projectId
}
```

---

## 首版范围 / 非目标

**做**

- 右栏 Inbox + 项目切换 + 迭代分组待办
- 组内按优先级高→低排序 + 优先级徽章
- 点卡片查看详情浮层（描述 / 优先级 / 创建人 / 时间 / 链接）；附图可灯箱放大
- 详情底「补充说明」→ 交给 CEO 时追加进 prompt（可空、不持久化）
- 项目配置（目录 / 引擎 / Cast）
- 「交给 CEO」→ 新话题 + CEO 派发（prompt 含完整描述、可选补充、与本地附图路径）
- Inbox「改状态」写回 Gitee `issue_state`（不做评论写回）
- 「工单状态」查看流水线 + 引擎 + 目录 + 最近验收
- 真实验收：见 [0005-acceptance-gate.md](./0005-acceptance-gate.md)（submit_acceptance / baseURL / Playwright 套件）
- env + 远程 programs 列表；可选白名单 JSON；localPath/engine/cast/test* 落 data/

**不做**

- Gitee 评论写回（状态写回见 ADR-5）
- 主按钮旁路 CEO
- 右栏常驻 Git URL / 旧版「工作环境」整块
- 飞书用户映射
- 跨迭代按优先级混排

---

## 验收标准（产品）

1. 右栏能切换 Gitee 项目并看到我的待办（按迭代分组；组内优先级高→低）。
2. 点卡片可看到描述、优先级、创建人、计划/截止时间；附图可灯箱放大；可打开 Gitee。
3. 详情可填「补充说明」；交给 CEO 时追加进 prompt；不填也可派发；不写回 Gitee、不落本地草稿。
4. 未配置目录时点「交给 CEO」会提示去配置，不产生空话题。
5. 「交给 CEO」后话题首条/prompt 含完整描述（及非空补充）；有图则工作目录下出现 `.ml-aos/tickets/{ident}/` 文件且 prompt 引用路径。
6. 配置 Cast=[developer,tester] 后，CEO 派发目标若不在 Cast 内应被拒绝或提示（实现时在 handoff/守卫层约束）。
7. 「工单状态」只显示引擎与工作目录，无 Git URL；与详情浮层分离。
8. 每次交给 CEO 都新建话题，且能从话题追溯 Issue 链接。

---

## 接入说明（实现）

1. 凭证：设置页「集成 / Gitee」，或本机 `.env` 的 `ML_AOS_GITEE_TOKEN` / `ML_AOS_GITEE_ENTERPRISE_ID` / `ML_AOS_GITEE_USER_ID`（旧名 `MI_CLAW_*` 仍兼容）
2. **不必**写死 `gitee-projects.json`：右栏会调 Gitee `/{enterprise}/programs` 拉已加入项目；点「↻」可刷新
3. 可选：复制 `config/gitee-projects.example.json` → 本机白名单（默认 `dataDir/gitee-projects.json`；见 ADR 0001–0003）
4. Runtime 启动时自动 `loadDotEnv()`；右栏拉 `/api/tickets/*`；详情 `GET /api/tickets/projects/:id/issues/:issueId`
5. 本地目录 / 引擎 / Cast 落在 `data/gitee-project-settings.json`；派发记录在 `data/gitee-dispatches.json`
