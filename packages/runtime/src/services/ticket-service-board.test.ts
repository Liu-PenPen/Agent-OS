import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { JsonStore } from "../store/json-store.js";
import type { AppState } from "../app-state.js";
import { BotService } from "./bot-service.js";
import { WorkspaceService } from "./workspace-service.js";
import { SettingsService } from "./settings-service.js";
import { ChatService } from "./chat-service.js";
import { BotRunService } from "./bot-run-service.js";
import { MockCliAdapter } from "../cli/mock-adapter.js";
import {
  TaskBoardService,
  boardTaskIdForGitee,
} from "./task-board-service.js";
import type { GiteeProjectsStore } from "../gitee/projects.js";
import type { GiteeIssueDetail } from "../gitee/client.js";

const getIssueDetail = vi.fn();
const listIssueTypeStates = vi.fn();
const giteeUpdateIssueState = vi.fn();
const downloadIssueImages = vi.fn(async () => []);

vi.mock("../gitee/client.js", () => ({
  getIssueDetail: (...args: unknown[]) => getIssueDetail(...args),
  listIssueTypeStates: (...args: unknown[]) => listIssueTypeStates(...args),
  updateIssueState: (...args: unknown[]) => giteeUpdateIssueState(...args),
  listMyTodoIssues: vi.fn(async () => []),
  giteeConfigured: () => true,
  readGiteeEnvConfig: () => ({
    token: "t",
    enterpriseId: "1",
    userId: "2",
    apiBase: "https://example.com",
  }),
}));

vi.mock("../gitee/issue-assets.js", () => ({
  downloadIssueImages: (...args: unknown[]) => downloadIssueImages(...args),
}));

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

function isRetryableRmError(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err.code === "ENOTEMPTY" || err.code === "EBUSY" || err.code === "EPERM")
  );
}

async function rmTempDir(dir: string): Promise<void> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await rm(dir, { recursive: true, force: true });
      return;
    } catch (err) {
      if (!isRetryableRmError(err) || attempt === 2) {
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }
}

function fakeDetail(overrides?: Partial<GiteeIssueDetail>): GiteeIssueDetail {
  return {
    id: 42,
    ident: "TEST-42",
    title: "示例工单",
    stateTitle: "进行中",
    sprintTitle: "Sprint 1",
    programId: "818309",
    url: "https://gitee.com/issues/42",
    priority: "P1",
    priorityRank: 1,
    description: "desc",
    authorName: "alice",
    imageUrls: [],
    issueTypeId: 7,
    ...overrides,
  };
}

describe("TicketService board + state APIs", () => {
  let dir: string;
  let store: JsonStore;
  let taskBoard: TaskBoardService;
  let ticketService: InstanceType<
    typeof import("./ticket-service.js").TicketService
  >;

  beforeEach(async () => {
    vi.resetModules();
    getIssueDetail.mockReset();
    listIssueTypeStates.mockReset();
    giteeUpdateIssueState.mockReset();
    downloadIssueImages.mockReset();
    downloadIssueImages.mockResolvedValue([]);

    dir = await mkdtemp(join(tmpdir(), "ml-aos-ticket-board-"));
    store = new JsonStore(dir);
    await store.save(await emptyState(dir));

    const workspaceService = new WorkspaceService(store);
    const botService = new BotService(store);
    const settingsService = new SettingsService(store);
    const adapter = new MockCliAdapter();
    const botRunService = new BotRunService(
      store,
      workspaceService,
      botService,
      settingsService,
      undefined,
      adapter,
    );
    const chatService = new ChatService(
      store,
      workspaceService,
      botService,
      adapter,
    );
    taskBoard = new TaskBoardService(dir);

    await botService.create({
      name: "CEO",
      role: "ceo",
      defaultEngine: "claude",
      instructions: "lead",
      enabled: true,
    });

    const projectsStore = {
      get: async () => ({
        id: "818309",
        name: "Demo",
        programId: "818309",
        localPath: dir,
        defaultEngine: "claude" as const,
        cast: ["ceo" as const, "developer" as const],
      }),
      list: async () => [],
      updateSettings: async () => {
        throw new Error("unused");
      },
    } as unknown as GiteeProjectsStore;

    const { TicketService } = await import("./ticket-service.js");
    ticketService = new TicketService(
      dir,
      store,
      workspaceService,
      botService,
      chatService,
      botRunService,
      projectsStore,
      taskBoard,
    );
  });

  afterEach(async () => {
    await rmTempDir(dir);
  });

  it("dispatchToCeo upserts a running board row", async () => {
    getIssueDetail.mockResolvedValue(fakeDetail());

    const result = await ticketService.dispatchToCeo({
      projectId: "818309",
      issueId: 42,
    });

    expect(result.topicId).toBeTruthy();
    const id = boardTaskIdForGitee("818309", "TEST-42");
    const row = await taskBoard.findByGiteeIssueId(42);
    expect(row?.id).toBe(id);
    expect(row?.status).toBe("running");
    expect(row?.source).toBe("gitee");
    expect(row?.topicId).toBe(result.topicId);
    expect(row?.botId).toBe(result.botId);
    expect(row?.stage).toBe("idle");
    expect(row?.gitee?.issueTypeId).toBe(7);
    expect(row?.title).toContain("TEST-42");
  });

  it("listIssueStates requires issueTypeId then lists type states", async () => {
    getIssueDetail.mockResolvedValue(fakeDetail({ issueTypeId: undefined }));
    await expect(ticketService.listIssueStates("818309", 42)).rejects.toThrow(
      /issue_type/,
    );

    getIssueDetail.mockResolvedValue(fakeDetail());
    listIssueTypeStates.mockResolvedValue([
      { id: 10, title: "已完成" },
      { id: 11, title: "进行中" },
    ]);
    const states = await ticketService.listIssueStates("818309", 42);
    expect(listIssueTypeStates).toHaveBeenCalledWith(7);
    expect(states).toEqual([
      { id: 10, title: "已完成" },
      { id: 11, title: "进行中" },
    ]);
  });

  it("updateIssueState syncs board ledger", async () => {
    await taskBoard.upsert({
      id: boardTaskIdForGitee("818309", "TEST-42"),
      title: "TEST-42 示例工单",
      status: "running",
      source: "gitee",
      gitee: {
        programId: "818309",
        issueId: 42,
        issueIdent: "TEST-42",
        url: "https://gitee.com/issues/42",
        issueTypeId: 7,
      },
    });

    getIssueDetail.mockResolvedValue(fakeDetail());
    giteeUpdateIssueState.mockResolvedValue({
      stateId: 10,
      stateTitle: "已完成",
    });

    const synced = await ticketService.updateIssueState({
      projectId: "818309",
      issueId: 42,
      issueStateId: 10,
    });
    expect(synced).toEqual({ stateId: 10, stateTitle: "已完成" });
    expect(getIssueDetail).toHaveBeenCalledWith(42);
    expect(giteeUpdateIssueState).toHaveBeenCalledWith({
      issueId: 42,
      issueStateId: 10,
    });

    const row = await taskBoard.findByGiteeIssueId(42);
    expect(row?.gitee?.lastSyncedStateId).toBe(10);
    expect(row?.gitee?.lastSyncedStateTitle).toBe("已完成");
    expect(row?.gitee?.lastSyncedAt).toBeTruthy();
  });

  it("updateIssueState rejects issue from another program", async () => {
    getIssueDetail.mockResolvedValue(fakeDetail({ programId: "999999" }));

    await expect(
      ticketService.updateIssueState({
        projectId: "818309",
        issueId: 42,
        issueStateId: 10,
      }),
    ).rejects.toThrow(/不属于当前项目/);
    expect(giteeUpdateIssueState).not.toHaveBeenCalled();
  });
});
