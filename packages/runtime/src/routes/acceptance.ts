import type { RouteHandler } from "../http/router.js";
import { readJsonBody, sendError, sendJson } from "../http/json.js";
import type { AcceptanceService } from "../services/acceptance-service.js";
import type { AcceptanceRunner } from "../services/acceptance-runner.js";
import type { WorkspaceService } from "../services/workspace-service.js";
import type { JsonStore } from "../store/json-store.js";
import { AcceptanceSubmissionSchema } from "@ml-aos/shared";

export function registerAcceptanceRoutes(
  router: {
    get: (path: string, handler: RouteHandler) => void;
    post: (path: string, handler: RouteHandler) => void;
  },
  deps: {
    store: JsonStore;
    workspaces: WorkspaceService;
    acceptance: AcceptanceService;
    runner: AcceptanceRunner;
  },
): void {
  router.get("/api/topics/:topicId/acceptance", async (_req, res, params) => {
    try {
      const rows = await deps.acceptance.list(params.topicId);
      sendJson(res, 200, rows);
    } catch (error) {
      sendError(
        res,
        500,
        error instanceof Error ? error.message : "Bad request",
      );
    }
  });

  router.get(
    "/api/topics/:topicId/acceptance/latest",
    async (_req, res, params) => {
      try {
        const latest = await deps.acceptance.latest(params.topicId);
        sendJson(res, 200, latest ?? null);
      } catch (error) {
        sendError(
          res,
          500,
          error instanceof Error ? error.message : "Bad request",
        );
      }
    },
  );

  router.post("/api/acceptance/submit", async (req, res) => {
    try {
      const body = await readJsonBody<{
        topicId?: string;
        botId?: string;
        submission?: unknown;
      }>(req);
      if (!body.topicId?.trim()) {
        sendError(res, 400, "topicId 必填");
        return;
      }
      const submission = AcceptanceSubmissionSchema.parse(body.submission);
      const workspacePath = await resolveWorkspacePath(
        deps.store,
        body.topicId.trim(),
      );
      const result = await deps.acceptance.save({
        topicId: body.topicId.trim(),
        botId: body.botId,
        workspacePath,
        submission,
      });
      sendJson(res, 201, result);
    } catch (error) {
      sendError(
        res,
        400,
        error instanceof Error ? error.message : "Bad request",
      );
    }
  });

  router.post("/api/acceptance/run", async (req, res) => {
    try {
      const body = await readJsonBody<{
        topicId?: string;
        botId?: string;
        baseURL?: string;
      }>(req);
      if (!body.topicId?.trim()) {
        sendError(res, 400, "topicId 必填");
        return;
      }
      const workspacePath = await resolveWorkspacePath(
        deps.store,
        body.topicId.trim(),
      );
      if (!workspacePath) {
        sendError(res, 400, "话题未绑定工作区");
        return;
      }
      const env = await deps.acceptance.resolveTestEnv(workspacePath);
      const result = await deps.runner.run({
        topicId: body.topicId.trim(),
        botId: body.botId,
        workspacePath,
        baseURL: body.baseURL ?? env.testBaseUrl,
      });
      sendJson(res, 201, result);
    } catch (error) {
      sendError(
        res,
        400,
        error instanceof Error ? error.message : "Bad request",
      );
    }
  });
}

async function resolveWorkspacePath(
  store: JsonStore,
  topicId: string,
): Promise<string | undefined> {
  const state = await store.load();
  const topic = state.topics.find((t) => t.id === topicId);
  const workspace = state.workspaces.find((w) => w.id === topic?.workspaceId);
  return workspace?.localPath;
}
