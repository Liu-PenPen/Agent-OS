import { createServer } from "node:http";
import { join } from "node:path";
import { JsonStore } from "./store/json-store.js";
import { WorkspaceService } from "./services/workspace-service.js";
import { BotService } from "./services/bot-service.js";
import { createRouter } from "./http/router.js";
import { sendJson } from "./http/json.js";
import { registerWorkspaceRoutes } from "./routes/workspaces.js";
import { registerBotRoutes } from "./routes/bots.js";

const HOST = "127.0.0.1";
const PORT = 17890;

const dataDir = process.env.ML_AOS_DATA_DIR ?? join(process.cwd(), "data");
const store = new JsonStore(dataDir);
const workspaceService = new WorkspaceService(store);
const botService = new BotService(store);

const router = createRouter();
registerWorkspaceRoutes(router, workspaceService);
registerBotRoutes(router, botService);

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://${HOST}`);
  const pathname = url.pathname;

  if (req.method === "GET" && pathname === "/health") {
    sendJson(res, 200, { ok: true });
    return;
  }

  const handled = await router.handle(req, res, pathname);
  if (!handled) {
    res.writeHead(404);
    res.end();
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Runtime listening on http://${HOST}:${PORT}`);
});
