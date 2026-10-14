import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  TicketPullScheduleService,
  type TicketPullPort,
} from "./ticket-pull-schedule.js";

function port(overrides?: Partial<TicketPullPort>): TicketPullPort & {
  dispatched: number[];
} {
  const dispatched: number[] = [];
  return {
    dispatched,
    listProjects: async () => [
      { id: "proj", localPath: "E:/demo", cast: [] },
    ],
    listTodos: async () => [
      { id: 1, ident: "A", priority: "严重" },
      { id: 2, ident: "B", priority: "主要" },
      { id: 3, ident: "C", priority: "次要" },
      { id: 4, ident: "D", priority: "" },
      { id: 5, ident: "E", priority: "紧急", topicId: "topic-1" },
    ],
    dispatchToCeo: async (input) => {
      dispatched.push(input.issueId);
    },
    ...overrides,
  };
}

describe("TicketPullScheduleService", () => {
  it("adds a draft task and refuses a second one for the same project", async () => {
    const dir = await mkdtemp(join(tmpdir(), "ml-aos-pull-"));
    const service = new TicketPullScheduleService(dir, port());
    const task = await service.add({
      projectId: "proj",
      everyHours: 1,
      priority: "major",
    });
    expect(task.status).toBe("draft");
    expect(task.nextRunAt).toBeUndefined();
    await expect(
      service.add({ projectId: "proj", everyHours: 2, priority: "severe" }),
    ).rejects.toThrow("该项目已有定时任务");
  });

  it("manual run hands matching tickets to CEO without starting the schedule", async () => {
    const dir = await mkdtemp(join(tmpdir(), "ml-aos-pull-"));
    const tickets = port();
    const service = new TicketPullScheduleService(dir, tickets);
    const task = await service.add({
      projectId: "proj",
      everyHours: 1,
      priority: "major",
    });
    const ran = await service.run(task.id);
    expect(ran.status).toBe("draft");
    expect(ran.nextRunAt).toBeUndefined();
    expect(tickets.dispatched).toEqual([1, 2]);
    expect(ran.lastResult).toBe("拉到 5 张，新交给 CEO 2 张");
  });

  it("none threshold also hands unprioritized tickets and skips 次要", async () => {
    const dir = await mkdtemp(join(tmpdir(), "ml-aos-pull-"));
    const tickets = port();
    const service = new TicketPullScheduleService(dir, tickets);
    const task = await service.add({
      projectId: "proj",
      everyHours: 1,
      priority: "none",
    });
    await service.run(task.id);
    expect(tickets.dispatched).toEqual([1, 2, 4]);
  });

  it("starts later, and tick dispatches only when due", async () => {
    const dir = await mkdtemp(join(tmpdir(), "ml-aos-pull-"));
    const tickets = port();
    const service = new TicketPullScheduleService(dir, tickets);
    const created = await service.add({
      projectId: "proj",
      everyHours: 1,
      priority: "severe",
    });
    const now = new Date("2026-10-13T09:00:00.000Z");
    const started = await service.start(created.id, now);
    expect(started.status).toBe("active");
    expect(started.nextRunAt).toBe("2026-10-13T10:00:00.000Z");

    await service.tick(now.getTime() + 30 * 60 * 1000);
    expect(tickets.dispatched).toEqual([]);

    await service.tick(new Date("2026-10-13T10:00:00.000Z").getTime());
    expect(tickets.dispatched).toEqual([1]);
    const [after] = await service.list();
    expect(after?.lastResult).toBe("拉到 5 张，新交给 CEO 1 张");
    expect(after?.nextRunAt).toBe("2026-10-13T11:00:00.000Z");
  });

  it("pause stops later ticks until resume", async () => {
    const dir = await mkdtemp(join(tmpdir(), "ml-aos-pull-"));
    const tickets = port();
    const service = new TicketPullScheduleService(dir, tickets);
    const created = await service.add({
      projectId: "proj",
      everyHours: 1,
      priority: "severe",
    });
    await service.start(created.id, new Date("2026-10-13T09:00:00.000Z"));
    await service.pause(created.id);
    await service.tick(new Date("2026-10-13T12:00:00.000Z").getTime());
    expect(tickets.dispatched).toEqual([]);
    const resumed = await service.resume(
      created.id,
      new Date("2026-10-13T12:00:00.000Z"),
    );
    expect(resumed.status).toBe("active");
    expect(resumed.nextRunAt).toBe("2026-10-13T13:00:00.000Z");
  });

  it("records a missing work directory without dispatching", async () => {
    const dir = await mkdtemp(join(tmpdir(), "ml-aos-pull-"));
    const tickets = port({
      listProjects: async () => [{ id: "proj", localPath: "  ", cast: ["developer"] }],
    });
    const service = new TicketPullScheduleService(dir, tickets);
    const task = await service.add({
      projectId: "proj",
      everyHours: 2,
      priority: "major",
    });
    await expect(service.run(task.id)).rejects.toThrow("本地工作目录");
    const [saved] = await service.list();
    expect(saved?.lastResult).toContain("本地工作目录");
    expect(saved?.status).toBe("draft");
    expect(tickets.dispatched).toEqual([]);
  });
});
