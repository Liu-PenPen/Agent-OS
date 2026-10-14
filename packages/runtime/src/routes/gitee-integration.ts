import type { RouteHandler } from "../http/router.js";
import { readJsonBody, sendError, sendJson } from "../http/json.js";
import type { GiteeIntegrationService } from "../services/gitee-integration-service.js";

export function registerGiteeIntegrationRoutes(
  router: {
    get: (path: string, handler: RouteHandler) => void;
    patch: (path: string, handler: RouteHandler) => void;
    post: (path: string, handler: RouteHandler) => void;
  },
  service: GiteeIntegrationService,
): void {
  router.get("/api/integrations/gitee", async (_req, res) => {
    const snapshot = await service.get();
    sendJson(res, 200, snapshot);
  });

  router.patch("/api/integrations/gitee", async (req, res) => {
    try {
      const body = await readJsonBody<{
        token?: string;
        enterpriseId?: string;
        userId?: string;
        apiBase?: string;
        clearToken?: boolean;
      }>(req);
      const snapshot = await service.update(body);
      sendJson(res, 200, snapshot);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Bad request";
      sendError(res, 500, message);
    }
  });

  router.post("/api/integrations/gitee/test", async (_req, res) => {
    // Always 200: body.ok tells success; avoids API client treating failure as transport error.
    const result = await service.testConnection();
    sendJson(res, 200, result);
  });
}
