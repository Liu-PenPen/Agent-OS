---
name: grill-me
description: 在动手实现前澄清目标、范围、边界和验收标准。
disable-model-invocation: false
---

# Grill Me

先阅读项目和用户的原始需求，一次性找出当前已经可预见、且真正会改变实现方案的未决问题。此时不要写代码，也不要假装已经向用户提过问题。

如果信息不足，必须调用 Agent OS 提供的 MCP 工具 `request_clarification`（server=`agent_os`），把问题交给确认卡点选。不要在最终回复里粘贴问题 JSON，也不要用 Markdown 代码块模拟工具调用。

在 Codex 中，MCP 工具默认不直接出现在首屏工具列表里。必须先调用 `tool_search` 搜索 `request_clarification` 或 `agent_os`，把工具加载出来后再调用；不能因为首屏看不到就改用文本提问。

禁止使用 `request_user_input`、AskUserQuestion 或任何终端交互等待回答；这些在 `codex exec` / Default 模式下会报 unavailable。唯一合法入口是 `request_clarification`。

如果 `tool_search` 之后仍找不到 `request_clarification`，在回复里明确说明 MCP 未加载成功，仍然不要退回到输出结构化选项文本。

工具参数应包含：

- `title`：本轮澄清主题；
- `intro`：说明为什么需要用户确认；
- `questions`：需要用户回答的问题，每题包含 `id`、`prompt`、`recommendedOptionId` 和 `options`。

约束：

- 默认在首张卡片集中提出全部当前可预见的关键问题，通常为 3～5 个；确实只有 1～2 个时按实际数量提问，不要为凑数量添加无关问题。
- 一次最多提出 5 个关键问题，每个问题提供 2～4 个互斥、具体的选项。不得为了“一次只问一个”而拆成多张卡片。
- 不要询问用户想采用批量还是逐题澄清；本 Skill 的默认节奏就是批量澄清。
- 只有后续问题依赖本轮答案、在本轮确实无法合理提出时，才允许发送第二张澄清卡。不要把本轮已可预见的问题留到下一张卡。
- 每个问题都用 `recommendedOptionId` 指向一个推荐选项；用户可以把单题或全部剩余问题交给 Agent 按推荐方案决定。
- 不要添加“其他”选项，卡片会自动提供自定义输入框。
- `id` 只使用小写字母、数字、下划线和连字符。
- 不要在工具调用之外重复问题、选项、分析报告或表格。
- 工具调用成功后立即结束本轮，不再输出普通回答，等待用户通过确认卡作答。
- 不要调用终端交互来等待回答。

收到卡片答案后，结合原会话上下文继续判断。如果仍有关键歧义，可以再次调用 `request_clarification`；信息足够时，写入规格文件并调用 `request_spec_approval`，不要把任务交给开发。
