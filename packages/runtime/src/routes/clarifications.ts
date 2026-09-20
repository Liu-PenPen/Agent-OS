import type { RouteHandler } from "../http/router.js";
import { readJsonBody, sendError, sendJson } from "../http/json.js";
import type { ClarificationService } from "../services/clarification-service.js";

export function registerClarificationRoutes(
  router: {
    get: (path: string, handler: RouteHandler) => void;
    post: (path: string, handler: RouteHandler) => void;
  },
  service: ClarificationService,
): void {
  router.get("/api/clarifications", async (req, res) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    const status = url.searchParams.get("status");
    const list = await service.list(
      status === "pending" || status === "answered" ? { status } : {},
    );
    sendJson(res, 200, list);
  });

  router.post("/api/clarifications/:id/answer", async (req, res, params) => {
    try {
      const body = await readJsonBody<{ optionId?: string }>(req);
      if (!body.optionId?.trim()) {
        sendError(res, 400, "optionId is required");
        return;
      }
      const message = await service.answer(params.id, {
        optionId: body.optionId.trim(),
      });
      sendJson(res, 200, message);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Bad request";
      const status = /not found|already answered/i.test(message)
        ? 404
        : /option not found/i.test(message)
          ? 400
          : 500;
      sendError(res, status, message);
    }
  });
}
