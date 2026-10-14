import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import {
  comparePriorityThenIdent,
  matchesPullPriority,
  type PullPriority,
} from "../gitee/priority.js";

const HOUR_MS = 60 * 60 * 1000;

const TaskSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  everyHours: z.number().int().min(1).max(24),
  priority: z.enum(["severe", "major", "none"]),
  status: z.enum(["draft", "active", "paused"]),
  nextRunAt: z.string().optional(),
  lastRunAt: z.string().optional(),
  lastResult: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type TicketPullTask = z.infer<typeof TaskSchema>;

export interface TicketPullPort {
  listProjects(): Promise<
    Array<{ id: string; localPath?: string; cast?: string[] }>
  >;
  listTodos(
    projectId: string,
  ): Promise<
    Array<{ id: number; ident: string; priority: string; topicId?: string }>
  >;
  dispatchToCeo(input: {
    projectId: string;
    issueId: number;
  }): Promise<unknown>;
}

export class TicketPullScheduleService {
  private tasks: TicketPullTask[] = [];
  private loaded = false;
  private timer: ReturnType<typeof setInterval> | undefined;
  private running = new Set<string>();

  constructor(
    private readonly dataDir: string,
    private readonly tickets: TicketPullPort,
  ) {}

  startLoop(): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      void this.tick();
    }, 30_000);
    this.timer.unref?.();
    void this.tick();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
  }

  async list(): Promise<TicketPullTask[]> {
    await this.ensure();
    return this.tasks.map((task) => ({ ...task }));
  }

  async add(input: {
    projectId: string;
    everyHours: number;
    priority: PullPriority;
  }): Promise<TicketPullTask> {
    await this.ensure();
    const everyHours = input.everyHours;
    if (!Number.isInteger(everyHours) || everyHours < 1 || everyHours > 24) {
      throw new Error("间隔须为 1 到 24 小时");
    }
    if (!["severe", "major", "none"].includes(input.priority)) {
      throw new Error("优先级不正确");
    }
    const projects = await this.tickets.listProjects();
    const project = projects.find((item) => item.id === input.projectId);
    if (!project) throw new Error("找不到这个工单项目");
    if (this.tasks.some((task) => task.projectId === project.id)) {
      throw new Error("该项目已有定时任务");
    }
    const now = new Date().toISOString();
    const task: TicketPullTask = {
      id: randomUUID().replaceAll("-", "").slice(0, 12),
      projectId: project.id,
      everyHours,
      priority: input.priority,
      status: "draft",
      createdAt: now,
      updatedAt: now,
    };
    this.tasks.push(task);
    await this.save();
    return { ...task };
  }

  async start(id: string, now = new Date()): Promise<TicketPullTask> {
    const task = await this.require(id);
    if (task.status === "active") return { ...task };
    task.status = "active";
    task.nextRunAt = new Date(
      now.getTime() + task.everyHours * HOUR_MS,
    ).toISOString();
    task.updatedAt = now.toISOString();
    await this.save();
    return { ...task };
  }

  async pause(id: string): Promise<TicketPullTask> {
    const task = await this.require(id);
    if (task.status === "draft") throw new Error("任务尚未开始");
    task.status = "paused";
    task.updatedAt = new Date().toISOString();
    await this.save();
    return { ...task };
  }

  async resume(id: string, now = new Date()): Promise<TicketPullTask> {
    const task = await this.require(id);
    if (task.status === "draft") throw new Error("任务尚未开始");
    task.status = "active";
    task.nextRunAt = new Date(
      now.getTime() + task.everyHours * HOUR_MS,
    ).toISOString();
    task.updatedAt = now.toISOString();
    await this.save();
    return { ...task };
  }

  async run(id: string): Promise<TicketPullTask> {
    const task = await this.require(id);
    await this.execute(task, "manual");
    return { ...task };
  }

  async remove(id: string): Promise<void> {
    await this.ensure();
    const before = this.tasks.length;
    this.tasks = this.tasks.filter((task) => task.id !== id);
    if (this.tasks.length === before) throw new Error("找不到这条定时任务");
    await this.save();
  }

  async tick(now = Date.now()): Promise<void> {
    await this.ensure();
    for (const task of this.tasks) {
      if (task.status !== "active" || !task.nextRunAt) continue;
      if (new Date(task.nextRunAt).getTime() > now) continue;
      await this.execute(task, "scheduled", new Date(now));
    }
  }

  private async execute(
    task: TicketPullTask,
    reason: "manual" | "scheduled",
    at = new Date(),
  ): Promise<void> {
    if (this.running.has(task.id)) throw new Error("这条定时任务正在执行");
    this.running.add(task.id);
    try {
      if (reason === "scheduled") {
        task.nextRunAt = new Date(
          at.getTime() + task.everyHours * HOUR_MS,
        ).toISOString();
        task.updatedAt = at.toISOString();
        await this.save();
      }
      task.lastResult = await this.pull(task);
      task.lastRunAt = at.toISOString();
      task.updatedAt = at.toISOString();
    } catch (error) {
      task.lastRunAt = at.toISOString();
      task.updatedAt = at.toISOString();
      task.lastResult =
        error instanceof Error ? error.message : "执行失败";
      if (reason === "manual") throw error;
    } finally {
      this.running.delete(task.id);
      await this.save();
    }
  }

  private async pull(task: TicketPullTask): Promise<string> {
    const projects = await this.tickets.listProjects();
    const project = projects.find((item) => item.id === task.projectId);
    if (!project) throw new Error("找不到这个工单项目");
    if (!project.localPath?.trim()) {
      throw new Error("请先在工单项目配置中填写本地工作目录");
    }
    const todos = await this.tickets.listTodos(task.projectId);
    const matched = todos
      .filter(
        (todo) =>
          !todo.topicId &&
          matchesPullPriority(todo.priority, task.priority),
      )
      .sort(comparePriorityThenIdent);
    let handed = 0;
    const failures: string[] = [];
    for (const todo of matched) {
      try {
        await this.tickets.dispatchToCeo({
          projectId: task.projectId,
          issueId: todo.id,
        });
        handed += 1;
      } catch (error) {
        const message = error instanceof Error ? error.message : "派发失败";
        if (message.includes("未找到已启用的 CEO")) {
          if (handed === 0) throw new Error(message);
          failures.push(`${todo.ident}：${message}`);
          break;
        }
        failures.push(`${todo.ident}：${message}`);
      }
    }
    const summary = `拉到 ${todos.length} 张，新交给 CEO ${handed} 张`;
    return failures.length === 0
      ? summary
      : `${summary}。未交：${failures.join("；")}`;
  }

  private async require(id: string): Promise<TicketPullTask> {
    await this.ensure();
    const task = this.tasks.find((item) => item.id === id);
    if (!task) throw new Error("找不到这条定时任务");
    return task;
  }

  private async ensure(): Promise<void> {
    if (this.loaded) return;
    this.loaded = true;
    await mkdir(this.dataDir, { recursive: true });
    this.tasks = await readTasks(join(this.dataDir, "ticket-pulls.json"));
  }

  private async save(): Promise<void> {
    await mkdir(this.dataDir, { recursive: true });
    await writeFile(
      join(this.dataDir, "ticket-pulls.json"),
      `${JSON.stringify(this.tasks, null, 2)}\n`,
    );
  }
}

async function readTasks(file: string): Promise<TicketPullTask[]> {
  try {
    const parsed = JSON.parse(await readFile(file, "utf8")) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((item) => {
      const result = TaskSchema.safeParse(item);
      return result.success ? [result.data] : [];
    });
  } catch {
    return [];
  }
}
