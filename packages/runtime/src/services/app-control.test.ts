import { describe, expect, it } from "vitest";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { JsonStore } from "../store/json-store.js";
import { BotService } from "./bot-service.js";
import { AppControl } from "./app-control.js";
import { TeamHandoff } from "./team-handoff.js";
import type { BotRunRequest, BotRunService } from "./bot-run-service.js";
import type { AppState } from "../app-state.js";

async function setup() {
  const dir = await mkdtemp(join(tmpdir(), "ml-aos-control-"));
  const store = new JsonStore(dir);
  const state: AppState = {
    settings: {
      theme: "light",
      defaultEngine: "claude",
      dataDir: dir,
      notifications: true,
    },
    bots: [
      {
        id: "ceo",
        name: "CEO??",
        role: "ceo",
        defaultEngine: "claude",
        instructions: "",
        enabled: true,
      },
      {
        id: "product",
        name: "????",
        role: "product",
        defaultEngine: "claude",
        instructions: "",
        enabled: true,
      },
      {
        id: "developer",
        name: "?????",
        role: "developer",
        defaultEngine: "claude",
        instructions: "",
        enabled: true,
      },
    ],
    workspaces: [],
    topics: [
      {
        id: "topic-1",
        workspaceId: "ws-1",
        title: "??",
        createdAt: new Date().toISOString(),
        pipelineStage: "idle",
      },
    ],
    messages: [
      {
        id: "msg-1",
        topicId: "topic-1",
        author: "bot",
        content: "???REVIEW_FAILED????????",
        createdAt: new Date().toISOString(),
      },
    ],
    pipelines: [],
  };
  await store.save(state);
  const starts: BotRunRequest[] = [];
  const botRun = {
    isDiscarded: () => false,
    start: async (req: BotRunRequest) => {
      starts.push(req);
      return { id: "started" };
    },
    clearCliSession: async () => undefined,
  } as unknown as BotRunService;
  const control = new AppControl(store, new BotService(store), botRun, dir);
  const handoff = new TeamHandoff(
    store,
    new BotService(store),
    botRun,
    undefined,
    control,
  );
  return { store, control, handoff, starts };
}

describe("AppControl", () => {
  it("stops on request_clarification and resumes the same bot after the answer", async () => {
    const { store, control, handoff, starts } = await setup();
    await handoff.handle({
      req: { topicId: "topic-1", botId: "product", prompt: "???" },
      result: {
        ok: true,
        messageId: "msg-1",
        toolCalls: [
          {
            name: "mcp__agent_os__request_clarification",
            input: {
              title: "????",
              questions: [
                {
                  id: "auth",
                  prompt: "????",
                  options: [
                    { id: "a", label: "??" },
                    { id: "b", label: "???" },
                  ],
                },
              ],
            },
          },
        ],
      },
      bot: { id: "product", name: "????", role: "product" },
    });
    expect(starts).toHaveLength(0);
    const saved = await store.load();
    const card = saved.messages.find((message) => message.kind === "app-tool");
    expect(card?.appTool?.tool).toBe("clarification");
    expect(card?.appTool?.questions).toHaveLength(1);
    expect(card?.appTool?.questions?.[0]?.options[0]?.label).toBe("??");
    await control.answer("topic-1", {
      token: card!.appTool!.token,
      action: "clarification",
      answer: "1. ???????",
    });
    expect(starts[0]?.botId).toBe("product");
    expect(starts[0]?.origin).toBe("resume");
    expect(starts[0]?.prompt).toContain("??");
  });

  it("dispatches the bot named by dispatch_task", async () => {
    const { handoff, starts } = await setup();
    await handoff.handle({
      req: {
        topicId: "topic-1",
        botId: "ceo",
        prompt: "???",
        origin: "chat",
      },
      result: {
        ok: true,
        messageId: "msg-1",
        toolCalls: [
          {
            name: "dispatch_task",
            input: {
              targetBotId: "developer",
              objective: "????",
              instruction: "?????",
            },
          },
        ],
      },
      bot: { id: "ceo", name: "CEO??", role: "ceo" },
    });
    expect(starts[0]?.botId).toBe("developer");
    expect(starts[0]?.prompt).toContain("????");
  });

  it("sends a failed review back to the developer", async () => {
    const { handoff, starts } = await setup();
    await handoff.handle({
      req: {
        topicId: "topic-1",
        botId: "reviewer",
        prompt: "??",
        origin: "handoff",
      },
      result: { ok: true, messageId: "msg-1" },
      bot: { id: "reviewer", name: "??", role: "reviewer" },
    });
    expect(starts[0]?.botId).toBe("developer");
    expect(starts[0]?.prompt).toContain("REVIEW_FAILED");
  });

  it("posts a spec card from request_spec_approval and does not hand off", async () => {
    const { store, handoff, starts } = await setup();
    await handoff.handle({
      req: {
        topicId: "topic-1",
        botId: "product",
        prompt: "???",
        origin: "handoff",
      },
      result: {
        ok: true,
        messageId: "msg-1",
        toolCalls: [
          {
            name: "request_spec_approval",
            input: {
              deliveryMode: "local",
              title: "????",
              summary: "????",
              specPath: "docs/product-spec.md",
              ticketsPath: "docs/product-spec.md",
            },
          },
        ],
      },
      bot: { id: "product", name: "????", role: "product" },
    });
    expect(starts).toHaveLength(0);
    const card = (await store.load()).messages.find((m) => m.kind === "app-tool");
    expect(card?.appTool?.tool).toBe("spec");
    expect(card?.appTool?.status).toBe("pending");
  });
});
