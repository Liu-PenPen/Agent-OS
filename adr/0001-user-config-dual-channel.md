# ADR 0001：用户配置双通道，密钥与集成绑定不进仓库

## Status

Accepted（设计访谈 round 1 确认）

## Context

开源后，维护者自己的 Gitee token、企业 ID、用户 ID、项目列表若留在仓库或可提交路径里，会泄露账号并让克隆者无法用自己的环境。现有机制已有根目录 `.env`（gitignore）与 `dataDir` JSON；设置页尚无 Gitee 表单项，项目白名单默认仍指向仓库旁 `config/gitee-projects.json`。

## Decision

1. **双通道**：用户可通过设置页填写，或通过本机环境变量 / `.env` 注入；仓库只提交 `.env.example` 与 `gitee-projects.example.json` 一类模板。
2. **第一期范围**：密钥与身份（token、enterpriseId、userId、可选 API base）+ 集成绑定（项目白名单、本地路径映射）。不把 Bot 种子等已有设置页能力重做一遍。
3. **未配置**：功能级降级，不强制引导锁死工作台。
4. **项目配置归属**：example 可进仓库；真实列表与 `localPath` 只存在 `dataDir`（或用户显式指向的本机路径）。
5. **信息架构**：在「应用偏好」内增加「集成 / Gitee」分组，密钥与项目绑定同组分区。

## Consequences

- 运行时读取顺序、UI 落盘格式、以及从现有根 `.env` 的迁移策略需在后续 ADR / 实现中明确。
- 打包后的 Tauri 用户通常没有「仓库根 `.env`」；双通道里 UI → `dataDir` 是桌面主路径，`.env` 主要服务克隆源码开发的用户。
- `docs/` 当前在 `.gitignore` 中，本 ADR 放在可提交的 `adr/`，避免设计决策无法随开源仓库分发。
