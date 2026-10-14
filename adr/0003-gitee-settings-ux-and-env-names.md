# ADR 0003：Gitee 设置 UX、环境变量命名与开源交付线

## Status

Accepted（设计访谈 round 3 确认）

## Context

在双通道与优先级（ADR 0001 / 0002）之上，还需定：对外环境变量名、遮罩保存语义、是否提供测连通、项目白名单路径策略，以及第一期「可开源」的完成定义。

## Decision

1. **环境变量命名**：对外文档与示例使用中性前缀 `ML_AOS_*`（如 `ML_AOS_GITEE_TOKEN`、`ML_AOS_GITEE_ENTERPRISE_ID`、`ML_AOS_GITEE_USER_ID`）。读取时 **`MI_CLAW_*` / 既有别名仍有效**，保证现有根 `.env` 不用立刻改名。
2. **保存语义**：token 输入为空或仍为遮罩占位且用户未点「清除」时，**不覆盖** `dataDir` 中已存 token。
3. **测连通**：应用偏好 → 集成 / Gitee 提供「测试连接」；用当前有效凭证（优先级见 ADR 0002）打一次轻量 Gitee API，失败返回可读原因（缺项 / 401 等）。
4. **项目白名单**：默认读写 `dataDir` 内文件，并由设置页编辑；`GITEE_PROJECTS_CONFIG`（及未来的 `ML_AOS_` 等价名若需要）保留为进阶本机路径覆盖。仓库只保留 `gitee-projects.example.json`。
5. **第一期交付**：设置页可配置密钥与项目绑定；README + `.env.example` 写清双通道与优先级；设置页内附简短「如何获取 Gitee token」说明。不做根 `.env` 一键导入向导。

## Consequences

- `packages/runtime` 的 Gitee client / projects store 改为统一 credential resolver；设置 API 需支持读回遮罩视图、补丁更新、test-connection。
- 开源检查清单：确认无真实 token / 企业项目列表进 git；`.env` 保持 ignore；example 与 README 同步新变量名。
