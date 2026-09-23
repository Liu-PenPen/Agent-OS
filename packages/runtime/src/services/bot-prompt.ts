/*
 * @Author: 刘书记
 * @Date: 2026-09-20 17:53:29
 * @Description: 努力搬砖的小花花
 */
import type { BotConfig } from "@ml-aos/shared";
import { normalizeSkillIds } from "./skill-paths.js";

/** Compose system instructions + skill load rules + task (agent-os style). */
export function buildBotPrompt(
  bot: Pick<BotConfig, "name" | "role" | "instructions" | "skills">,
  taskPrompt: string,
): string {
  const skills = normalizeSkillIds(bot.skills);
  const role = bot.role.toLowerCase();
  const handoffHint =
    role === "ceo"
      ? "协作：你是 Team Leader。把工作交给成员时必须实际调用 MCP 工具 dispatch_task（server=agent_os），targetBotId 用 product、developer、tester 或 reviewer，并写上 objective、instruction、expectedOutput。口头「已交给某某」不会派发。禁止自己写规格或代码。成员交回结果后由你继续 dispatch_task 或向用户简短收尾。定时任务用 schedule_manage。"
      : role === "product"
        ? "协作：不要把任务派给开发。需要用户拍板时必须调用 request_clarification，不要在正文里写选项列表，也不要使用 request_user_input。规格写入文件后必须实际调用 request_spec_approval（deliveryMode=local，提交 specPath 与 ticketsPath），然后停止等待用户在确认卡上批准。不要声称「已交给开发」或「系统会自动开工」。"
        : role === "developer" || role === "tester" || role === "reviewer"
          ? "协作：完成本阶段后停止。不要把任务交给下一位；结果会交回 CEO，由 CEO 调用 dispatch_task 继续。删除、重启、改生产配置或写数据库之前必须调用 request_approval，通过后再执行。测试失败要写出失败项和截图路径；审查不通过要写 REVIEW_FAILED。"
          : "";
  const skillSection =
    skills.length > 0
      ? [
          "项目 Skill 加载规则（优先级不可颠倒）：",
          "- 对配置中声明的每个 Skill，先读取当前工作区 `.agents/skills/<skill>/SKILL.md`。",
          "- 上述路径不存在时，再读取当前工作区 `.claude/skills/<skill>/SKILL.md`。",
          "- 只有两个工作区路径都不存在时，才允许回退到用户级或全局同名 Skill；不得因全局同名而跳过工作区版本。",
          `- 本次任务必须执行的 Skill：${skills.map((s) => `$${s}`).join("、")}`,
          "- 先 Read 对应 SKILL.md 再按其中流程执行；不要只凭记忆跳过 Skill。",
        ].join("\n")
      : "";

  const sections = [
    `你的名称：${bot.name}`,
    `你的角色标识：${bot.role}`,
    bot.instructions.trim(),
    handoffHint,
    skillSection,
    "输出规则：使用简洁中文；先结论后依据。需要用户决策时必须调用 request_clarification，禁止在正文里手写选项；调用后停止，等待用户点选。在 Codex 中若工具列表没有显示 request_clarification / request_spec_approval，先调用 tool_search 搜索 agent_os 再调用。",
    `当前任务：\n${taskPrompt.trim()}`,
  ];
  return sections.filter(Boolean).join("\n\n");
}
