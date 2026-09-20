import { describe, it, expect, beforeEach } from "vitest";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { JsonStore } from "../store/json-store.js";
import { BotService } from "./bot-service.js";
import { WorkspaceService } from "./workspace-service.js";
import { ChatService } from "./chat-service.js";
import { ClarificationService } from "./clarification-service.js";
import type { AppState } from "../app-state.js";
import type { CliAdapter, CliEvent, CliRunInput } from "../cli/types.js";

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

class ClarifyAdapter implements CliAdapter {
  async *run(_input: CliRunInput): AsyncIterable<CliEvent> {
    yield {
      type: "clarification",
      id: "clar-1",
      prompt: "Pick one",
      options: [
        { id: "a", label: "Alpha" },
        { id: "b", label: "Beta" },
      ],
    };
    yield { type: "done", sessionId: "sess-1" };
  }
}

describe("ClarificationService", () => {
  let dir: string;
  let store: JsonStore;
  let chat: ChatService;
  let clarifications: ClarificationService;
  let topicId: string;
  let botId: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "ml-aos-clarify-"));
    store = new JsonStore(dir);
    await store.save(await emptyState(dir));

    const workspaceService = new WorkspaceService(store);
    const botService = new BotService(store);
    chat = new ChatService(store, workspaceService, botService, new ClarifyAdapter());
    clarifications = new ClarificationService(store);

    const workspace = await workspaceService.create({
      name: "demo",
      localPath: dir,
    });
    const topic = await chat.createTopic({
      workspaceId: workspace.id,
      title: "Clarify topic",
    });
    topicId = topic.id;

    const bot = await botService.create({
      name: "Dev",
      role: "developer",
      defaultEngine: "mock",
      instructions: "",
      enabled: true,
    });
    botId = bot.id;
  });

  it("lists pending clarifications from chat messages", async () => {
    await chat.sendMessage(topicId, {
      content: "[clarify] need choice",
      mentionBotId: botId,
    });

    const pending = await clarifications.list({ status: "pending" });
    expect(pending).toHaveLength(1);
    expect(pending[0].kind).toBe("clarification");
    expect(pending[0].clarification?.status).toBe("pending");
  });

  it("answer marks clarification answered and appends system message", async () => {
    await chat.sendMessage(topicId, {
      content: "[clarify] need choice",
      mentionBotId: botId,
    });

    const pending = await clarifications.list({ status: "pending" });
    const clarificationId = pending[0].clarification!.id;

    const updated = await clarifications.answer(clarificationId, {
      optionId: "a",
    });
    expect(updated.clarification?.status).toBe("answered");
    expect(updated.clarification?.selectedOptionId).toBe("a");

    const messages = await chat.listMessages(topicId);
    const systemMsg = messages.find((m) => m.author === "system");
    expect(systemMsg).toBeTruthy();
    expect(systemMsg!.content).toContain("Alpha");
  });
});
