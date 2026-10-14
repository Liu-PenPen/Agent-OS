import type { EngineKind } from "@ml-aos/shared";
import type { RouteHandler } from "../http/router.js";
import { readJsonBody, sendError, sendJson } from "../http/json.js";
import type { BotService } from "../services/bot-service.js";

export function registerBotRoutes(
  router: {
    get: (path: string, handler: RouteHandler) => void;
    post: (path: string, handler: RouteHandler) => void;
    patch: (path: string, handler: RouteHandler) => void;
    delete: (path: string, handler: RouteHandler) => void;
  },
  service: BotService,
): void {
  router.get("/api/bots", async (_req, res) => {
    const bots = await service.list();
    sendJson(res, 200, bots);
  });

  router.post("/api/bots", async (req, res) => {
    try {
      const body = await readJsonBody<{
        name?: string;
        role?: string;
        defaultEngine?: EngineKind;
        instructions?: string;
        enabled?: boolean;
        skills?: string[];
      }>(req);
      const bot = await service.create({
        name: body.name ?? "",
        role: body.role ?? "",
        defaultEngine: body.defaultEngine ?? "claude",
        instructions: body.instructions ?? "",
        enabled: body.enabled ?? true,
        skills: body.skills,
      });
      sendJson(res, 201, bot);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Bad request";
      sendError(res, 500, message);
    }
  });

  router.patch("/api/bots/:id", async (req, res, params) => {
    try {
      const body = await readJsonBody<{
        name?: string;
        role?: string;
        defaultEngine?: EngineKind;
        instructions?: string;
        enabled?: boolean;
        skills?: string[];
      }>(req);
      const bot = await service.update(params.id, body);
      sendJson(res, 200, bot);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Bad request";
      sendError(res, /not found/i.test(message) ? 404 : 500, message);
    }
  });

  router.delete("/api/bots/:id", async (_req, res, params) => {
    try {
      await service.delete(params.id);
      res.writeHead(204);
      res.end();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Bad request";
      sendError(res, /not found/i.test(message) ? 404 : 500, message);
    }
  });

  router.post("/api/bots/seed-team", async (_req, res) => {
    try {
      const bots = await service.seedDefaultTeam();
      sendJson(res, 200, bots);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Bad request";
      sendError(res, 500, message);
    }
  });
}
