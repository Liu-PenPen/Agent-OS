# ADR 0005：真实验收门禁（L1 / L2 / L3）

> 状态：**已定稿并实现**。变更需改 ADR 编号。  
> 协作仍以 CEO `dispatch_task` 为中枢，**不**恢复系统自动 developer→tester→reviewer 链。  
> 由私有工作文档抽离到公开 `adr/`，便于开源协作者理解验收语义。

---

## ADR-A1 · Acceptance Gate（结构化门禁）

### 决策

1. tester 结束本轮前**必须**调用 MCP 工具 `submit_acceptance`，提交机读结果。
2. 结果同时落两处：
   - 运行时：`data/acceptance/{topicId}/{id}.json`（`id` 为每次提交的 UUID）
   - 工作区：`{localPath}/.ml-aos/acceptance/{id}.json`
3. 话题内发一张 **验收卡**（`appTool.tool = acceptance`），展示 verdict / checks / evidence。
4. `verdict=fail` → 沿用视觉 HITL（误判放行 / 确认缺陷）；`pass` / `skip` → 交回 CEO。
5. 未调用工具且正文像失败 → 仍开视觉 HITL；未调用且不像失败 → 纠正重试要求提交工具。

### 结果 schema（摘要）

| 字段 | 说明 |
|------|------|
| `verdict` | `pass` \| `fail` \| `skip` |
| `summary` | 一两句结论 |
| `checks[]` | `{ id, title, status, detail? }` |
| `evidence[]` | `{ kind: screenshot\|note\|url, path?\|text?\|url? }` |
| `baseURL` / `viewport` | 可选环境信息 |
| `source` | `agent-browser` \| `playwright` \| `manual` \| `skip` |
| `skipReason` | 仅 `skip` 时必填（如纯库无 UI） |

### 不做

- 不以「unit 通过 / 页面能打开」自动标 pass。
- 不把验收资产写进 ml-aos 仓库本体。

---

## ADR-A2 · 工作区浏览器验收（agent-browser 主路径）

### 决策

1. 项目运行时配置（`data/gitee-project-settings.json`）增加：
   - `testBaseUrl`：被测服务地址（可选）
   - `testStartCommand`：启服命令（可选，在工作目录执行）
2. CEO / 系统派给 tester 时，prompt **注入**上述环境与 Gate 要求。
3. tester 默认技能仍为 `$agent-browser`：对照规格抽出检查点 → 真浏览器操作 → 截图进 `.ml-aos/acceptance/` → `submit_acceptance`。
4. Cast 不含 `tester` 时，不强制本环；纯非 UI 项目允许 `verdict=skip` + 理由。

### 效果

工单项目可配置验收入口；每轮测试有可点开的结构化证据，而非仅聊天长文。

---

## ADR-A3 · 可选 Playwright 回归套件

### 决策

1. 套件**只住在被测工作区**，候选路径（先命中先用）：
   - `{localPath}/.ml-aos/acceptance/playwright.config.ts`
   - `{localPath}/acceptance/playwright.config.ts`
2. MCP / API：`run_acceptance_suite` → 在工作区跑 Playwright（JSON reporter）→ 映射为 ADR-A1 结果并落盘 + 出验收卡。
3. Midscene **可选**：若套件依赖 Midscene 且环境有 `MIDSCENE_MODEL_*`，由套件自身配置；ml-aos 不强制内置 Midscene 平台。
4. 无配置文件 → 明确报错，引导用 agent-browser（L2）或先建套件。

### 不做

- 不在 ml-aos 仓库维护客户项目用例。
- 不默认安装/启动 agent-os 的 `pnpm platform`。

---

## 协作衔接

```
CEO dispatch → tester
  → submit_acceptance / run_acceptance_suite
  → fail：视觉 HITL → 打回 developer 或误判后派 reviewer
  → pass/skip：交回 CEO → 可派 reviewer 或收尾
```

验收标准：

1. tester 可提交结构化结果，话题可见验收卡。
2. 项目配置可写 baseURL / startCommand，派测时进 prompt。
3. 工作区有 Playwright 配置时可一键跑套件并生成同一 schema 的结果。
