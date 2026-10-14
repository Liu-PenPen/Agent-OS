import { describe, it, expect, beforeEach } from "vitest";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { JsonStore } from "../store/json-store.js";
import { BotService } from "./bot-service.js";
import { WorkspaceService } from "./workspace-service.js";
import { ChatService } from "./chat-service.js";
import { MockCliAdapter } from "../cli/mock-adapter.js";
import type { AppState } from "../app-state.js";
import type { ChatMessage } from "@ml-aos/shared";

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

async function waitForMessages(
  chat: ChatService,
  topicId: string,
  predicate: (messages: ChatMessage[]) => boolean,
  attempts = 80,
): Promise<ChatMessage[]> {
  for (let i = 0; i < attempts; i++) {
    const list = await chat.listMessages(topicId);
    if (predicate(list)) return list;
    await new Promise((r) => setTimeout(r, 25));
  }
  throw new Error("Timed out waiting for bot messages");
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
    chat = new ChatService(
      store,
      workspaceService,
      botService,
      new MockCliAdapter(),
    );

    const workspace = await workspaceService.create({
      name: "demo",
      localPath: dir,
    });
    workspaceId = workspace.id;

    const bot = await botService.create({
      name: "Dev Bot",
      role: "developer",
      defaultEngine: "claude",
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
    expect(botMsg!.streaming).toBe(true);

    const settled = await waitForMessages(chat, topic.id, (list) => {
      const bot = list.find((m) => m.id === botMsg!.id);
      return Boolean(bot && !bot.streaming && bot.content.includes("Mock"));
    });
    const done = settled.find((m) => m.id === botMsg!.id)!;
    expect(done.content).toContain("Mock");
    expect(done.botId).toBe(botId);
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

    const messages = await waitForMessages(chat, topic.id, (list) =>
      list.some((m) => m.kind === "clarification"),
    );
    const clarification = messages.find((m) => m.kind === "clarification");
    expect(clarification).toBeTruthy();
    expect(clarification!.clarification?.status).toBe("pending");
    expect(clarification!.clarification?.options).toHaveLength(2);
  });

  it("abort returns ok when nothing is running", async () => {
    const topic = await chat.createTopic({ workspaceId, title: "T" });
    const result = await chat.abort(topic.id);
    expect(result).toEqual({ ok: true, aborted: false });
  });

  it("deletes a topic and its messages and pipeline", async () => {
    const topic = await chat.createTopic({ workspaceId, title: "丢弃" });
    const other = await chat.createTopic({ workspaceId, title: "留下" });
    await chat.sendMessage(topic.id, { content: "hello" });
    await store.transact((state) => {
      state.pipelines.push({
        id: "pipe-1",
        topicId: topic.id,
        title: "丢弃",
        stage: "blocked",
        stages: [],
      });
    });

    await chat.deleteTopic(topic.id);

    const state = await store.load();
    expect(state.topics.map((t) => t.id)).toEqual([other.id]);
    expect(state.messages.some((m) => m.topicId === topic.id)).toBe(false);
    expect(state.pipelines).toHaveLength(0);
    await expect(chat.deleteTopic(topic.id)).rejects.toThrow(/not found/i);
    expect(await chat.listMessages(other.id)).toEqual([]);
  });
});
