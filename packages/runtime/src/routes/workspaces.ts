import type { RouteHandler } from "../http/router.js";
import { readJsonBody, sendError, sendJson } from "../http/json.js";
import type { WorkspaceService } from "../services/workspace-service.js";

function clientError(message: string): boolean {
  return (
    /required|not found|no gitUrl|not empty/i.test(message)
  );
}

export function registerWorkspaceRoutes(
  router: {
    get: (path: string, handler: RouteHandler) => void;
    post: (path: string, handler: RouteHandler) => void;
    patch: (path: string, handler: RouteHandler) => void;
    delete: (path: string, handler: RouteHandler) => void;
  },
  service: WorkspaceService,
): void {
  router.get("/api/workspaces", async (_req, res) => {
    const workspaces = await service.list();
    sendJson(res, 200, workspaces);
  });

  router.post("/api/workspaces", async (req, res) => {
    try {
      const body = await readJsonBody<{
        name?: string;
        localPath?: string;
        gitUrl?: string;
      }>(req);
      const workspace = await service.create({
        name: body.name ?? "",
        localPath: body.localPath ?? "",
        gitUrl: body.gitUrl,
      });
      sendJson(res, 201, workspace);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Bad request";
      sendError(res, clientError(message) ? 400 : 500, message);
    }
  });

  router.patch("/api/workspaces/:id", async (req, res, params) => {
    try {
      const body = await readJsonBody<{
        name?: string;
        localPath?: string;
        gitUrl?: string;
      }>(req);
      const workspace = await service.update(params.id, body);
      sendJson(res, 200, workspace);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Bad request";
      const status = /not found/i.test(message)
        ? 404
        : clientError(message)
          ? 400
          : 500;
      sendError(res, status, message);
    }
  });

  router.delete("/api/workspaces/:id", async (_req, res, params) => {
    try {
      await service.delete(params.id);
      res.writeHead(204);
      res.end();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Bad request";
      sendError(res, /not found/i.test(message) ? 404 : 500, message);
    }
  });

  router.post("/api/workspaces/:id/clone", async (req, res, params) => {
    await readJsonBody(req);
    try {
      const workspace = await service.clone(params.id);
      sendJson(res, 200, workspace);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Bad request";
      const status = /not found/i.test(message)
        ? 404
        : /no gitUrl|not empty/i.test(message)
          ? 400
          : 500;
      sendError(res, status, message);
    }
  });
}
