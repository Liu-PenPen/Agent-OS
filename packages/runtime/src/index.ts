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
import { TicketPullScheduleService } from "./services/ticket-pull-schedule.js";
import { AgentScheduleService } from "./services/agent-schedule.js";
import { ClarificationService } from "./services/clarification-service.js";
import { TicketService } from "./services/ticket-service.js";
import { TaskBoardService } from "./services/task-board-service.js";
import { AcceptanceService } from "./services/acceptance-service.js";
import { AcceptanceRunner } from "./services/acceptance-runner.js";
import { GiteeProjectsStore } from "./gitee/projects.js";
import { setGiteeCredentialsDataDir } from "./gitee/credentials.js";
import { createRouter } from "./http/router.js";
import { applyCors, sendJson } from "./http/json.js";
import { registerWorkspaceRoutes } from "./routes/workspaces.js";
import { registerBotRoutes } from "./routes/bots.js";
import { registerTopicRoutes } from "./routes/topics.js";
import { registerPipelineRoutes } from "./routes/pipelines.js";
import { registerClarificationRoutes } from "./routes/clarifications.js";
import { registerSettingsRoutes } from "./routes/settings.js";
import { registerGiteeIntegrationRoutes } from "./routes/gitee-integration.js";
import { registerControlRoutes } from "./routes/controls.js";
import { registerAuthRoutes } from "./routes/auth.js";
import { registerBoardRoutes } from "./routes/board.js";
import { registerTicketRoutes } from "./routes/tickets.js";
import { registerTicketPullRoutes } from "./routes/ticket-pulls.js";
import { registerAgentScheduleRoutes } from "./routes/agent-schedules.js";
import { registerAcceptanceRoutes } from "./routes/acceptance.js";
import { SettingsService } from "./services/settings-service.js";
import { GiteeIntegrationService } from "./services/gitee-integration-service.js";
import { AuthService } from "./services/auth-service.js";
import { attachWebSocket } from "./ws.js";
import { SkillLibrary } from "./services/skill-install.js";

loadDotEnv();

const HOST = "127.0.0.1";
const PORT = 17890;

const dataDir = process.env.ML_AOS_DATA_DIR ?? join(process.cwd(), "data");
setGiteeCredentialsDataDir(dataDir);
const store = new JsonStore(dataDir);
const workspaceService = new WorkspaceService(store);
const skillLibrary = new SkillLibrary({ install: true });
const botService = new BotService(store, skillLibrary);
const settingsService = new SettingsService(store);
const authService = new AuthService(store);
const giteeProjects = new GiteeProjectsStore(dataDir);
const giteeIntegration = new GiteeIntegrationService(dataDir, giteeProjects);
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
const ticketPulls = new TicketPullScheduleService(dataDir, ticketService);
const agentSchedules = new AgentScheduleService(dataDir, {
  listBots: () => botService.list(),
  getWorkspace: (id) => workspaceService.get(id),
  createTopic: (input) => chatService.createTopic(input),
  startBot: (input) =>
    botRunService.start({
      topicId: input.topicId,
      botId: input.botId,
      origin: "chat",
      prompt: input.prompt,
    }),
});

const router = createRouter();
registerWorkspaceRoutes(router, workspaceService);
registerBotRoutes(router, botService);
registerTopicRoutes(router, chatService);
registerPipelineRoutes(router, pipelineService);
registerClarificationRoutes(router, clarificationService);
registerSettingsRoutes(router, settingsService);
registerGiteeIntegrationRoutes(router, giteeIntegration);
registerControlRoutes(router, appControl, schedules, dataDir);
registerAuthRoutes(router, authService);
registerBoardRoutes(router, taskBoard);
registerTicketRoutes(router, ticketService);
registerTicketPullRoutes(router, ticketPulls);
registerAgentScheduleRoutes(router, agentSchedules);
registerAcceptanceRoutes(router, {
  store,
  workspaces: workspaceService,
  acceptance: acceptanceService,
  runner: acceptanceRunner,
});

server.listen(PORT, HOST, () => {
  console.log(`Runtime listening on http://${HOST}:${PORT}`);
  schedules.start();
  ticketPulls.startLoop();
  agentSchedules.startLoop();
  void (async () => {
    const bots = await botService.ensurePipelineTeam();
    console.log(
      `Bots ready: ${bots.map((b) => `${b.name}(${b.role})`).join(", ")}`,
    );

    for (const bot of bots) {
      for (const skill of bot.skills ?? []) {
        if (skill.status === "failed") {
          console.warn(
            `[skills] ${bot.name}($${skill.id}): ${skill.error ?? "未安装"}`,
          );
        } else if (skill.localPath) {
          console.log(`[skills] ${bot.name} $${skill.id} -> ${skill.localPath}`);
        }
      }
    }
  })();
});
