import type { RouteHandler } from "../http/router.js";
import { readJsonBody, sendError, sendJson } from "../http/json.js";
import type { ChatService } from "../services/chat-service.js";
import { CliEngineUnavailableError } from "../cli/errors.js";

export function registerTopicRoutes(
  router: {
    get: (path: string, handler: RouteHandler) => void;
    post: (path: string, handler: RouteHandler) => void;
    delete: (path: string, handler: RouteHandler) => void;
  },
  service: ChatService,
): void {
  router.get("/api/topics", async (req, res) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    const workspaceId = url.searchParams.get("workspaceId") ?? undefined;
    const topics = await service.listTopics(workspaceId);
    sendJson(res, 200, topics);
  });

  router.post("/api/topics", async (req, res) => {
    try {
      const body = await readJsonBody<{
        workspaceId?: string;
        title?: string;
      }>(req);
      if (!body.workspaceId?.trim()) {
        sendError(res, 400, "workspaceId is required");
        return;
      }
      const topic = await service.createTopic({
        workspaceId: body.workspaceId,
        title: body.title?.trim() || "New topic",
      });
      sendJson(res, 201, topic);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Bad request";
      sendError(res, /not found/i.test(message) ? 404 : 500, message);
    }
  });

  router.get("/api/topics/:id/messages", async (_req, res, params) => {
    try {
      const messages = await service.listMessages(params.id);
      sendJson(res, 200, messages);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Bad request";
      sendError(res, /not found/i.test(message) ? 404 : 500, message);
    }
  });

  router.post("/api/topics/:id/messages", async (req, res, params) => {
    try {
      const body = await readJsonBody<{
        content?: string;
        mentionBotId?: string;
      }>(req);
      if (!body.content?.trim()) {
        sendError(res, 400, "content is required");
        return;
      }
      const messages = await service.sendMessage(params.id, {
        content: body.content,
        mentionBotId: body.mentionBotId,
      });
      sendJson(res, 201, messages);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Bad request";
      if (error instanceof CliEngineUnavailableError) {
        sendError(res, 503, message);
        return;
      }
      const status = /not found|disabled/i.test(message)
        ? 404
        : /required/i.test(message)
          ? 400
          : 500;
      sendError(res, status, message);
    }
  });

  router.delete("/api/topics/:id", async (_req, res, params) => {
    try {
      await service.deleteTopic(params.id);
      res.writeHead(204);
      res.end();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Bad request";
      sendError(res, /not found/i.test(message) ? 404 : 500, message);
    }
  });

  router.post("/api/topics/:id/abort", async (_req, res, params) => {
    try {
      const result = await service.abort(params.id);
      sendJson(res, 200, result);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Bad request";
      sendError(res, /not found/i.test(message) ? 404 : 500, message);
    }
  });
}
