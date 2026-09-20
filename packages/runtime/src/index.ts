import { createServer } from "node:http";
import { join } from "node:path";
import { JsonStore } from "./store/json-store.js";
import { WorkspaceService } from "./services/workspace-service.js";
import { BotService } from "./services/bot-service.js";
import { ChatService } from "./services/chat-service.js";
import { PipelineService } from "./services/pipeline-service.js";
import { ClarificationService } from "./services/clarification-service.js";
import { createRouter } from "./http/router.js";
import { sendJson } from "./http/json.js";
import { registerWorkspaceRoutes } from "./routes/workspaces.js";
import { registerBotRoutes } from "./routes/bots.js";
import { registerTopicRoutes } from "./routes/topics.js";
import { registerPipelineRoutes } from "./routes/pipelines.js";
import { registerClarificationRoutes } from "./routes/clarifications.js";
import { attachWebSocket } from "./ws.js";

const HOST = "127.0.0.1";
const PORT = 17890;

const dataDir = process.env.ML_AOS_DATA_DIR ?? join(process.cwd(), "data");
const store = new JsonStore(dataDir);
const workspaceService = new WorkspaceService(store);
const botService = new BotService(store);

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

const { broadcast } = attachWebSocket(server);
const chatService = new ChatService(
  store,
  workspaceService,
  botService,
  undefined,
  broadcast,
);
const pipelineService = new PipelineService(store, broadcast, 5000);
const clarificationService = new ClarificationService(store, broadcast);

const router = createRouter();
registerWorkspaceRoutes(router, workspaceService);
registerBotRoutes(router, botService);
registerTopicRoutes(router, chatService);
registerPipelineRoutes(router, pipelineService);
registerClarificationRoutes(router, clarificationService);

server.listen(PORT, HOST, () => {
  console.log(`Runtime listening on http://${HOST}:${PORT}`);
});
