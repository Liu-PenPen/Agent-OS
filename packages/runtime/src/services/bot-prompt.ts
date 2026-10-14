/*
 * @Author: 刘书记
 * @Date: 2026-09-20 17:53:29
 * @Description: 努力搬砖的小花花
 */
import type { BotConfig, SkillBinding } from "@ml-aos/shared";

/** Compose system instructions + skill load rules + task (agent-os style). */
export function buildBotPrompt(
  bot: Omit<
    Pick<BotConfig, "name" | "role" | "instructions" | "skills">,
    "skills"
  > & { skills?: Array<string | SkillBinding> },
  taskPrompt: string,
): string {
  const skills = bot.skills ?? [];
  const role = bot.role.toLowerCase();
  const handoffHint =
    role === "ceo"
      ? "协作：你是 Team Leader。把工作交给成员时必须实际调用 MCP 工具 dispatch_task（server=agent_os），targetBotId 用 product、developer、tester 或 reviewer，并写上 objective、instruction、expectedOutput。口头「已交给某某」不会派发。禁止自己写规格或代码；禁止让用户点击「启动流水线」或不存在的按钮。成员交回结果后由你继续 dispatch_task 或向用户简短收尾。定时任务用 schedule_manage。"
      : role === "product"
        ? "协作：不要把任务派给开发。需要用户拍板时必须调用 request_clarification，不要在正文里写选项列表，也不要使用 request_user_input。规格写入文件后必须实际调用 request_spec_approval（deliveryMode=local，提交 specPath 与 ticketsPath），然后停止等待用户在确认卡上批准。不要声称「已交给开发」或「系统会自动开工」。"
        : role === "developer" || role === "tester" || role === "reviewer"
          ? "协作：完成本阶段后停止。不要把任务交给下一位；结果会交回 CEO，由 CEO 调用 dispatch_task 继续。删除、重启、改生产配置或写数据库之前必须调用 request_approval，通过后再执行。测试失败要写出失败项和截图路径；审查不通过要写 REVIEW_FAILED。"
          : "";
  const skillSection =
    skills.length > 0
      ? [
          "Skill 加载：下列文件在本机用户技能库。先 Read 再按文件执行。确认卡、规格审批和角色交接以本提示里的系统指令为准。",
          ...skills.map((skill) => {
            if (typeof skill === "string") {
              return `- $${skill}：尚未安装。不要执行这个 Skill。`;
            }
            if (skill.status === "ready" && skill.localPath) {
              return `- $${skill.id}：先 Read \`${skill.localPath}\`，再按该文件执行。`;
            }
            return `- $${skill.id}：未就绪（${skill.error ?? "未安装"}）。不要执行这个 Skill。`;
          }),
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
