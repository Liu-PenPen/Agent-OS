---
name: product-spec
description: 把已澄清的需求写成工作区内唯一权威的产品规格 + Tickets，并提交确认卡。
---

# Product Spec（ML AOS）

在目标、范围、验收标准已聊清楚后，生成**唯一**权威产物，并交给用户确认。

## 交付

1. 在当前工作区写入规格文档（推荐：`docs/product-spec.md`）。
2. 文档必须同时包含：
   - **产品说明**：目标、范围、非目标、验收标准
   - **实现任务（Tickets）**：纵向可独立验收的切片；每项含用户可观察行为、验收标准、被阻塞依赖
3. 同一任务已有规格时**更新原文件**，不要维护两份方案。
4. 不要写入 `.scratch`、重复的 issues 清单作为第二权威源。
5. 写完文件后**必须**调用 MCP 工具 `request_spec_approval`（server=`agent_os`）：
   - `deliveryMode=local`
   - `specPath` / `ticketsPath`（同一文件可填两次）
   - `title` / `summary`
6. 工具调用成功后立即结束本轮，等待用户在确认卡上批准。**禁止**把任务交给开发，也禁止声称系统会自动开工。
7. 若环境具备飞书 `lark-cli` / `lark-doc`，可改为 `deliveryMode=lark-doc` 并提交真实 `documentUrl`。

## 边界

- 只提交待确认产物，不实现代码，不派发其他成员执行。
- 回复只给简短摘要 + 路径/链接，不要把整份方案贴进聊天。
