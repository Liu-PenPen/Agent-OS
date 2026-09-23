import type { RouteHandler } from "../http/router.js";
import { readJsonBody, sendError, sendJson } from "../http/json.js";
import type { TicketService } from "../services/ticket-service.js";
import type { TicketRole } from "../gitee/projects.js";

export function registerTicketRoutes(
  router: {
    get: (path: string, handler: RouteHandler) => void;
    post: (path: string, handler: RouteHandler) => void;
    patch: (path: string, handler: RouteHandler) => void;
  },
  service: TicketService,
): void {
  router.get("/api/tickets/status", async (_req, res) => {
    sendJson(res, 200, service.status());
  });

  router.get("/api/tickets/projects", async (_req, res) => {
    try {
      const projects = await service.listProjects();
      sendJson(res, 200, projects);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Bad request";
      const status = /缺少|MI_CLAW|GITEE_|无法从 Gitee/i.test(message)
        ? 503
        : 500;
      sendError(res, status, message);
    }
  });

  router.patch("/api/tickets/projects/:id", async (req, res, params) => {
    try {
      const body = await readJsonBody<{
        localPath?: string;
        defaultEngine?: "claude" | "codex";
        cast?: TicketRole[];
        testBaseUrl?: string;
        testStartCommand?: string;
      }>(req);
      const project = await service.updateProject(params.id, body);
      sendJson(res, 200, project);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Bad request";
      sendError(res, /不存在/i.test(message) ? 404 : 400, message);
    }
  });

  router.get("/api/tickets/projects/:id/todos", async (req, res, params) => {
    try {
      const url = new URL(req.url ?? "/", "http://127.0.0.1");
      const includeAll = url.searchParams.get("all") === "1";
      const todos = await service.listTodos(params.id, {
        includeAllStates: includeAll,
      });
      sendJson(res, 200, todos);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Bad request";
      const status = /缺少|MI_CLAW|GITEE_/.test(message)
        ? 503
        : /不存在/i.test(message)
          ? 404
          : 500;
      sendError(res, status, message);
    }
  });

  router.get(
    "/api/tickets/projects/:id/issues/:issueKey",
    async (_req, res, params) => {
      try {
        const detail = await service.getTodoDetail(
          params.id,
          params.issueKey,
        );
        sendJson(res, 200, detail);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Bad request";
        const status = /缺少|MI_CLAW|GITEE_/.test(message)
          ? 503
          : /不存在|无效|404/i.test(message)
            ? 404
            : 500;
        sendError(res, status, message);
      }
    },
  );

  router.post("/api/tickets/dispatch", async (req, res) => {
    try {
      const body = await readJsonBody<{
        projectId?: string;
        issueId?: number;
        workspaceId?: string;
        note?: string;
      }>(req);
      if (!body.projectId?.trim() || typeof body.issueId !== "number") {
        sendError(res, 400, "projectId 与 issueId 必填");
        return;
      }
      const result = await service.dispatchToCeo({
        projectId: body.projectId.trim(),
        issueId: body.issueId,
        workspaceId: body.workspaceId,
        note: body.note,
      });
      sendJson(res, 201, result);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Bad request";
      const status = /请先|找不到|未找到|不存在/i.test(message) ? 400 : 500;
      sendError(res, status, message);
    }
  });
}
