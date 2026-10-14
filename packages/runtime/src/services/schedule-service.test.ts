import { describe, expect, it } from "vitest";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ScheduleService, cronMatches } from "./schedule-service.js";

describe("ScheduleService", () => {
  it("creates, pauses, and lists a task", async () => {
    const dir = await mkdtemp(join(tmpdir(), "ml-aos-schedule-"));
    const service = new ScheduleService(dir, async () => undefined);
    const notice = await service.manage(
      {
        action: "add",
        targetBotId: "developer",
        prompt: "巡检日志",
        rule: { kind: "interval", everyMs: 60_000 },
      },
      "topic-1",
    );
    expect(notice).toContain("已创建");
    const [task] = await service.list();
    expect(task?.status).toBe("active");
    expect(task?.prompt).toBe("巡检日志");
    await service.manage({ action: "pause", id: task!.id }, "topic-1");
    const [paused] = await service.list();
    expect(paused?.status).toBe("paused");
  });

  it("matches a wildcard cron minute", () => {
    const date = new Date("2026-09-21T08:15:00Z");
    expect(cronMatches("* * * * *", date, "UTC")).toBe(true);
  });
});
