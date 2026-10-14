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

async function waitForPending(
  clarifications: ClarificationService,
  attempts = 80,
) {
  for (let i = 0; i < attempts; i++) {
    const pending = await clarifications.list({ status: "pending" });
    if (pending.length > 0) return pending;
    await new Promise((r) => setTimeout(r, 25));
  }
  throw new Error("Timed out waiting for clarification");
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
      defaultEngine: "claude",
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

    const pending = await waitForPending(clarifications);
    expect(pending).toHaveLength(1);
    expect(pending[0].kind).toBe("clarification");
    expect(pending[0].clarification?.status).toBe("pending");
  });

  it("answer marks clarification answered and appends system message", async () => {
    await chat.sendMessage(topicId, {
      content: "[clarify] need choice",
      mentionBotId: botId,
    });

    const pending = await waitForPending(clarifications);
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

  it("calls pipelineRunner.resume after answer when topic has active pipeline", async () => {
    const resumes: Array<{ topicId: string; label: string }> = [];
    clarifications = new ClarificationService(store, undefined, {
      resume(tid, label) {
        resumes.push({ topicId: tid, label });
      },
    });

    await chat.sendMessage(topicId, {
      content: "[clarify] need choice",
      mentionBotId: botId,
    });

    const pending = await waitForPending(clarifications);
    // Allow any trailing async bot-run store writes to settle before mutating topic
    await new Promise((r) => setTimeout(r, 50));

    const state = await store.load();
    const topic = state.topics.find((t) => t.id === topicId)!;
    topic.pipelineTaskId = "pipe-1";
    topic.pipelineStage = "developing";
    await store.save(state);

    await clarifications.answer(pending[0].clarification!.id, {
      optionId: "a",
    });

    expect(resumes).toEqual([{ topicId, label: "Alpha" }]);
  });
});
