import { createReadStream, existsSync } from "node:fs";
import { join, normalize } from "node:path";
import type { RouteHandler } from "../http/router.js";
import { readJsonBody, sendError, sendJson } from "../http/json.js";
import type { AppControl, ControlDecision } from "../services/app-control.js";
import type { ScheduleService } from "../services/schedule-service.js";
import type { ScheduleManageRequest } from "@ml-aos/shared";

export function registerControlRoutes(
  router: {
    post: (path: string, handler: RouteHandler) => void;
    get: (path: string, handler: RouteHandler) => void;
  },
  control: AppControl,
  schedules: ScheduleService,
  dataDir: string,
): void {
  router.post("/api/topics/:topicId/controls", async (req, res, params) => {
    try {
      const body = await readJsonBody<ControlDecision>(req);
      if (!body.token || !body.action) {
        sendError(res, 400, "token and action are required");
        return;
      }
      await control.answer(params.topicId ?? "", body);
      sendJson(res, 200, { ok: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Bad request";
      const status = /not found/i.test(message) ? 404 : 400;
      sendError(res, status, message);
    }
  });

  router.get("/api/schedules", async (_req, res) => {
    sendJson(res, 200, await schedules.list());
  });

  router.get("/api/schedules/logs", async (req, res) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    sendJson(res, 200, await schedules.logs(url.searchParams.get("id") ?? undefined));
  });

  router.post("/api/schedules/manage", async (req, res) => {
    try {
      const body = await readJsonBody<{
        request?: ScheduleManageRequest;
        topicId?: string;
      }>(req);
      if (!body.request) {
        sendError(res, 400, "request is required");
        return;
      }
      const notice = await schedules.manage(body.request, body.topicId ?? "");
      sendJson(res, 200, { notice });
    } catch (error) {
      sendError(res, 400, error instanceof Error ? error.message : "Bad request");
    }
  });

  router.get("/api/media/:name", (req, res, params) => {
    const name = params.name ?? "";
    if (!/^[a-z0-9-]+\.(png|jpe?g|webp)$/i.test(name)) {
      sendError(res, 400, "invalid media name");
      return;
    }
    const file = normalize(join(dataDir, "media", name));
    if (!existsSync(file)) {
      sendError(res, 404, "media not found");
      return;
    }
    const stream = createReadStream(file);
    stream.on("error", () => {
      if (!res.headersSent) sendError(res, 404, "media not found");
    });
    const type = name.endsWith(".png")
      ? "image/png"
      : name.endsWith(".webp")
        ? "image/webp"
        : "image/jpeg";
    res.writeHead(200, { "Content-Type": type, "Cache-Control": "no-store" });
    stream.pipe(res);
  });
}
