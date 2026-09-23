import { describe, it, expect, beforeEach } from "vitest";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { JsonStore } from "../store/json-store.js";
import { BotService } from "./bot-service.js";
import { WorkspaceService } from "./workspace-service.js";
import { SettingsService } from "./settings-service.js";
import { ChatService } from "./chat-service.js";
import { BotRunService } from "./bot-run-service.js";
import { PipelineService } from "./pipeline-service.js";
import { PipelineRunner } from "./pipeline-runner.js";
import {
  TaskBoardService,
  boardTaskIdForPipeline,
} from "./task-board-service.js";
import type { AppState } from "../app-state.js";
import type { BotRunRequest, BotRunResult } from "./bot-run-service.js";
import type { CliAdapter } from "../cli/types.js";

const fastMockAdapter: CliAdapter = {
  async *run(input) {
    yield { type: "text_delta", text: `Mock response to: ${input.prompt}` };
    yield { type: "done", sessionId: input.sessionId ?? "sess-fast" };
  },
};

async function emptyState(dataDir: string): Promise<AppState> {
  return {
    settings: {
      theme: "dark",
      defaultEngine: "claude",
      dataDir,
      notifications: true,
    },
    bots: [],
    workspaces: [],
    topics: [],
    messages: [],
    pipelines: [],
  };
}

async function runUntilDone(
  runner: PipelineRunner,
  pipelines: PipelineService,
  pipelineId: string,
  maxSteps = 8,
): Promise<void> {
  for (let i = 0; i < maxSteps; i++) {
    const p = await pipelines.get(pipelineId);
    if (!p || p.stage === "completed" || p.stage === "blocked") return;
    await runner.runStage(pipelineId);
  }
}

describe("PipelineRunner", () => {
  let dir: string;
  let store: JsonStore;
  let botService: BotService;
  let botRun: BotRunService;
  let chat: ChatService;
  let pipelines: PipelineService;
  let runner: PipelineRunner;
  let taskBoard: TaskBoardService;
  let topicId: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "ml-aos-runner-"));
    store = new JsonStore(dir);
    await store.save(await emptyState(dir));

    const workspaceService = new WorkspaceService(store);
    botService = new BotService(store);
    const settingsService = new SettingsService(store);
    botRun = new BotRunService(
      store,
      workspaceService,
      botService,
      settingsService,
      undefined,
      fastMockAdapter,
    );
    chat = new ChatService(store, workspaceService, botService);
    taskBoard = new TaskBoardService(dir);
    pipelines = new PipelineService(store, undefined, undefined, taskBoard);
    runner = new PipelineRunner(
      pipelines,
      botRun,
      store,
      undefined,
      undefined,
      taskBoard,
    );

    const workspace = await workspaceService.create({
      name: "demo",
      localPath: dir,
    });
    const topic = await chat.createTopic({
      workspaceId: workspace.id,
      title: "Feature",
    });
    topicId = topic.id;
  });

  it("runs developing→testing→reviewing with mock bots to completed", async () => {
    await botService.create({
      name: "Dev",
      role: "developer",
      defaultEngine: "claude",
      instructions: "",
      enabled: true,
    });
    await botService.create({
      name: "QA",
      role: "tester",
      defaultEngine: "claude",
      instructions: "",
      enabled: true,
    });
    await botService.create({
      name: "Review",
      role: "reviewer",
      defaultEngine: "claude",
      instructions: "",
      enabled: true,
    });

    const task = await pipelines.dispatch(topicId, { title: "Ship feature" });
    await runUntilDone(runner, pipelines, task.id);

    const p = await pipelines.get(task.id);
    expect(p?.stage).toBe("completed");

    const topic = await chat.getTopic(topicId);
    expect(topic?.pipelineStage).toBe("completed");

    const msgs = await chat.listMessages(topicId);
    expect(
      msgs.some((m) => m.author === "system" && m.content.includes("\u25b6 Stage")),
    ).toBe(true);
    expect(msgs.filter((m) => m.author === "bot").length).toBeGreaterThanOrEqual(
      3,
    );
  });

  it("marks blocked when botRun returns ok:false", async () => {
    await botService.create({
      name: "Dev",
      role: "developer",
      defaultEngine: "claude",
      instructions: "",
      enabled: true,
    });
    await botService.create({
      name: "QA",
      role: "tester",
      defaultEngine: "claude",
      instructions: "",
      enabled: true,
    });
    await botService.create({
      name: "Review",
      role: "reviewer",
      defaultEngine: "claude",
      instructions: "",
      enabled: true,
    });

    const failingRun: BotRunService = {
      run: async (_req: BotRunRequest): Promise<BotRunResult> => ({
        ok: false,
        messageId: "msg-fail",
        error: "boom",
      }),
      abort: async () => ({ ok: true as const, aborted: false }),
    } as BotRunService;

    runner = new PipelineRunner(
      pipelines,
      failingRun,
      store,
      undefined,
      undefined,
      taskBoard,
    );

    const task = await pipelines.dispatch(topicId, { title: "Will fail" });
    await runner.runStage(task.id);

    const p = await pipelines.get(task.id);
    expect(p?.stage).toBe("blocked");
    const developing = p?.stages.find((s) => s.stage === "developing");
    expect(developing?.status).toBe("failed");

    const topic = await chat.getTopic(topicId);
    expect(topic?.pipelineStage).toBe("blocked");

    const rows = await taskBoard.list({ status: "failed" });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: boardTaskIdForPipeline(task.id),
      status: "failed",
      failureReason: "pipeline_blocked",
      stage: "blocked",
      topicId,
      pipelineId: task.id,
    });
  });

  it("does not advance when clarification is pending", async () => {
    const developer = await botService.create({
      name: "Dev",
      role: "developer",
      defaultEngine: "claude",
      instructions: "",
      enabled: true,
    });

    const clarifyRun: BotRunService = {
      run: async (_req: BotRunRequest): Promise<BotRunResult> => ({
        ok: true,
        messageId: "msg-clarify",
        clarificationPending: true,
      }),
      abort: async () => ({ ok: true as const, aborted: false }),
    } as BotRunService;

    runner = new PipelineRunner(pipelines, clarifyRun, store);
    const task = await pipelines.dispatch(topicId, {
      title: "Clarify",
      assigneeBotIds: [developer.id, developer.id, developer.id],
    });

    await runner.runStage(task.id);

    const p = await pipelines.get(task.id);
    expect(p?.stage).toBe("developing");
    expect(p?.stages.find((s) => s.stage === "developing")?.status).toBe(
      "running",
    );
  });

  it("abort during slow stage run marks blocked with aborted by user", async () => {
    await botService.create({
      name: "Dev",
      role: "developer",
      defaultEngine: "claude",
      instructions: "",
      enabled: true,
    });
    await botService.create({
      name: "QA",
      role: "tester",
      defaultEngine: "claude",
      instructions: "",
      enabled: true,
    });
    await botService.create({
      name: "Review",
      role: "reviewer",
      defaultEngine: "claude",
      instructions: "",
      enabled: true,
    });

    let signalStarted!: () => void;
    const whenStarted = new Promise<void>((resolve) => {
      signalStarted = resolve;
    });

    const slowAdapter: CliAdapter = {
      async *run(input) {
        signalStarted();
        await new Promise<void>((resolve, reject) => {
          const timer = setTimeout(resolve, 5_000);
          input.signal?.addEventListener(
            "abort",
            () => {
              clearTimeout(timer);
              reject(new DOMException("Aborted", "AbortError"));
            },
            { once: true },
          );
        }).catch(() => {
          /* aborted */
        });
        if (input.signal?.aborted) {
          yield { type: "error", message: "Aborted" };
          return;
        }
        yield { type: "text_delta", text: "should not finish" };
        yield { type: "done", sessionId: "sess-slow" };
      },
    };

    const workspaceService = new WorkspaceService(store);
    const settingsService = new SettingsService(store);
    botRun = new BotRunService(
      store,
      workspaceService,
      botService,
      settingsService,
      undefined,
      slowAdapter,
    );
    runner = new PipelineRunner(pipelines, botRun, store);

    const task = await pipelines.dispatch(topicId, { title: "Abort mid-run" });
    const runPromise = runner.runStage(task.id);
    await whenStarted;
    const abortResult = await botRun.abort(topicId);
    expect(abortResult.aborted).toBe(true);
    await runner.handleAbort(topicId, abortResult.aborted);
    await runPromise;

    const p = await pipelines.get(task.id);
    expect(p?.stage).toBe("blocked");
    const developing = p?.stages.find((s) => s.stage === "developing");
    expect(developing?.status).toBe("failed");
    expect(developing?.detail).toBe("aborted by user");

    const topic = await chat.getTopic(topicId);
    expect(topic?.pipelineStage).toBe("blocked");
  });

  it("pauses on clarification then advances after resume with answer", async () => {
    await botService.create({
      name: "Dev",
      role: "developer",
      defaultEngine: "claude",
      instructions: "",
      enabled: true,
    });
    await botService.create({
      name: "QA",
      role: "tester",
      defaultEngine: "claude",
      instructions: "",
      enabled: true,
    });
    await botService.create({
      name: "Review",
      role: "reviewer",
      defaultEngine: "claude",
      instructions: "",
      enabled: true,
    });

    const prompts: string[] = [];
    let call = 0;
    const stubRun: BotRunService = {
      run: async (req: BotRunRequest): Promise<BotRunResult> => {
        prompts.push(req.prompt);
        call += 1;
        if (call === 1) {
          return {
            ok: true,
            messageId: "msg-clarify",
            clarificationPending: true,
          };
        }
        return {
          ok: true,
          messageId: `msg-${call}`,
        };
      },
      abort: async () => ({ ok: true as const, aborted: false }),
    } as BotRunService;

    runner = new PipelineRunner(pipelines, stubRun, store);
    const task = await pipelines.dispatch(topicId, { title: "Need clarify" });

    await runner.runStage(task.id);
    let p = await pipelines.get(task.id);
    expect(p?.stage).toBe("developing");
    expect(p?.stages.find((s) => s.stage === "developing")?.status).toBe(
      "running",
    );

    await runner.resume(topicId, "Alpha");

    p = await pipelines.get(task.id);
    expect(p?.stage).toBe("completed");
    expect(prompts[1]).toBe(
      "User answered clarification: Alpha. Continue the stage.",
    );
  });
});
