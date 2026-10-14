import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";

const HOUR_MS = 60 * 60 * 1000;

const TaskSchema = z.object({
  id: z.string(),
  prompt: z.string(),
  botId: z.string(),
  workspaceId: z.string(),
  everyHours: z.number().int().min(1).max(24),
  status: z.enum(["draft", "active", "paused"]),
  topicId: z.string().optional(),
  nextRunAt: z.string().optional(),
  lastRunAt: z.string().optional(),
  lastResult: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type AgentScheduleTask = z.infer<typeof TaskSchema>;

export interface AgentSchedulePort {
  listBots(): Promise<
    Array<{ id: string; name: string; role: string; enabled: boolean }>
  >;
  getWorkspace(id: string): Promise<{ id: string; name: string } | undefined>;
  createTopic(input: {
    workspaceId: string;
    title: string;
  }): Promise<{ id: string }>;
  startBot(input: {
    topicId: string;
    botId: string;
    prompt: string;
  }): Promise<unknown>;
}

export class AgentScheduleService {
  private tasks: AgentScheduleTask[] = [];
  private loaded = false;
  private timer: ReturnType<typeof setInterval> | undefined;
  private running = new Set<string>();

  constructor(
    private readonly dataDir: string,
    private readonly port: AgentSchedulePort,
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

  async list(): Promise<AgentScheduleTask[]> {
    await this.ensure();
    return this.tasks.map((task) => ({ ...task }));
  }

  async add(input: {
    prompt: string;
    botId: string;
    workspaceId: string;
    everyHours: number;
  }): Promise<AgentScheduleTask> {
    await this.ensure();
    const prompt = input.prompt.trim();
    if (!prompt || prompt.length > 2000) throw new Error("请填写 1 到 2000 字的任务说明");
    if (!Number.isInteger(input.everyHours) || input.everyHours < 1 || input.everyHours > 24) {
      throw new Error("间隔须为 1 到 24 小时");
    }
    const workspace = await this.port.getWorkspace(input.workspaceId);
    if (!workspace) throw new Error("找不到这个工作区");
    const bot = await this.requireBot(input.botId);
    const now = new Date().toISOString();
    const task: AgentScheduleTask = {
      id: randomUUID().replaceAll("-", "").slice(0, 12),
      prompt,
      botId: bot.id,
      workspaceId: workspace.id,
      everyHours: input.everyHours,
      status: "draft",
      createdAt: now,
      updatedAt: now,
    };
    this.tasks.push(task);
    await this.save();
    return { ...task };
  }

  async start(id: string, now = new Date()): Promise<AgentScheduleTask> {
    const task = await this.require(id);
    await this.ensureTopic(task);
    if (task.status !== "active") {
      task.status = "active";
      task.nextRunAt = new Date(now.getTime() + task.everyHours * HOUR_MS).toISOString();
      task.updatedAt = now.toISOString();
      await this.save();
    }
    return { ...task };
  }

  async pause(id: string): Promise<AgentScheduleTask> {
    const task = await this.require(id);
    if (task.status === "draft") throw new Error("任务尚未开始");
    task.status = "paused";
    task.updatedAt = new Date().toISOString();
    await this.save();
    return { ...task };
  }

  async resume(id: string, now = new Date()): Promise<AgentScheduleTask> {
    const task = await this.require(id);
    if (task.status === "draft") throw new Error("任务尚未开始");
    task.status = "active";
    task.nextRunAt = new Date(now.getTime() + task.everyHours * HOUR_MS).toISOString();
    task.updatedAt = now.toISOString();
    await this.save();
    return { ...task };
  }

  async run(id: string): Promise<AgentScheduleTask> {
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
    task: AgentScheduleTask,
    reason: "manual" | "scheduled",
    at = new Date(),
  ): Promise<void> {
    if (this.running.has(task.id)) throw new Error("这条定时任务正在执行");
    this.running.add(task.id);
    try {
      if (reason === "scheduled") {
        task.nextRunAt = new Date(at.getTime() + task.everyHours * HOUR_MS).toISOString();
        task.updatedAt = at.toISOString();
        await this.save();
      }
      await this.ensureTopic(task);
      const bot = await this.requireBot(task.botId);
      await this.port.startBot({
        topicId: task.topicId!,
        botId: bot.id,
        prompt: `定时任务：\n${task.prompt}`,
      });
      task.lastResult = `已交给 ${bot.name}`;
      task.lastRunAt = at.toISOString();
      task.updatedAt = at.toISOString();
    } catch (error) {
      task.lastRunAt = at.toISOString();
      task.updatedAt = at.toISOString();
      task.lastResult = error instanceof Error ? error.message : "执行失败";
      if (reason === "manual") throw error;
    } finally {
      this.running.delete(task.id);
      await this.save();
    }
  }

  private async ensureTopic(task: AgentScheduleTask): Promise<void> {
    if (task.topicId) return;
    const title = task.prompt.replace(/\s+/g, " ").slice(0, 40);
    const topic = await this.port.createTopic({
      workspaceId: task.workspaceId,
      title: title || "定时任务",
    });
    task.topicId = topic.id;
    task.updatedAt = new Date().toISOString();
    await this.save();
  }

  private async requireBot(botId: string): Promise<{ id: string; name: string }> {
    const bots = await this.port.listBots();
    const bot = bots.find((item) => item.enabled && item.id === botId);
    if (!bot) throw new Error("请选择已启用的智能体");
    return bot;
  }

  private async require(id: string): Promise<AgentScheduleTask> {
    await this.ensure();
    const task = this.tasks.find((item) => item.id === id);
    if (!task) throw new Error("找不到这条定时任务");
    return task;
  }

  private async ensure(): Promise<void> {
    if (this.loaded) return;
    this.loaded = true;
    await mkdir(this.dataDir, { recursive: true });
    this.tasks = await readTasks(join(this.dataDir, "agent-schedules.json"));
  }

  private async save(): Promise<void> {
    await mkdir(this.dataDir, { recursive: true });
    await writeFile(
      join(this.dataDir, "agent-schedules.json"),
      `${JSON.stringify(this.tasks, null, 2)}\n`,
    );
  }
}

async function readTasks(file: string): Promise<AgentScheduleTask[]> {
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
