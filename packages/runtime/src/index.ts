import { createServer } from "node:http";
import { join } from "node:path";
import { loadDotEnv } from "./load-env.js";
import { JsonStore } from "./store/json-store.js";
import { WorkspaceService } from "./services/workspace-service.js";
import { BotService } from "./services/bot-service.js";
import { BotRunService } from "./services/bot-run-service.js";
import { ChatService } from "./services/chat-service.js";
import { PipelineService } from "./services/pipeline-service.js";
import { PipelineRunner } from "./services/pipeline-runner.js";
import { TeamHandoff } from "./services/team-handoff.js";
import { AppControl } from "./services/app-control.js";
import { ScheduleService } from "./services/schedule-service.js";
import { ClarificationService } from "./services/clarification-service.js";
import { TicketService } from "./services/ticket-service.js";
import { TaskBoardService } from "./services/task-board-service.js";
import { AcceptanceService } from "./services/acceptance-service.js";
import { AcceptanceRunner } from "./services/acceptance-runner.js";
import { GiteeProjectsStore } from "./gitee/projects.js";
import { createRouter } from "./http/router.js";
import { applyCors, sendJson } from "./http/json.js";
import { registerWorkspaceRoutes } from "./routes/workspaces.js";
import { registerBotRoutes } from "./routes/bots.js";
import { registerTopicRoutes } from "./routes/topics.js";
import { registerPipelineRoutes } from "./routes/pipelines.js";
import { registerClarificationRoutes } from "./routes/clarifications.js";
import { registerSettingsRoutes } from "./routes/settings.js";
import { registerControlRoutes } from "./routes/controls.js";
import { registerAuthRoutes } from "./routes/auth.js";
import { registerBoardRoutes } from "./routes/board.js";
import { registerTicketRoutes } from "./routes/tickets.js";
import { registerAcceptanceRoutes } from "./routes/acceptance.js";
import { SettingsService } from "./services/settings-service.js";
import { AuthService } from "./services/auth-service.js";
import { attachWebSocket } from "./ws.js";
import { seedBundledSkills } from "./services/skill-seed.js";
import { findMissingSkills } from "./services/skill-paths.js";

loadDotEnv();

const HOST = "127.0.0.1";
const PORT = 17890;

const dataDir = process.env.ML_AOS_DATA_DIR ?? join(process.cwd(), "data");
const store = new JsonStore(dataDir);
const workspaceService = new WorkspaceService(store);
const botService = new BotService(store);
const settingsService = new SettingsService(store);
const authService = new AuthService(store);
const giteeProjects = new GiteeProjectsStore(dataDir);
const acceptanceService = new AcceptanceService(dataDir, giteeProjects);
const acceptanceRunner = new AcceptanceRunner(acceptanceService);

const server = createServer(async (req, res) => {
  applyCors(res);
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

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
const botRunService = new BotRunService(
  store,
  workspaceService,
  botService,
  settingsService,
  broadcast,
);
const chatService = new ChatService(
  store,
  workspaceService,
  botService,
  undefined,
  broadcast,
  settingsService,
  botRunService,
);
const mockAutoAdvanceMs =
  process.env.ML_AOS_MOCK_PIPELINE_TIMER === "1" ? 5000 : undefined;
const taskBoard = new TaskBoardService(dataDir);
const pipelineService = new PipelineService(
  store,
  broadcast,
  mockAutoAdvanceMs,
  taskBoard,
);
const appControl = new AppControl(
  store,
  botService,
  botRunService,
  dataDir,
  broadcast,
);
appControl.attachAcceptance(acceptanceService, acceptanceRunner);
const schedules = new ScheduleService(dataDir, async (task) => {
  const bots = await botService.list();
  const bot = bots.find(
    (item) =>
      item.enabled &&
      (item.id === task.targetBotId ||
        item.role.toLowerCase() === task.targetBotId.toLowerCase()),
  );
  if (!bot) throw new Error(`找不到成员 ${task.targetBotId}`);
  if (!task.topicId) throw new Error("定时任务没有关联话题");
  await botRunService.start({
    topicId: task.topicId,
    botId: bot.id,
    origin: "handoff",
    prompt: `定时任务：\n${task.prompt}`,
  });
});
// PipelineRunner kept for rewind/visual HITL only — no auto stage chain.
const pipelineRunner = new PipelineRunner(
  pipelineService,
  botRunService,
  store,
  broadcast,
  appControl,
  taskBoard,
);
appControl.attachPipeline(pipelineRunner);
const teamHandoff = new TeamHandoff(
  store,
  botService,
  botRunService,
  broadcast,
  appControl,
);
botRunService.setOnSettled((info) => teamHandoff.handle(info));
const clarificationService = new ClarificationService(store, broadcast);
const ticketService = new TicketService(
  dataDir,
  store,
  workspaceService,
  botService,
  chatService,
  botRunService,
  giteeProjects,
  taskBoard,
);

const router = createRouter();
registerWorkspaceRoutes(router, workspaceService);
registerBotRoutes(router, botService, workspaceService);
registerTopicRoutes(router, chatService);
registerPipelineRoutes(router, pipelineService);
registerClarificationRoutes(router, clarificationService);
registerSettingsRoutes(router, settingsService);
registerControlRoutes(router, appControl, schedules, dataDir);
registerAuthRoutes(router, authService);
registerBoardRoutes(router, taskBoard);
registerTicketRoutes(router, ticketService);
registerAcceptanceRoutes(router, {
  store,
  workspaces: workspaceService,
  acceptance: acceptanceService,
  runner: acceptanceRunner,
});

server.listen(PORT, HOST, () => {
  console.log(`Runtime listening on http://${HOST}:${PORT}`);
  schedules.start();
  void (async () => {
    const bots = await botService.ensurePipelineTeam();
    console.log(
      `Bots ready: ${bots.map((b) => `${b.name}(${b.role})`).join(", ")}`,
    );

    const workspaces = await workspaceService.list();
    for (const ws of workspaces) {
      const seeded = await seedBundledSkills(ws.localPath);
      if (seeded.length > 0) {
        console.log(
          `Skills seeded into ${ws.localPath}: ${seeded.join(", ")}`,
        );
      }
      const missing = findMissingSkills(bots, ws.localPath);
      for (const m of missing) {
        console.warn(
          `[skills] missing $${m.skillId} for ${m.botName}(${m.botRole}) under ${ws.localPath}`,
        );
      }
    }
  })();
});
