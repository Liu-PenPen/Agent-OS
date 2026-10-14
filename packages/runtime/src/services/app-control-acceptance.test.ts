import { describe, expect, it } from "vitest";
import { mkdtemp, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { JsonStore } from "../store/json-store.js";
import { BotService } from "./bot-service.js";
import { AppControl } from "./app-control.js";
import { AcceptanceService } from "./acceptance-service.js";
import { AcceptanceRunner } from "./acceptance-runner.js";
import type { BotRunService } from "./bot-run-service.js";
import type { AppState } from "../app-state.js";

describe("AppControl acceptance gate", () => {
  it("persists submit_acceptance and posts an acceptance card", async () => {
    const dir = await mkdtemp(join(tmpdir(), "ml-aos-acc-ctrl-"));
    const store = new JsonStore(dir);
    const state: AppState = {
      settings: {
        theme: "light",
        defaultEngine: "claude",
        dataDir: dir,
        notifications: true,
      },
      bots: [],
      workspaces: [
        {
          id: "ws-1",
          name: "demo",
          localPath: join(dir, "ws"),
        },
      ],
      topics: [
        {
          id: "topic-1",
          workspaceId: "ws-1",
          title: "t",
          createdAt: new Date().toISOString(),
          pipelineStage: "testing",
        },
      ],
      messages: [
        {
          id: "msg-1",
          topicId: "topic-1",
          author: "bot",
          content: "测试完成",
          createdAt: new Date().toISOString(),
        },
      ],
      pipelines: [],
      users: [],
      clarifications: [],
    };
    await store.save(state);
    const bots = new BotService(store);
    const tester = await bots.create({
      name: "测试",
      role: "tester",
      defaultEngine: "claude",
      instructions: "",
      enabled: true,
    });
    const starts: unknown[] = [];
    const botRun = {
      isDiscarded: () => false,
      start: async (req: unknown) => {
        starts.push(req);
      },
      clearCliSession: async () => undefined,
    };
    const acceptance = new AcceptanceService(dir);
    const control = new AppControl(
      store,
      bots,
      botRun as unknown as BotRunService,
      dir,
    );
    control.attachAcceptance(acceptance, new AcceptanceRunner(acceptance));

    const consumed = await control.handle({
      req: {
        topicId: "topic-1",
        botId: tester.id,
        prompt: "请验收",
        origin: "handoff",
      },
      result: {
        ok: true,
        messageId: "msg-1",
        toolCalls: [
          {
            name: "submit_acceptance",
            input: {
              verdict: "pass",
              summary: "核心路径通过",
              checks: [{ id: "c1", title: "首页", status: "pass" }],
              source: "agent-browser",
            },
          },
        ],
      },
      bot: { id: tester.id, name: "测试", role: "tester" },
    });

    // pass → not consumed by HITL; TeamHandoff may still report to CEO
    expect(consumed).toBe(false);
    const latest = await acceptance.latest("topic-1");
    expect(latest?.verdict).toBe("pass");
    const after = await store.load();
    expect(
      after.messages.some(
        (m) => m.appTool?.tool === "acceptance" && m.appTool.acceptanceVerdict === "pass",
      ),
    ).toBe(true);
    const files = await readdir(join(dir, "acceptance", "topic-1"));
    expect(files.some((f) => f.endsWith(".json"))).toBe(true);
    expect(starts).toHaveLength(0);
  });
});
