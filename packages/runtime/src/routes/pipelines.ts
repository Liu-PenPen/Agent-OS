import type { RouteHandler } from "../http/router.js";
import { readJsonBody, sendError, sendJson } from "../http/json.js";
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

  router.post("/api/topics/:id/dispatch", async (req, res, params) => {
    try {
      const body = await readJsonBody<{
        title?: string;
        assigneeBotIds?: string[];
      }>(req);
      if (!body.title?.trim()) {
        sendError(res, 400, "title is required");
        return;
      }
      const task = await service.dispatch(params.id, {
        title: body.title.trim(),
        assigneeBotIds: body.assigneeBotIds,
      });
      sendJson(res, 201, task);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Bad request";
      sendError(res, /not found/i.test(message) ? 404 : 500, message);
    }
  });

  router.post("/api/pipelines/:id/advance", async (_req, res, params) => {
    try {
      const task = await service.advance(params.id);
      sendJson(res, 200, task);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Bad request";
      sendError(res, /not found/i.test(message) ? 404 : 500, message);
    }
  });
}
