import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { z } from "zod";

export type BoardTaskStatus = "running" | "completed" | "failed";
export type BoardFailureReason =
  | "cli_crash"
  | "user_reject"
  | "timeout"
  | "pipeline_blocked"
  | "unknown";

export interface BoardGiteeRef {
  programId: string;
  issueId: number;
  issueIdent: string;
  url: string;
  issueTypeId?: number;
  lastSyncedStateId?: number;
  lastSyncedStateTitle?: string;
  lastSyncedAt?: string;
}

export interface BoardTask {
  id: string;
  title: string;
  status: BoardTaskStatus;
  source: "gitee" | "pipeline" | "direct";
  gitee?: BoardGiteeRef;
  topicId?: string;
  pipelineId?: string;
  botId?: string;
  stage?: string;
  tokens?: { input?: number; output?: number; total?: number };
  failureReason?: BoardFailureReason;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
}

const BoardGiteeRefSchema = z.object({
  programId: z.string(),
  issueId: z.number(),
  issueIdent: z.string(),
  url: z.string(),
  issueTypeId: z.number().optional(),
  lastSyncedStateId: z.number().optional(),
  lastSyncedStateTitle: z.string().optional(),
  lastSyncedAt: z.string().optional(),
});

const BoardTaskSchema = z.object({
  id: z.string(),
  title: z.string(),
  status: z.enum(["running", "completed", "failed"]),
  source: z.enum(["gitee", "pipeline", "direct"]),
  gitee: BoardGiteeRefSchema.optional(),
  topicId: z.string().optional(),
  pipelineId: z.string().optional(),
  botId: z.string().optional(),
  stage: z.string().optional(),
  tokens: z
    .object({
      input: z.number().optional(),
      output: z.number().optional(),
      total: z.number().optional(),
    })
    .optional(),
  failureReason: z
    .enum([
      "cli_crash",
      "user_reject",
      "timeout",
      "pipeline_blocked",
      "unknown",
    ])
    .optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
  completedAt: z.string().optional(),
});

const BoardFileSchema = z.object({
  tasks: z.array(BoardTaskSchema).default([]),
});

export function boardTaskIdForGitee(programId: string, ident: string): string {
  return `gitee:${programId}:${ident}`;
}

export function boardTaskIdForPipeline(pipelineId: string): string {
  return `pipeline:${pipelineId}`;
}

function isTodayLocal(iso: string): boolean {
  const date = new Date(iso);
  const now = new Date();
  return (
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()
  );
}

function mergeGitee(
  existing: BoardGiteeRef | undefined,
  incoming: BoardGiteeRef | undefined,
): BoardGiteeRef | undefined {
  if (!existing && !incoming) return undefined;
  if (!existing) return incoming;
  if (!incoming) return existing;
  return { ...existing, ...incoming };
}

export class TaskBoardService {
  private queue: Promise<unknown> = Promise.resolve();

  constructor(private readonly dataDir: string) {}

  private enqueue<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.queue.then(fn, fn);
    this.queue = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  private boardPath(): string {
    return resolve(this.dataDir, "task-board.json");
  }

  private async loadTasks(): Promise<BoardTask[]> {
    try {
      const raw = await readFile(this.boardPath(), "utf8");
      return BoardFileSchema.parse(JSON.parse(raw)).tasks;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw error;
    }
  }

  private async saveTasks(tasks: BoardTask[]): Promise<void> {
    const path = this.boardPath();
    await mkdir(dirname(path), { recursive: true });
    await writeFile(
      path,
      `${JSON.stringify({ tasks }, null, 2)}\n`,
      "utf8",
    );
  }

  private async transact<T>(
    fn: (tasks: BoardTask[]) => T | Promise<T>,
  ): Promise<T> {
    return this.enqueue(async () => {
      const tasks = await this.loadTasks();
      const result = await fn(tasks);
      await this.saveTasks(tasks);
      return result;
    });
  }

  async list(filter?: { status?: BoardTaskStatus }): Promise<BoardTask[]> {
    const tasks = await this.loadTasks();
    if (!filter?.status) return tasks;
    return tasks.filter((t) => t.status === filter.status);
  }

  async summary(): Promise<{
    running: number;
    completed: number;
    failed: number;
    tokensToday: number;
  }> {
    const tasks = await this.loadTasks();
    let running = 0;
    let completed = 0;
    let failed = 0;
    let tokensToday = 0;
    for (const task of tasks) {
      if (task.status === "running") running++;
      else if (task.status === "completed") completed++;
      else if (task.status === "failed") failed++;
      if (isTodayLocal(task.updatedAt)) {
        tokensToday += task.tokens?.total ?? 0;
      }
    }
    return { running, completed, failed, tokensToday };
  }

  async upsert(
    partial: Omit<BoardTask, "createdAt" | "updatedAt"> & {
      id: string;
      title: string;
      status: BoardTaskStatus;
      source: BoardTask["source"];
    },
  ): Promise<BoardTask> {
    return this.transact((tasks) => {
      const now = new Date().toISOString();
      const index = tasks.findIndex((t) => t.id === partial.id);
      if (index >= 0) {
        const existing = tasks[index]!;
        const merged: BoardTask = {
          ...existing,
          ...partial,
          gitee: mergeGitee(existing.gitee, partial.gitee),
          createdAt: existing.createdAt,
          updatedAt: now,
        };
        tasks[index] = merged;
        return merged;
      }
      const created: BoardTask = {
        ...partial,
        createdAt: now,
        updatedAt: now,
      };
      tasks.push(created);
      return created;
    });
  }

  async markCompleted(
    id: string,
    patch?: Partial<Pick<BoardTask, "stage" | "botId">>,
  ): Promise<BoardTask | undefined> {
    return this.transact((tasks) => {
      const index = tasks.findIndex((t) => t.id === id);
      if (index < 0) return undefined;
      const existing = tasks[index]!;
      const now = new Date().toISOString();
      const updated: BoardTask = {
        ...existing,
        ...patch,
        status: "completed",
        updatedAt: now,
        completedAt: existing.completedAt ?? now,
      };
      tasks[index] = updated;
      return updated;
    });
  }

  async markFailed(
    id: string,
    reason: BoardFailureReason,
    patch?: Partial<Pick<BoardTask, "stage" | "botId">>,
  ): Promise<BoardTask | undefined> {
    return this.transact((tasks) => {
      const index = tasks.findIndex((t) => t.id === id);
      if (index < 0) return undefined;
      const existing = tasks[index]!;
      const now = new Date().toISOString();
      const updated: BoardTask = {
        ...existing,
        ...patch,
        status: "failed",
        failureReason: reason,
        updatedAt: now,
      };
      tasks[index] = updated;
      return updated;
    });
  }

  async recordGiteeSync(
    id: string,
    state: { id: number; title: string },
  ): Promise<BoardTask | undefined> {
    return this.transact((tasks) => {
      const index = tasks.findIndex((t) => t.id === id);
      if (index < 0) return undefined;
      const existing = tasks[index]!;
      if (!existing.gitee) return undefined;
      const now = new Date().toISOString();
      const updated: BoardTask = {
        ...existing,
        updatedAt: now,
        gitee: {
          ...existing.gitee,
          lastSyncedStateId: state.id,
          lastSyncedStateTitle: state.title,
          lastSyncedAt: now,
        },
      };
      tasks[index] = updated;
      return updated;
    });
  }

  async findByTopicId(topicId: string): Promise<BoardTask | undefined> {
    const tasks = await this.loadTasks();
    return tasks.find((t) => t.topicId === topicId);
  }

  async findByGiteeIssueId(issueId: number): Promise<BoardTask | undefined> {
    const tasks = await this.loadTasks();
    return tasks.find((t) => t.gitee?.issueId === issueId);
  }
}
