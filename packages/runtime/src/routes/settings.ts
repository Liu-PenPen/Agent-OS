import type { ThemeMode, EngineKind } from "@ml-aos/shared";
import type { RouteHandler } from "../http/router.js";
import { readJsonBody, sendError, sendJson } from "../http/json.js";
import type { SettingsService } from "../services/settings-service.js";

export function registerSettingsRoutes(
  router: {
    get: (path: string, handler: RouteHandler) => void;
    patch: (path: string, handler: RouteHandler) => void;
  },
  service: SettingsService,
): void {
  router.get("/api/settings", async (_req, res) => {
    const settings = await service.get();
    sendJson(res, 200, settings);
  });

  router.patch("/api/settings", async (req, res) => {
    try {
      const body = await readJsonBody<{
        theme?: ThemeMode;
        defaultEngine?: EngineKind;
        dataDir?: string;
        notifications?: boolean;
      }>(req);
      const settings = await service.update(body);
      sendJson(res, 200, settings);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Bad request";
      sendError(res, 500, message);
    }
  });
}
