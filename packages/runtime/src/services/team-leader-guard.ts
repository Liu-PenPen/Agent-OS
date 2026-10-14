import {
  findClarificationRequest,
  findDispatchTaskRequest,
  type DispatchTaskRequest,
  type ToolCallRecord,
} from "@ml-aos/shared";

/** Codex / Claude native implementation tools (not agent_os MCP). */
const IMPLEMENTATION_TOOL_NAMES = new Set([
  "Bash",
  "Edit",
  "Write",
  "MultiEdit",
  "NotebookEdit",
]);

const FEATURE_TASK_PATTERN =
  /(?:增加|添加|实现|开发|构建|创建|修改|修复|优化|展示|界面|功能|前端|后端|接口|页面|模块|系统)/u;

const VERBAL_DISPATCH_PATTERN =
  /(?:已派发|已交给|正式派发|承接成员|交给\s*`?product|dispatch_task|派发给\s*`?(?:product|developer)|启动流水线|@\s*开发工程师|@developer)/iu;

export function usedImplementationTools(
  toolCalls: ToolCallRecord[] | undefined,
): boolean {
  return (toolCalls ?? []).some((call) =>
    IMPLEMENTATION_TOOL_NAMES.has(call.name),
  );
}

export function looksLikeVerbalDispatch(answer: string): boolean {
  return VERBAL_DISPATCH_PATTERN.test(answer);
}

export function looksLikeFeatureTask(taskText: string): boolean {
  return FEATURE_TASK_PATTERN.test(taskText);
}

export function needsTeamLeaderDispatchCorrection(options: {
  answer: string;
  taskText: string;
  toolCalls?: ToolCallRecord[];
}): boolean {
  if (findDispatchTaskRequest(options.toolCalls)) return false;
  if (findClarificationRequest(options.toolCalls)) return false;
  return (
    usedImplementationTools(options.toolCalls) ||
    looksLikeVerbalDispatch(options.answer) ||
    looksLikeFeatureTask(options.taskText)
  );
}

export function buildTeamLeaderCorrectionPrompt(
  taskText: string,
  preferredTargetBotId = "product",
): string {
  const target = preferredTargetBotId.trim() || "product";
  return [
    "上一轮没有真正调用 MCP 工具 dispatch_task（server=agent_os）。",
    "文字里写「已派发 / 已交给 / 启动流水线 / @开发工程师」不会触发协作，Agent OS 不会通知对方。",
    "禁止运行 shell、禁止改文件。不要解释计划。禁止让用户点不存在的按钮。",
    "若工具列表没有 dispatch_task，先 tool_search 搜索 dispatch_task / agent_os，加载后再调用。",
    `立即调用 dispatch_task，targetBotId=${target}（本话题默认承接角色）。`,
    `用户原始需求：${taskText.slice(0, 1500)}`,
    "调用成功后立即结束本轮。",
  ].join("\n\n");
}

export function buildFallbackDispatchRequest(
  taskText: string,
  targetBotId = "product",
): DispatchTaskRequest {
  const cleaned = taskText.replace(/^@\S+\s*/u, "").trim();
  const objective = (cleaned || "推进用户需求").slice(0, 200);
  const forDeveloper = targetBotId.toLowerCase() === "developer";
  const instruction = [
    "这是 Agent OS 在 Team Leader 未实际调用 dispatch_task 时的自动兜底派发。",
    `用户原始需求：${cleaned || taskText}`.slice(0, 1800),
    forDeveloper
      ? "请按你的职责实现/修复并完成基础验证，写完后停止；结果会交回 CEO。"
      : "请按你的职责澄清需求并形成可验收的产品方案，完成后提交待确认产物。",
  ]
    .join("\n\n")
    .slice(0, 2000);
  return {
    targetBotId,
    objective,
    instruction,
    expectedOutput: forDeveloper
      ? "可验证的修复/实现结论"
      : "可确认的产品方案（含实现任务）",
  };
}

export type TeamLeaderDispatchSource = "tool" | "none" | "retry" | "fallback";

export interface TeamLeaderDispatchOutcome {
  request?: DispatchTaskRequest;
  source: TeamLeaderDispatchSource;
  /** When source is retry, caller should start a correction run and stop. */
  correctionPrompt?: string;
}

/**
 * Aligns with agent-os ensureTeamLeaderDispatch.
 * Retry is async in ml-aos: first call returns correctionPrompt; after correction
 * settle with still-no-tool, caller passes alreadyCorrected=true to get fallback.
 */
export function resolveTeamLeaderDispatch(options: {
  role: string;
  /** When CEO is answering a collaboration report-back, do not force dispatch. */
  inCollaboration: boolean;
  taskText: string;
  answer: string;
  toolCalls?: ToolCallRecord[];
  /** True when this settle is from a prior CEO correction run. */
  alreadyCorrected: boolean;
  defaultTargetBotId?: string;
}): TeamLeaderDispatchOutcome {
  if (options.role.toLowerCase() !== "ceo" || options.inCollaboration) {
    const existing = findDispatchTaskRequest(options.toolCalls);
    return {
      request: existing,
      source: existing ? "tool" : "none",
    };
  }

  const existing = findDispatchTaskRequest(options.toolCalls);
  if (existing) {
    return { request: existing, source: "tool" };
  }
  if (findClarificationRequest(options.toolCalls)) {
    return { source: "none" };
  }
  if (
    !needsTeamLeaderDispatchCorrection({
      answer: options.answer,
      taskText: options.taskText,
      toolCalls: options.toolCalls,
    })
  ) {
    return { source: "none" };
  }

  const preferred = options.defaultTargetBotId ?? "product";

  if (!options.alreadyCorrected) {
    return {
      source: "retry",
      correctionPrompt: buildTeamLeaderCorrectionPrompt(
        options.taskText,
        preferred,
      ),
    };
  }

  return {
    request: buildFallbackDispatchRequest(options.taskText, preferred),
    source: "fallback",
  };
}
