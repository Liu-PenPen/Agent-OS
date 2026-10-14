import { z } from "zod";
import type { RouteHandler } from "../http/router.js";
import { readJsonBody, sendError, sendJson } from "../http/json.js";
import type { TicketPullScheduleService } from "../services/ticket-pull-schedule.js";

const AddSchema = z.object({
  projectId: z.string().trim().min(1),
  everyHours: z.number().int().min(1).max(24),
  priority: z.enum(["severe", "major", "none"]),
});

const ACTIONS = new Set(["start", "pause", "resume", "run", "remove"]);

export function registerTicketPullRoutes(
  router: {
    get: (path: string, handler: RouteHandler) => void;
    post: (path: string, handler: RouteHandler) => void;
  },
  service: TicketPullScheduleService,
): void {
  router.get("/api/ticket-pulls", async (_req, res) => {
    sendJson(res, 200, await service.list());
  });

  router.post("/api/ticket-pulls", async (req, res) => {
    try {
      const body = AddSchema.parse(await readJsonBody(req));
      const task = await service.add(body);
      sendJson(res, 201, task);
    } catch (error) {
      const message =
        error instanceof z.ZodError
          ? "请填写项目、1 到 24 的小时间隔，以及优先级"
          : error instanceof Error
            ? error.message
            : "无法添加";
      sendError(res, 400, message);
    }
  });

  router.post("/api/ticket-pulls/:id/:action", async (req, res, params) => {
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
