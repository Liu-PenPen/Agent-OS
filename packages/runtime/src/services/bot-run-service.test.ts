import { describe, it, expect, beforeEach } from "vitest";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { JsonStore } from "../store/json-store.js";
import { BotService } from "./bot-service.js";
import { WorkspaceService } from "./workspace-service.js";
import { SettingsService } from "./settings-service.js";
import { ChatService } from "./chat-service.js";
import { BotRunService, isEmptyToolInput } from "./bot-run-service.js";
import { MockCliAdapter } from "../cli/mock-adapter.js";
import type { AppState } from "../app-state.js";

describe("isEmptyToolInput", () => {
  it("treats {} as empty but keeps MCP tool args", () => {
    expect(isEmptyToolInput(undefined)).toBe(true);
    expect(isEmptyToolInput({})).toBe(true);
    expect(
      isEmptyToolInput({
        deliveryMode: "local",
        title: "??",
        summary: "??",
        specPath: "docs/product-spec.md",
        ticketsPath: "docs/product-spec.md",
      }),
    ).toBe(false);
  });
});

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
      undefined,
      new MockCliAdapter(),
    );
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
    const bot = await botService.create({
      name: "Dev Bot",
      role: "developer",
      defaultEngine: "claude",
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
    expect(
      msgs.some((m) => m.author === "bot" && m.content.includes("Mock")),
    ).toBe(true);
    const reply = msgs.find((m) => m.author === "bot");
    expect(reply?.run?.status).toBe("success");
    expect(reply?.run?.engine).toBe("Claude Code");
    expect(reply?.streaming).toBe(false);
  });

  it("records tool calls on the running reply", async () => {
    const tracing = new BotRunService(
      store,
      new WorkspaceService(store),
      new BotService(store),
      new SettingsService(store),
      undefined,
      {
        async *run() {
          yield {
            type: "tool" as const,
            name: "Read",
            input: { file_path: "src/app.ts" },
          };
          yield { type: "text_delta" as const, text: "???" };
          yield { type: "done" as const, sessionId: "s1" };
        },
      },
    );
    const result = await tracing.run({ topicId, botId, prompt: "read" });
    expect(result.ok).toBe(true);
    const reply = (await chat.listMessages(topicId)).find(
      (m) => m.author === "bot",
    );
    expect(reply?.run?.toolCount).toBe(1);
    expect(reply?.run?.tools?.[0]).toEqual({
      name: "Read",
      detail: "src/app.ts",
    });
    expect(reply?.run?.current).toBe("\u6b63\u5728\u5206\u6790\u6267\u884c\u7ed3\u679c");
    expect(reply?.run?.status).toBe("success");
  });

  it("merges streamed empty MCP tool start with later full args", async () => {
    const tracing = new BotRunService(
      store,
      new WorkspaceService(store),
      new BotService(store),
      new SettingsService(store),
      undefined,
      {
        async *run() {
          yield {
            type: "tool" as const,
            name: "mcp__agent_os__request_spec_approval",
            input: {},
          };
          yield {
            type: "tool" as const,
            name: "mcp__agent_os__request_spec_approval",
            input: {
              deliveryMode: "local",
              title: "??",
              summary: "??",
              specPath: "docs/product-spec.md",
              ticketsPath: "docs/product-spec.md",
            },
          };
          yield { type: "done" as const, sessionId: "s-mcp" };
        },
      },
    );
    const result = await tracing.run({ topicId, botId, prompt: "submit" });
    expect(result.ok).toBe(true);
    expect(result.toolCalls).toHaveLength(1);
    expect(result.toolCalls?.[0]?.name).toBe("request_spec_approval");
    expect(result.toolCalls?.[0]?.input).toMatchObject({
      deliveryMode: "local",
      specPath: "docs/product-spec.md",
    });
  });

  it("abort stops a live run and does not continue the handoff", async () => {
    const hanging = new BotRunService(
      store,
      new WorkspaceService(store),
      new BotService(store),
      new SettingsService(store),
      undefined,
      {
        async *run(input) {
          await new Promise<void>((resolve) => {
            if (input.signal?.aborted) {
              resolve();
              return;
            }
            input.signal?.addEventListener("abort", () => resolve(), {
              once: true,
            });
          });
          yield { type: "error" as const, message: "aborted by user" };
        },
      },
    );
    const settled: boolean[] = [];
    hanging.setOnSettled((info) => {
      settled.push(info.result.ok);
    });
    await hanging.start({ topicId, botId, prompt: "go" });
    const result = await hanging.abort(topicId);
    expect(result.aborted).toBe(true);
    for (let i = 0; i < 20 && settled.length === 0; i += 1) {
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    const reply = (await chat.listMessages(topicId)).find(
      (m) => m.author === "bot",
    );
    expect(reply?.streaming).toBe(false);
    expect(reply?.run?.status).toBe("cancelled");
    expect(settled).toEqual([false]);
  });
});
