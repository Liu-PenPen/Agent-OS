/**
 * Official MCP stdio server (aligned with agent-os).
 * Side effects for clarification / dispatch / spec / approval happen in
 * AppControl after the CLI reports the tool call. schedule_manage runs now.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import {
  AcceptanceSubmissionSchema,
  ApprovalRequestSchema,
  ClarificationRequestSchema,
  DispatchTaskRequestSchema,
  ProductSpecRequestSchema,
  ScheduleManageRequestSchema,
} from "@ml-aos/shared";

const server = new McpServer({
  name: "agent_os",
  version: "1.0.0",
});

function ok(text: string) {
  return { content: [{ type: "text" as const, text }] };
}

function fail(text: string) {
  return { content: [{ type: "text" as const, text }], isError: true };
}

async function manageSchedule(input: unknown) {
  const parsed = ScheduleManageRequestSchema.safeParse(input);
  if (!parsed.success) {
    return fail(
      `定时任务参数不正确：${parsed.error.issues.map((issue) => issue.message).join("；")}`,
    );
  }
  const base = process.env.ML_AOS_API_BASE ?? "http://127.0.0.1:17890";
  const topicId = process.env.ML_AOS_TOPIC_ID ?? "";
  try {
    const response = await fetch(`${base}/api/schedules/manage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ request: parsed.data, topicId }),
    });
    const payload = (await response.json().catch(() => undefined)) as
      | { notice?: string; error?: string }
      | undefined;
    if (!response.ok) {
      return fail(payload?.error ?? `定时任务管理失败（${response.status}）`);
    }
    return ok(payload?.notice ?? "定时任务管理完成。");
  } catch (error) {
    return fail(
      `无法连接 ML AOS 定时任务接口：${error instanceof Error ? error.message : "未知错误"}`,
    );
  }
}

server.registerTool(
  "request_clarification",
  {
    title: "向用户提问",
    description:
      "向用户展示确认卡并等待点选。一次 1 到 5 题，每题 2 到 4 个选项。调用后停止，不要自行补答案。",
    inputSchema: ClarificationRequestSchema,
  },
  async (args) => {
    const n = Array.isArray(args?.questions) ? args.questions.length : 0;
    return ok(`已把 ${n} 个问题交给 ML AOS，请等待用户在确认卡中选择。`);
  },
);

server.registerTool(
  "dispatch_task",
  {
    title: "把任务交给团队成员",
    description:
      "只有 CEO 可以调用。把任务确定性地交给 product、developer、tester 或 reviewer。调用后停止。",
    inputSchema: DispatchTaskRequestSchema,
  },
  async () => ok("派发请求已交给 ML AOS，等待协作任务送达目标成员。"),
);

server.registerTool(
  "request_spec_approval",
  {
    title: "提交产品方案",
    description:
      "产品方案写完后提交待确认产物。桌面默认 deliveryMode=local，并给出已存在的 specPath 与 ticketsPath。调用后停止。",
    inputSchema: ProductSpecRequestSchema,
  },
  async () => ok("产品方案已交给 ML AOS，等待用户确认。"),
);

server.registerTool(
  "request_approval",
  {
    title: "请求高危操作审批",
    description:
      "删除、重启、改生产配置或写数据库之前调用。调用后停止，等用户通过后再执行。",
    inputSchema: ApprovalRequestSchema,
  },
  async () => ok("审批请求已交给 ML AOS，等待用户拍板。"),
);

server.registerTool(
  "schedule_manage",
  {
    title: "管理定时任务",
    description:
      "管理定时任务。action: list、add、addMany、update、remove、removeMany、removeAll、run、pause、resume、logs。",
    inputSchema: ScheduleManageRequestSchema,
  },
  async (args) => manageSchedule(args),
);

server.registerTool(
  "submit_acceptance",
  {
    title: "提交验收结果",
    description:
      "tester 提交结构化验收结果。verdict 为 pass/fail/skip；skip 必须带 skipReason。调用后停止。",
    inputSchema: AcceptanceSubmissionSchema,
  },
  async () => ok("验收结果已交给 ML AOS。"),
);

server.registerTool(
  "run_acceptance_suite",
  {
    title: "跑 Playwright 验收套件",
    description:
      "在当前工作区跑 Playwright 验收套件（.ml-aos/acceptance 或 acceptance 下的 playwright.config）。结果会写成 submit_acceptance 同结构。调用后停止等待结果卡。",
    inputSchema: z.object({
      baseURL: z.string().trim().max(300).optional(),
    }),
  },
  async () => ok("已请求 ML AOS 执行工作区 Playwright 验收套件。"),
);

async function main() {
  await server.connect(new StdioServerTransport());
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
