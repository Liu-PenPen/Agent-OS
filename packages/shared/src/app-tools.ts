import { z } from "zod";

export const APP_TOOL_NAMES = [
  "request_clarification",
  "dispatch_task",
  "request_spec_approval",
  "request_approval",
  "schedule_manage",
  "submit_acceptance",
  "run_acceptance_suite",
] as const;

export type AppToolName = (typeof APP_TOOL_NAMES)[number];

export interface ToolCallRecord {
  name: string;
  input?: unknown;
}

/** Claude exposes MCP tools as mcp__agent_os__request_clarification. */
export function normalizeToolName(name: string): string {
  const parts = name.split("__");
  if (parts.length >= 3 && parts[0] === "mcp") {
    return parts[parts.length - 1] ?? name;
  }
  return name;
}

const OptionSchema = z.object({
  id: z.string().regex(/^[a-z0-9_-]{1,32}$/),
  label: z.string().trim().min(1).max(100),
});

const QuestionSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9_-]{1,32}$/),
    prompt: z.string().trim().min(1).max(300),
    options: z.array(OptionSchema).min(2).max(4),
    recommendedOptionId: z.string().regex(/^[a-z0-9_-]{1,32}$/).optional(),
  })
  .superRefine((question, ctx) => {
    const optionIds = question.options.map((option) => option.id);
    if (new Set(optionIds).size !== optionIds.length) {
      ctx.addIssue({
        code: "custom",
        message: "同一道问题的选项 ID 不能重复",
        path: ["options"],
      });
    }
    if (
      question.recommendedOptionId &&
      !optionIds.includes(question.recommendedOptionId)
    ) {
      ctx.addIssue({
        code: "custom",
        message: "推荐项必须指向当前问题中的选项",
        path: ["recommendedOptionId"],
      });
    }
  });

export const ClarificationRequestSchema = z
  .object({
    title: z.string().trim().min(1).max(80).default("需求确认"),
    intro: z.string().trim().max(300).optional().default(""),
    questions: z.array(QuestionSchema).min(1).max(5),
  })
  .superRefine((request, ctx) => {
    const ids = request.questions.map((question) => question.id);
    if (new Set(ids).size !== ids.length) {
      ctx.addIssue({
        code: "custom",
        message: "同一份澄清请求的问题 ID 不能重复",
        path: ["questions"],
      });
    }
  });

export type ClarificationRequest = z.infer<typeof ClarificationRequestSchema>;

const BotIdSchema = z.string().regex(/^[a-z0-9][a-z0-9_-]{0,63}$/);

export const DispatchTaskRequestSchema = z.object({
  targetBotId: BotIdSchema,
  objective: z.string().trim().min(1).max(200),
  instruction: z.string().trim().min(1).max(2000),
  expectedOutput: z.string().trim().min(1).max(500).optional(),
});

export type DispatchTaskRequest = z.infer<typeof DispatchTaskRequestSchema>;

const WorkspacePathSchema = z
  .string()
  .trim()
  .min(1)
  .max(240)
  .refine(
    (value) => !value.startsWith("/") && !value.split(/[\\/]/).includes(".."),
    "文档路径必须位于当前工作目录内",
  );

export const ProductSpecRequestSchema = z.discriminatedUnion("deliveryMode", [
  z
    .object({
      deliveryMode: z.literal("local"),
      title: z.string().trim().min(1).max(80),
      summary: z.string().trim().min(1).max(500),
      specPath: WorkspacePathSchema,
      ticketsPath: WorkspacePathSchema,
    })
    .strict(),
  z
    .object({
      deliveryMode: z.literal("lark-doc"),
      title: z.string().trim().min(1).max(80),
      summary: z.string().trim().min(1).max(500),
      documentUrl: z.string().url(),
    })
    .strict(),
]);

export type ProductSpecRequest = z.infer<typeof ProductSpecRequestSchema>;

export const ApprovalRequestSchema = z.object({
  operation: z.string().trim().min(1).max(120),
  detail: z.string().trim().min(1).max(2000),
  impact: z.string().trim().min(1).max(500),
  rollback: z.string().trim().min(1).max(500),
});

export type ApprovalRequest = z.infer<typeof ApprovalRequestSchema>;

const ScheduleRuleSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("once"), runAt: z.string().min(1) }),
  z.object({
    kind: z.literal("interval"),
    everyMs: z.number().int().min(60_000).max(24 * 60 * 60 * 1000),
  }),
  z.object({
    kind: z.literal("cron"),
    expression: z.string().trim().min(1).max(100),
    timezone: z.string().trim().min(1).default("Asia/Shanghai"),
  }),
]);

export type ScheduleRule = z.infer<typeof ScheduleRuleSchema>;

const ScheduleAddSchema = z.object({
  targetBotId: BotIdSchema,
  prompt: z.string().trim().min(1).max(2000),
  rule: ScheduleRuleSchema,
});

export const ScheduleManageRequestSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("list") }),
  z.object({ action: z.literal("add") }).merge(ScheduleAddSchema),
  z.object({
    action: z.literal("addMany"),
    schedules: z.array(ScheduleAddSchema).min(1).max(20),
  }),
  z.object({
    action: z.literal("update"),
    id: z.string().trim().min(1).max(64),
    targetBotId: BotIdSchema.optional(),
    prompt: z.string().trim().min(1).max(2000).optional(),
    rule: ScheduleRuleSchema.optional(),
  }),
  z.object({ action: z.literal("remove"), id: z.string().trim().min(1).max(64) }),
  z.object({
    action: z.literal("removeMany"),
    ids: z.array(z.string().trim().min(1)).min(1).max(100),
  }),
  z.object({ action: z.literal("removeAll"), confirm: z.literal(true) }),
  z.object({ action: z.literal("run"), id: z.string().trim().min(1).max(64) }),
  z.object({ action: z.literal("pause"), id: z.string().trim().min(1).max(64) }),
  z.object({ action: z.literal("resume"), id: z.string().trim().min(1).max(64) }),
  z.object({
    action: z.literal("logs"),
    id: z.string().trim().min(1).max(64).optional(),
  }),
]);

export type ScheduleManageRequest = z.infer<typeof ScheduleManageRequestSchema>;

function lastParsed<T>(
  toolCalls: ToolCallRecord[] | undefined,
  toolName: string,
  schema: z.ZodType<T>,
): T | undefined {
  const calls = toolCalls ?? [];
  for (let index = calls.length - 1; index >= 0; index -= 1) {
    const call = calls[index];
    if (!call || normalizeToolName(call.name) !== toolName) continue;
    const parsed = schema.safeParse(call.input);
    if (parsed.success) return parsed.data;
  }
  return undefined;
}

export function findClarificationRequest(
  toolCalls: ToolCallRecord[] | undefined,
): ClarificationRequest | undefined {
  const calls = toolCalls ?? [];
  for (let index = calls.length - 1; index >= 0; index -= 1) {
    const call = calls[index];
    if (!call || normalizeToolName(call.name) !== "request_clarification") continue;
    const parsed = ClarificationRequestSchema.safeParse(call.input);
    if (!parsed.success) continue;
    return {
      title: parsed.data.title ?? "需求确认",
      intro: parsed.data.intro ?? "",
      questions: parsed.data.questions,
    };
  }
  return undefined;
}

export function findDispatchTaskRequest(
  toolCalls: ToolCallRecord[] | undefined,
): DispatchTaskRequest | undefined {
  return lastParsed(toolCalls, "dispatch_task", DispatchTaskRequestSchema);
}

export function findProductSpecRequest(
  toolCalls: ToolCallRecord[] | undefined,
): ProductSpecRequest | undefined {
  return lastParsed(toolCalls, "request_spec_approval", ProductSpecRequestSchema);
}

export function findApprovalRequest(
  toolCalls: ToolCallRecord[] | undefined,
): ApprovalRequest | undefined {
  return lastParsed(toolCalls, "request_approval", ApprovalRequestSchema);
}

export function calledScheduleManage(
  toolCalls: ToolCallRecord[] | undefined,
): boolean {
  return (toolCalls ?? []).some(
    (call) => normalizeToolName(call.name) === "schedule_manage",
  );
}

export function formatClarificationResume(answer: string): string {
  return [
    "用户已经通过确认卡回答了上一轮需求澄清。",
    answer.trim(),
    "请基于这些答案继续工作。如果仍有会实质影响方案的未决问题，再次调用 request_clarification；否则把规格写入工作区文件，并调用 request_spec_approval（deliveryMode=local，提交 specPath 与 ticketsPath）。不要把整份方案只贴在聊天里。",
  ].join("\n\n");
}

export function formatSpecDecision(
  approved: boolean,
  request: { title: string; summary: string },
): string {
  if (!approved) {
    return [
      "用户退回了产品方案，尚未确认。",
      `标题：${request.title}`,
      `摘要：${request.summary}`,
      "请按退回意见修改规格后，再次调用 request_spec_approval。不要开始写代码。",
    ].join("\n\n");
  }
  return [
    "用户已确认这份产品方案。",
    `标题：${request.title}`,
    `摘要：${request.summary}`,
    "请调用 dispatch_task 把实现交给 developer。不要自己写代码。",
  ].join("\n\n");
}

export function formatApprovalDecision(input: {
  approved: boolean;
  operation: string;
  detail: string;
}): string {
  return [
    input.approved
      ? "你的高危操作审批已通过。"
      : "你的高危操作审批已拒绝。",
    `操作：${input.operation}`,
    `详情：${input.detail}`,
    input.approved
      ? "请继续执行已批准的操作；完成后给出最终结论。"
      : "不要执行该操作。停止相关动作，把当前进展和阻塞原因汇报给用户。",
  ].join("\n\n");
}

export function looksLikeTestFailure(content: string): boolean {
  const text = content.trim();
  if (!text) return false;
  if (/全部通过|可以进入审查|测试通过|未发现失败/.test(text)) return false;
  return /未通过|测试失败|失败项|FAIL\b|断言失败/.test(text);
}

export function looksLikeReviewFailure(content: string): boolean {
  return /REVIEW_FAILED|审查不通过|打回|存在阻塞/.test(content);
}

/** Canonical markdown so the existing choice card can render a tool payload. */
export function clarificationToMarkdown(request: ClarificationRequest): string {
  const lines = [request.intro, ""];
  request.questions.forEach((question, index) => {
    lines.push(`问题 ${index + 1}：${question.prompt}`);
    for (const option of question.options) {
      const recommended = option.id === question.recommendedOptionId ? "（推荐）" : "";
      lines.push(`选项 ${option.id.toUpperCase()}：${option.label}${recommended}`);
    }
    lines.push("");
  });
  return lines.join("\n").trim();
}
