import type { RouteHandler } from "../http/router.js";
import { sendError, sendJson } from "../http/json.js";
import type {
  BoardTaskStatus,
  TaskBoardService,
} from "../services/task-board-service.js";

const BOARD_STATUSES = new Set<BoardTaskStatus>([
  "running",
  "completed",
  "failed",
]);

export function registerBoardRoutes(
  router: {
    get: (path: string, handler: RouteHandler) => void;
  },
  taskBoard: TaskBoardService,
): void {
  router.get("/api/board/tasks", async (req, res) => {
    try {
      const url = new URL(req.url ?? "/", "http://127.0.0.1");
      const statusParam = url.searchParams.get("status");
      if (statusParam && !BOARD_STATUSES.has(statusParam as BoardTaskStatus)) {
        sendError(res, 400, "status 须为 running、completed 或 failed");
        return;
      }
      const tasks = await taskBoard.list(
        statusParam ? { status: statusParam as BoardTaskStatus } : undefined,
      );
      sendJson(res, 200, tasks);
    } catch (error) {
      sendError(
        res,
        500,
        error instanceof Error ? error.message : "Bad request",
      );
    }
  });

  router.get("/api/board/summary", async (_req, res) => {
    try {
      const summary = await taskBoard.summary();
      sendJson(res, 200, summary);
    } catch (error) {
      sendError(
        res,
        500,
        error instanceof Error ? error.message : "Bad request",
      );
    }
  });
}
