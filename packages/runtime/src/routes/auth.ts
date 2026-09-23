import type { RouteHandler } from "../http/router.js";
import { readJsonBody, sendError, sendJson } from "../http/json.js";
import type { AuthService } from "../services/auth-service.js";

export function registerAuthRoutes(
  router: {
    get: (path: string, handler: RouteHandler) => void;
    post: (path: string, handler: RouteHandler) => void;
  },
  authService: AuthService,
): void {
  router.post("/api/auth/register", async (req, res) => {
    try {
      const body = await readJsonBody<{
        username?: string;
        email?: string;
        password?: string;
      }>(req);
      const result = await authService.register({
        username: body.username ?? "",
        email: body.email ?? "",
        password: body.password ?? "",
      });
      sendJson(res, 201, result);
    } catch (error) {
      const message = error instanceof Error ? error.message : "注册失败";
      sendError(res, 400, message);
    }
  });

  router.post("/api/auth/login", async (req, res) => {
    try {
      const body = await readJsonBody<{
        identifier?: string;
        username?: string;
        email?: string;
        password?: string;
      }>(req);
      const identifier = body.identifier ?? body.username ?? body.email ?? "";
      const result = await authService.login({
        identifier,
        password: body.password ?? "",
      });
      sendJson(res, 200, result);
    } catch (error) {
      const message = error instanceof Error ? error.message : "登录失败";
      sendError(res, 400, message);
    }
  });

  router.get("/api/auth/me", async (req, res) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith("Bearer ")) {
        sendError(res, 401, "未提供认证令牌");
        return;
      }
      const token = authHeader.slice(7).trim();
      const user = await authService.getUserByToken(token);
      sendJson(res, 200, user);
    } catch (error) {
      const message = error instanceof Error ? error.message : "认证失效";
      sendError(res, 401, message);
    }
  });
}
