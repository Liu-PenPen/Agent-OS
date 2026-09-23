import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  TaskBoardService,
  boardTaskIdForGitee,
} from "./task-board-service.js";

describe("TaskBoardService", () => {
  let dir: string;
  let svc: TaskBoardService;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "ml-aos-board-"));
    svc = new TaskBoardService(dir);
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("upserts running then markCompleted", async () => {
    const id = boardTaskIdForGitee("818309", "TEST-1");
    await svc.upsert({
      id,
      title: "示例",
      status: "running",
      source: "gitee",
      gitee: {
        programId: "818309",
        issueId: 1,
        issueIdent: "TEST-1",
        url: "https://example.com",
      },
      topicId: "t1",
      stage: "developing",
    });
    await svc.markCompleted(id, { stage: "completed" });
    const rows = await svc.list({ status: "completed" });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.completedAt).toBeTruthy();
    expect(rows[0]?.stage).toBe("completed");
  });

  it("markFailed sets pipeline_blocked", async () => {
    const id = boardTaskIdForGitee("818309", "TEST-2");
    await svc.upsert({
      id,
      title: "x",
      status: "running",
      source: "gitee",
    });
    await svc.markFailed(id, "pipeline_blocked", { stage: "blocked" });
    const row = (await svc.list())[0];
    expect(row?.status).toBe("failed");
    expect(row?.failureReason).toBe("pipeline_blocked");
  });

  it("recordGiteeSync writes lastSynced*", async () => {
    const id = boardTaskIdForGitee("818309", "TEST-3");
    await svc.upsert({
      id,
      title: "x",
      status: "completed",
      source: "gitee",
      gitee: {
        programId: "818309",
        issueId: 3,
        issueIdent: "TEST-3",
        url: "https://example.com",
      },
    });
    await svc.recordGiteeSync(id, { id: 99, title: "已完成" });
    const row = await svc.findByGiteeIssueId(3);
    expect(row?.gitee?.lastSyncedStateId).toBe(99);
    expect(row?.gitee?.lastSyncedStateTitle).toBe("已完成");
  });

  it("summary counts by status", async () => {
    await svc.upsert({
      id: "a",
      title: "a",
      status: "running",
      source: "pipeline",
    });
    await svc.upsert({
      id: "b",
      title: "b",
      status: "completed",
      source: "pipeline",
    });
    const s = await svc.summary();
    expect(s.running).toBe(1);
    expect(s.completed).toBe(1);
    expect(s.failed).toBe(0);
  });
});
