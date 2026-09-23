import type { RouteHandler } from "../http/router.js";
import { sendError, sendJson } from "../http/json.js";
import type { PipelineService } from "../services/pipeline-service.js";

export function registerPipelineRoutes(
  router: {
    get: (path: string, handler: RouteHandler) => void;
    post: (path: string, handler: RouteHandler) => void;
  },
  service: PipelineService,
): void {
  router.get("/api/pipelines/:id", async (_req, res, params) => {
    const task = await service.get(params.id);
    if (!task) {
      sendError(res, 404, `Pipeline not found: ${params.id}`);
      return;
    }
    sendJson(res, 200, task);
  });

  router.post("/api/topics/:id/dispatch", async (_req, res) => {
    sendError(
      res,
      410,
      "启动流水线已移除。请 @CEO 助理并用 dispatch_task 协作（对齐 agent-os）。",
    );
  });

  router.post("/api/pipelines/:id/advance", async (_req, res) => {
    sendError(res, 410, "流水线推进已移除。请由 CEO 通过 dispatch_task 继续派发。");
  });
}
