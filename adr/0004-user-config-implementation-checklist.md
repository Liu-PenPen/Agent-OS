# ADR 0004：用户配置 — 实现清单（设计收口）

## Status

Accepted（访谈结束，待实现）

## Summary

开源用户配置 = **双通道**（设置页 → `dataDir` + 环境变量 / 开发用根 `.env`），**env 优先**，token **明文落盘 + UI 遮罩**，未配置时 **功能降级**。详见 0001–0003 与根目录 `GLOSSARY.md`。

## Implementation checklist

### Runtime

- [ ] `resolveGiteeCredentials()`：`process.env`（含 `ML_AOS_*` 与 `MI_CLAW_*` / 旧别名）→ 否则 `dataDir` 存档
- [ ] Gitee client / routes 全部改走 resolver；缺凭证时错误文案指向设置页
- [ ] `dataDir` 存档文件（如 `gitee-credentials.json`）与项目列表默认路径迁到 `dataDir`
- [ ] 保留 `GITEE_PROJECTS_CONFIG` 进阶覆盖
- [ ] API：读集成设置（token 仅遮罩）、PATCH（空 token = 保留）、POST 测试连接、项目绑定 CRUD/编辑

### Desktop

- [ ] 应用偏好增加「集成 / Gitee」分组：token（遮罩）、enterpriseId、userId、可选 API base、测连通、获取 token 短说明
- [ ] 同组「项目绑定」：列表 + 本地路径等（对接现有工单项目配置能力，避免两套真相）
- [ ] 工单 / 定时拉单在缺凭证时展示去设置的入口

### Docs / repo hygiene

- [ ] 更新 `.env.example` 为 `ML_AOS_*`，注释旧名兼容与优先级
- [ ] README：双通道、安装版只走设置页、功能降级
- [ ] 确认 git 无真实密钥 / 真实 `gitee-projects.json`；example 可提交

## Non-goals（第一期不做）

- OS 钥匙串 / 应用层加密
- 根 `.env` 一键导入向导
- 强制引导页锁死工作台
- 单独「集成」导航页
