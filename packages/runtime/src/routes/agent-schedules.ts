import { z } from "zod";
import type { RouteHandler } from "../http/router.js";
import { readJsonBody, sendError, sendJson } from "../http/json.js";
import type { AgentScheduleService } from "../services/agent-schedule.js";

const AddSchema = z.object({
  prompt: z.string().trim().min(1).max(2000),
  botId: z.string().trim().min(1),
  workspaceId: z.string().trim().min(1),
  everyHours: z.number().int().min(1).max(24),
});

const ACTIONS = new Set(["start", "pause", "resume", "run", "remove"]);

export function registerAgentScheduleRoutes(
  router: {
    get: (path: string, handler: RouteHandler) => void;
    post: (path: string, handler: RouteHandler) => void;
  },
  service: AgentScheduleService,
): void {
  router.get("/api/agent-schedules", async (_req, res) => {
    sendJson(res, 200, await service.list());
  });

  router.post("/api/agent-schedules", async (req, res) => {
    try {
      const body = AddSchema.parse(await readJsonBody(req));
      const task = await service.add(body);
      sendJson(res, 201, task);
    } catch (error) {
      const message =
        error instanceof z.ZodError
          ? "请填写任务说明、智能体、工作区和 1 到 24 的小时间隔"
          : error instanceof Error
            ? error.message
            : "无法添加";
      sendError(res, 400, message);
    }
  });

  router.post("/api/agent-schedules/:id/:action", async (req, res, params) => {
    const id = params.id ?? "";
    const action = params.action ?? "";
    if (!ACTIONS.has(action)) {
      sendError(res, 400, "不支持的操作");
      return;
    }
    try {
      if (action === "remove") {
        await service.remove(id);
        sendJson(res, 200, { ok: true });
        return;
      }
      if (action === "start") await service.start(id);
      if (action === "pause") await service.pause(id);
      if (action === "resume") await service.resume(id);
      if (action === "run") await service.run(id);
      sendJson(res, 200, { ok: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : "操作失败";
      const status = message.includes("找不到") ? 404 : 400;
      sendError(res, status, message);
    }
  });
}
