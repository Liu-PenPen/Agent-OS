import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { AgentScheduleService, type AgentSchedulePort } from "./agent-schedule.js";

function port(overrides?: Partial<AgentSchedulePort>): AgentSchedulePort & {
  topics: string[];
  started: string[];
} {
  const topics: string[] = [];
  const started: string[] = [];
  return {
    topics,
    started,
    listBots: async () => [
      { id: "dev", name: "开发工程师", role: "developer", enabled: true },
    ],
    getWorkspace: async (id) =>
      id === "ws" ? { id, name: "演示工作区" } : undefined,
    createTopic: async (input) => {
      topics.push(input.title);
      return { id: `topic-${topics.length}` };
    },
    startBot: async (input) => {
      started.push(input.prompt);
    },
    ...overrides,
  };
}

describe("AgentScheduleService", () => {
  it("adds a draft without creating a topic", async () => {
    const dir = await mkdtemp(join(tmpdir(), "ml-aos-agent-"));
    const gate = port();
    const service = new AgentScheduleService(dir, gate);
    const task = await service.add({
      prompt: "分析增量日志",
      botId: "dev",
      workspaceId: "ws",
      everyHours: 6,
    });
    expect(task.status).toBe("draft");
    expect(task.topicId).toBeUndefined();
    expect(gate.topics).toEqual([]);
  });

  it("start creates one topic and does not run the bot", async () => {
    const dir = await mkdtemp(join(tmpdir(), "ml-aos-agent-"));
    const gate = port();
    const service = new AgentScheduleService(dir, gate);
    const created = await service.add({
      prompt: "审查当前代码变更",
      botId: "dev",
      workspaceId: "ws",
      everyHours: 1,
    });
    const started = await service.start(
      created.id,
      new Date("2026-10-13T09:00:00.000Z"),
    );
    expect(started.status).toBe("active");
    expect(started.topicId).toBe("topic-1");
    expect(started.nextRunAt).toBe("2026-10-13T10:00:00.000Z");
    expect(gate.started).toEqual([]);
  });

  it("manual run keeps draft status and hands the prompt to the bot", async () => {
    const dir = await mkdtemp(join(tmpdir(), "ml-aos-agent-"));
    const gate = port();
    const service = new AgentScheduleService(dir, gate);
    const created = await service.add({
      prompt: "分析增量日志",
      botId: "dev",
      workspaceId: "ws",
      everyHours: 2,
    });
    const ran = await service.run(created.id);
    expect(ran.status).toBe("draft");
    expect(ran.topicId).toBe("topic-1");
    expect(ran.lastResult).toBe("已交给 开发工程师");
    expect(gate.started).toEqual(["定时任务：\n分析增量日志"]);
  });

  it("tick reuses the topic created at start", async () => {
    const dir = await mkdtemp(join(tmpdir(), "ml-aos-agent-"));
    const gate = port();
    const service = new AgentScheduleService(dir, gate);
    const created = await service.add({
      prompt: "分析增量日志",
      botId: "dev",
      workspaceId: "ws",
      everyHours: 1,
    });
    await service.start(created.id, new Date("2026-10-13T09:00:00.000Z"));
    await service.tick(new Date("2026-10-13T10:00:00.000Z").getTime());
    expect(gate.topics).toEqual(["分析增量日志"]);
    expect(gate.started).toEqual(["定时任务：\n分析增量日志"]);
  });
});
