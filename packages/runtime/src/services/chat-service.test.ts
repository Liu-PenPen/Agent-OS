import { describe, it, expect, beforeEach } from "vitest";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { JsonStore } from "../store/json-store.js";
import { BotService } from "./bot-service.js";
import { WorkspaceService } from "./workspace-service.js";
import { ChatService } from "./chat-service.js";
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

describe("ChatService", () => {
  let dir: string;
  let store: JsonStore;
  let chat: ChatService;
  let workspaceId: string;
  let botId: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "ml-aos-chat-"));
    store = new JsonStore(dir);
    await store.save(await emptyState(dir));

    const workspaceService = new WorkspaceService(store);
    const botService = new BotService(store);
    chat = new ChatService(store, workspaceService, botService);

    const workspace = await workspaceService.create({
      name: "demo",
      localPath: dir,
    });
    workspaceId = workspace.id;

    const bot = await botService.create({
      name: "Dev Bot",
      role: "developer",
      defaultEngine: "mock",
      instructions: "help",
      enabled: true,
    });
    botId = bot.id;
  });

  it("creates topic and lists by workspace", async () => {
    const topic = await chat.createTopic({
      workspaceId,
      title: "Feature A",
    });
    expect(topic.title).toBe("Feature A");
    expect(topic.pipelineStage).toBe("idle");

    const list = await chat.listTopics(workspaceId);
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe(topic.id);
  });

  it("stores user message only when no mentionBotId", async () => {
    const topic = await chat.createTopic({ workspaceId, title: "T" });
    const messages = await chat.sendMessage(topic.id, { content: "hello" });
    expect(messages).toHaveLength(1);
    expect(messages[0].author).toBe("user");
    expect(messages[0].content).toBe("hello");
  });

  it("adds bot reply when mentionBotId is set", async () => {
    const topic = await chat.createTopic({ workspaceId, title: "T" });
    const messages = await chat.sendMessage(topic.id, {
      content: "fix bug",
      mentionBotId: botId,
    });
    expect(messages.length).toBeGreaterThanOrEqual(2);
    const botMsg = messages.find((m) => m.author === "bot");
    expect(botMsg).toBeTruthy();
    expect(botMsg!.content).toContain("Mock");
    expect(botMsg!.botId).toBe(botId);
  });

  it("requires mentionBotId to pick bot", async () => {
    const topic = await chat.createTopic({ workspaceId, title: "T" });
    await expect(
      chat.sendMessage(topic.id, { content: "hi", mentionBotId: "missing" }),
    ).rejects.toThrow(/not found/i);
  });

  it("persists clarification message when mock emits clarify event", async () => {
    const topic = await chat.createTopic({ workspaceId, title: "T" });
    await chat.sendMessage(topic.id, {
      content: "[clarify] pick approach",
      mentionBotId: botId,
    });

    const messages = await chat.listMessages(topic.id);
    const clarification = messages.find((m) => m.kind === "clarification");
    expect(clarification).toBeTruthy();
    expect(clarification!.clarification?.status).toBe("pending");
    expect(clarification!.clarification?.options).toHaveLength(2);
  });
});
