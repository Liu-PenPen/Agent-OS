import { describe, expect, it } from "vitest";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { JsonStore } from "../store/json-store.js";
import { BotService } from "./bot-service.js";
import { TeamHandoff } from "./team-handoff.js";
import { AppControl } from "./app-control.js";
import { looksLikeProductDelivery } from "./product-spec-submission.js";
import type { BotRunRequest, BotRunService } from "./bot-run-service.js";
import type { AppState } from "../app-state.js";

describe("looksLikeProductDelivery", () => {
  it("accepts a written spec path", () => {
    expect(
      looksLikeProductDelivery(
        "????? docs/product-spec.md?????????????Tickets?????????",
      ),
    ).toBe(true);
  });
});

async function baseState(dir: string): Promise<AppState> {
  return {
    settings: {
      theme: "light",
      defaultEngine: "claude",
      dataDir: dir,
      notifications: true,
    },
    bots: [],
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
        content:
          "????? docs/product-spec.md???????? Tickets?",
        createdAt: new Date().toISOString(),
      },
    ],
    pipelines: [],
  };
}

describe("TeamHandoff (agent-os isomorphic)", () => {
  it("opens a spec confirm card instead of auto-starting development", async () => {
    const dir = await mkdtemp(join(tmpdir(), "ml-aos-handoff-"));
    const store = new JsonStore(dir);
    await store.save(await baseState(dir));
    const bots = new BotService(store);
    await bots.create({
      name: "CEO??",
      role: "ceo",
      defaultEngine: "claude",
      instructions: "",
      enabled: true,
    });
    await bots.create({
      name: "????",
      role: "product",
      defaultEngine: "claude",
      instructions: "",
      enabled: true,
    });
    const starts: BotRunRequest[] = [];
    const botRun = {
      isDiscarded: () => false,
      start: async (req: BotRunRequest) => {
        starts.push(req);
      },
      clearCliSession: async () => undefined,
    };
    const control = new AppControl(
      store,
      bots,
      botRun as unknown as BotRunService,
      dir,
    );
    const handoff = new TeamHandoff(
      store,
      bots,
      botRun as unknown as BotRunService,
      undefined,
      control,
    );
    await handoff.handle({
      req: {
        topicId: "topic-1",
        botId: "product",
        prompt: "???",
        origin: "handoff",
      },
      result: { ok: true, messageId: "msg-1" },
      bot: { id: "product", name: "????", role: "product" },
    });

    expect(starts).toHaveLength(0);
    const card = (await store.load()).messages.find((m) => m.kind === "app-tool");
    expect(card?.appTool?.tool).toBe("spec");
  });

  it("reports developer results to CEO instead of auto-starting tester", async () => {
    const dir = await mkdtemp(join(tmpdir(), "ml-aos-report-ceo-"));
    const store = new JsonStore(dir);
    await store.save({
      ...(await baseState(dir)),
      messages: [
        {
          id: "msg-1",
          topicId: "topic-1",
          author: "bot",
          content: "????????????",
          createdAt: new Date().toISOString(),
        },
      ],
    });
    const bots = new BotService(store);
    const ceo = await bots.create({
      name: "CEO??",
      role: "ceo",
      defaultEngine: "claude",
      instructions: "",
      enabled: true,
    });
    await bots.create({
      name: "?????",
      role: "tester",
      defaultEngine: "claude",
      instructions: "",
      enabled: true,
    });
    const starts: BotRunRequest[] = [];
    const botRun = {
      isDiscarded: () => false,
      start: async (req: BotRunRequest) => {
        starts.push(req);
      },
      clearCliSession: async () => undefined,
    };
    const handoff = new TeamHandoff(
      store,
      bots,
      botRun as unknown as BotRunService,
    );
    await handoff.handle({
      req: {
        topicId: "topic-1",
        botId: "developer",
        prompt: "??",
        origin: "handoff",
      },
      result: { ok: true, messageId: "msg-1" },
      bot: { id: "developer", name: "?????", role: "developer" },
    });
    expect(starts).toHaveLength(1);
    expect(starts[0]?.botId).toBe(ceo.id);
    expect(starts[0]?.prompt).toContain("dispatch_task");
  });

  it("corrects CEO when feature task has verbal dispatch only", async () => {
    const dir = await mkdtemp(join(tmpdir(), "ml-aos-ceo-guard-"));
    const store = new JsonStore(dir);
    await store.save({
      ...(await baseState(dir)),
      messages: [
        {
          id: "msg-1",
          topicId: "topic-1",
          author: "bot",
          content: "已交给 product，请产品经理澄清需求。",
          createdAt: new Date().toISOString(),
        },
      ],
    });
    const bots = new BotService(store);
    const ceo = await bots.create({
      name: "CEO助理",
      role: "ceo",
      defaultEngine: "claude",
      instructions: "",
      enabled: true,
    });
    await bots.create({
      name: "产品经理",
      role: "product",
      defaultEngine: "claude",
      instructions: "",
      enabled: true,
    });
    const starts: BotRunRequest[] = [];
    const botRun = {
      isDiscarded: () => false,
      start: async (req: BotRunRequest) => {
        starts.push(req);
      },
      clearCliSession: async () => undefined,
    };
    const handoff = new TeamHandoff(
      store,
      bots,
      botRun as unknown as BotRunService,
    );
    await handoff.handle({
      req: {
        topicId: "topic-1",
        botId: ceo.id,
        prompt: "增加一个登录页面",
        origin: "chat",
      },
      result: { ok: true, messageId: "msg-1" },
      bot: { id: ceo.id, name: "CEO助理", role: "ceo" },
    });
    expect(starts).toHaveLength(1);
    expect(starts[0]?.origin).toBe("correction");
    expect(starts[0]?.clearSession).toBe(true);
    expect(starts[0]?.prompt).toContain("dispatch_task");
  });

  it("does not force dispatch when CEO origin is handoff (worker report-back)", async () => {
    const dir = await mkdtemp(join(tmpdir(), "ml-aos-ceo-collab-"));
    const store = new JsonStore(dir);
    await store.save({
      ...(await baseState(dir)),
      messages: [
        {
          id: "msg-1",
          topicId: "topic-1",
          author: "bot",
          content: "方案明确，请点击启动流水线或 @开发工程师",
          createdAt: new Date().toISOString(),
        },
      ],
    });
    const bots = new BotService(store);
    const ceo = await bots.create({
      name: "CEO",
      role: "ceo",
      defaultEngine: "claude",
      instructions: "",
      enabled: true,
    });
    await bots.create({
      name: "Dev",
      role: "developer",
      defaultEngine: "claude",
      instructions: "",
      enabled: true,
    });
    const starts: BotRunRequest[] = [];
    const botRun = {
      isDiscarded: () => false,
      start: async (req: BotRunRequest) => {
        starts.push(req);
      },
      clearCliSession: async () => undefined,
    };
    const handoff = new TeamHandoff(
      store,
      bots,
      botRun as unknown as BotRunService,
    );
    await handoff.handle({
      req: {
        topicId: "topic-1",
        botId: ceo.id,
        prompt: "成员已交回结果",
        origin: "handoff",
      },
      result: {
        ok: true,
        messageId: "msg-1",
        toolCalls: [{ name: "Bash", input: { command: "ls" } }],
      },
      bot: { id: ceo.id, name: "CEO", role: "ceo" },
    });
    expect(starts).toHaveLength(0);
  });

  it("falls back to developer when no product bot after failed correction", async () => {
    const dir = await mkdtemp(join(tmpdir(), "ml-aos-ceo-dev-fallback-"));
    const store = new JsonStore(dir);
    await store.save({
      ...(await baseState(dir)),
      messages: [
        {
          id: "msg-1",
          topicId: "topic-1",
          author: "bot",
          content: "请点击启动流水线",
          createdAt: new Date().toISOString(),
        },
      ],
    });
    const bots = new BotService(store);
    const ceo = await bots.create({
      name: "CEO",
      role: "ceo",
      defaultEngine: "claude",
      instructions: "",
      enabled: true,
    });
    const developer = await bots.create({
      name: "Dev",
      role: "developer",
      defaultEngine: "claude",
      instructions: "",
      enabled: true,
    });
    const starts: BotRunRequest[] = [];
    const dispatches: Array<{ targetBotId: string }> = [];
    const botRun = {
      isDiscarded: () => false,
      start: async (req: BotRunRequest) => {
        starts.push(req);
      },
      clearCliSession: async () => undefined,
    };
    const control = {
      handle: async () => false,
      dispatchTask: async (
        _topicId: string,
        _from: { id: string; name: string },
        request: { targetBotId: string },
      ) => {
        dispatches.push(request);
      },
    };
    const handoff = new TeamHandoff(
      store,
      bots,
      botRun as unknown as BotRunService,
      undefined,
      control as unknown as AppControl,
    );
    await handoff.handle({
      req: {
        topicId: "topic-1",
        botId: ceo.id,
        prompt: "修复 Tab 跳转缺陷",
        origin: "correction",
      },
      result: { ok: true, messageId: "msg-1" },
      bot: { id: ceo.id, name: "CEO", role: "ceo" },
    });
    expect(dispatches).toHaveLength(1);
    expect(dispatches[0]?.targetBotId).toBe("developer");
    expect(developer.role).toBe("developer");
  });

  it("falls back to developer when Cast excludes product even if product bot exists", async () => {
    const dir = await mkdtemp(join(tmpdir(), "ml-aos-ceo-cast-fallback-"));
    const store = new JsonStore(dir);
    await writeFile(
      join(dir, "gitee-dispatches.json"),
      `${JSON.stringify({
        byIssueId: {
          "1": {
            topicId: "topic-1",
            cast: ["ceo", "developer", "reviewer"],
          },
        },
      })}\n`,
    );
    await store.save({
      ...(await baseState(dir)),
      messages: [
        {
          id: "msg-1",
          topicId: "topic-1",
          author: "bot",
          content: "请点击启动流水线，或直接 @开发工程师",
          createdAt: new Date().toISOString(),
        },
      ],
    });
    const bots = new BotService(store);
    const ceo = await bots.create({
      name: "CEO",
      role: "ceo",
      defaultEngine: "claude",
      instructions: "",
      enabled: true,
    });
    await bots.create({
      name: "产品",
      role: "product",
      defaultEngine: "claude",
      instructions: "",
      enabled: true,
    });
    await bots.create({
      name: "Dev",
      role: "developer",
      defaultEngine: "claude",
      instructions: "",
      enabled: true,
    });
    const dispatches: Array<{ targetBotId: string }> = [];
    const botRun = {
      isDiscarded: () => false,
      start: async () => undefined,
      clearCliSession: async () => undefined,
    };
    const control = {
      handle: async () => false,
      dispatchTask: async (
        _topicId: string,
        _from: { id: string; name: string },
        request: { targetBotId: string },
      ) => {
        dispatches.push(request);
      },
    };
    const handoff = new TeamHandoff(
      store,
      bots,
      botRun as unknown as BotRunService,
      undefined,
      control as unknown as AppControl,
    );
    await handoff.handle({
      req: {
        topicId: "topic-1",
        botId: ceo.id,
        prompt: "修复算法选配跳转",
        origin: "correction",
      },
      result: { ok: true, messageId: "msg-1" },
      bot: { id: ceo.id, name: "CEO", role: "ceo" },
    });
    expect(dispatches).toHaveLength(1);
    expect(dispatches[0]?.targetBotId).toBe("developer");
  });

  it("falls back to product after failed CEO correction", async () => {
    const dir = await mkdtemp(join(tmpdir(), "ml-aos-ceo-fallback-"));
    const store = new JsonStore(dir);
    await store.save({
      ...(await baseState(dir)),
      messages: [
        {
          id: "msg-1",
          topicId: "topic-1",
          author: "bot",
          content: "已口头交给产品",
          createdAt: new Date().toISOString(),
        },
      ],
    });
    const bots = new BotService(store);
    const ceo = await bots.create({
      name: "CEO助理",
      role: "ceo",
      defaultEngine: "claude",
      instructions: "",
      enabled: true,
    });
    const product = await bots.create({
      name: "产品经理",
      role: "product",
      defaultEngine: "claude",
      instructions: "",
      enabled: true,
    });
    const starts: BotRunRequest[] = [];
    const botRun = {
      isDiscarded: () => false,
      start: async (req: BotRunRequest) => {
        starts.push(req);
      },
      clearCliSession: async () => undefined,
    };
    const control = new AppControl(
      store,
      bots,
      botRun as unknown as BotRunService,
      dir,
    );
    const handoff = new TeamHandoff(
      store,
      bots,
      botRun as unknown as BotRunService,
      undefined,
      control,
    );
    await handoff.handle({
      req: {
        topicId: "topic-1",
        botId: ceo.id,
        prompt: "实现注册功能",
        origin: "correction",
      },
      result: { ok: true, messageId: "msg-1" },
      bot: { id: ceo.id, name: "CEO助理", role: "ceo" },
    });
    expect(starts.some((s) => s.botId === product.id)).toBe(true);
    expect(starts.find((s) => s.botId === product.id)?.origin).toBe("handoff");
  });
});
