import type { RouteHandler } from "../http/router.js";
import { readJsonBody, sendError, sendJson } from "../http/json.js";
import type { TicketService } from "../services/ticket-service.js";

function parseIssueKey(issueKey: string): number {
  const key = issueKey.trim();
  if (!/^\d+$/.test(key)) {
    throw new Error(
      `工单详情需使用数字 id（收到: ${key}）。请从列表点击工单卡片。`,
    );
  }
  return Number(key);
}

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
      const status = /缺少|MI_CLAW|ML_AOS_GITEE|GITEE_|无法从 Gitee/i.test(message)
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
        cast?: string[];
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
      const status = /缺少|MI_CLAW|ML_AOS_GITEE|GITEE_/.test(message)
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
        const status = /缺少|MI_CLAW|ML_AOS_GITEE|GITEE_/.test(message)
          ? 503
          : /不存在|无效|404/i.test(message)
            ? 404
            : 500;
        sendError(res, status, message);
      }
    },
  );

  router.get(
    "/api/tickets/projects/:id/issues/:issueKey/states",
    async (_req, res, params) => {
      try {
        const issueId = parseIssueKey(params.issueKey);
        const states = await service.listIssueStates(params.id, issueId);
        sendJson(res, 200, states);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Bad request";
        const status = /缺少|MI_CLAW|ML_AOS_GITEE|GITEE_/.test(message)
          ? 503
          : /不存在|无效|404|需使用数字 id/i.test(message)
            ? 404
            : /缺少 issue_type/i.test(message)
              ? 400
              : 500;
        sendError(res, status, message);
      }
    },
  );

  router.post(
    "/api/tickets/projects/:id/issues/:issueKey/state",
    async (req, res, params) => {
      try {
        const body = await readJsonBody<{ issueStateId?: number }>(req);
        if (typeof body.issueStateId !== "number") {
          sendError(res, 400, "issueStateId 必填且须为数字");
          return;
        }
        const issueId = parseIssueKey(params.issueKey);
        const result = await service.updateIssueState({
          projectId: params.id,
          issueId,
          issueStateId: body.issueStateId,
        });
        sendJson(res, 200, result);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Bad request";
        const status = /缺少|MI_CLAW|ML_AOS_GITEE|GITEE_/.test(message)
          ? 503
          : /不存在|无效|404|需使用数字 id/i.test(message)
            ? 404
            : 400;
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
