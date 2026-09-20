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
import type { AppState } from "../app-state.js";

async function emptyState(dataDir: string): Promise<AppState> {
  return {
    settings: {
      theme: "dark",
      defaultEngine: "mock",
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

describe("BotRunService", () => {
  let dir: string;
  let store: JsonStore;
  let botRun: BotRunService;
  let chat: ChatService;
  let topicId: string;
  let botId: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "ml-aos-botrun-"));
    store = new JsonStore(dir);
    await store.save(await emptyState(dir));

    const workspaceService = new WorkspaceService(store);
    const botService = new BotService(store);
    const settingsService = new SettingsService(store);
    botRun = new BotRunService(
      store,
      workspaceService,
      botService,
      settingsService,
    );
    chat = new ChatService(store, workspaceService, botService);

    const workspace = await workspaceService.create({
      name: "demo",
      localPath: dir,
    });
    const bot = await botService.create({
      name: "Dev Bot",
      role: "developer",
      defaultEngine: "mock",
      instructions: "help",
      enabled: true,
    });
    botId = bot.id;
    const topic = await chat.createTopic({
      workspaceId: workspace.id,
      title: "T",
    });
    topicId = topic.id;
  });

  it("runs bot and persists streaming reply", async () => {
    const result = await botRun.run({
      topicId,
      botId,
      prompt: "hello",
    });
    expect(result.ok).toBe(true);
    const msgs = await chat.listMessages(topicId);
    expect(msgs.some((m) => m.author === "bot" && m.content.includes("Mock"))).toBe(
      true,
    );
  });
});
