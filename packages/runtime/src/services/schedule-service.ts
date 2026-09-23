import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { ScheduleManageRequest, ScheduleRule } from "@ml-aos/shared";

export interface ScheduledTask {
  id: string;
  topicId: string;
  targetBotId: string;
  prompt: string;
  rule: ScheduleRule;
  status: "active" | "paused" | "completed";
  nextRunAt?: string;
  lastRunAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ScheduleRunRecord {
  id: string;
  taskId: string;
  at: string;
  status: "ok" | "skipped" | "failed";
  detail: string;
}

function fieldMatches(field: string, value: number, min: number, max: number): boolean {
  if (field === "*") return true;
  return field.split(",").some((part) => {
    const [base, stepRaw] = part.split("/");
    const step = stepRaw ? Number(stepRaw) : 1;
    if (!Number.isFinite(step) || step <= 0) return false;
    let start = min;
    let end = max;
    if (base && base !== "*") {
      if (base.includes("-")) {
        const [from, to] = base.split("-").map(Number);
        start = from ?? min;
        end = to ?? max;
      } else {
        const exact = Number(base);
        start = exact;
        end = exact;
      }
    }
    if (value < start || value > end) return false;
    return (value - start) % step === 0;
  });
}

function zoned(date: Date, timeZone: string) {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    weekday: "short",
  });
  const parts = Object.fromEntries(
    fmt.formatToParts(date).map((part) => [part.type, part.value]),
  );
  const weekday = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(
    (parts.weekday ?? "Sun").slice(0, 3),
  );
  return {
    minute: Number(parts.minute),
    hour: Number(parts.hour === "24" ? "0" : parts.hour),
    day: Number(parts.day),
    month: Number(parts.month),
    weekday: weekday < 0 ? 0 : weekday,
  };
}

export function cronMatches(expression: string, date: Date, timeZone: string): boolean {
  const fields = expression.trim().split(/\s+/);
  if (fields.length < 5) return false;
  const [minute, hour, day, month, dow] = fields;
  const parts = zoned(date, timeZone);
  const dowValue = parts.weekday;
  const dowOk =
    fieldMatches(dow ?? "*", dowValue, 0, 6) ||
    (dowValue === 0 && fieldMatches(dow ?? "*", 7, 0, 7));
  return (
    fieldMatches(minute ?? "*", parts.minute, 0, 59) &&
    fieldMatches(hour ?? "*", parts.hour, 0, 23) &&
    fieldMatches(day ?? "*", parts.day, 1, 31) &&
    fieldMatches(month ?? "*", parts.month, 1, 12) &&
    dowOk
  );
}

export function nextCronRun(
  expression: string,
  timeZone: string,
  now = new Date(),
): Date | undefined {
  const start = new Date(now.getTime() + 60_000);
  start.setSeconds(0, 0);
  for (let step = 0; step < 366 * 24 * 60; step += 1) {
    const candidate = new Date(start.getTime() + step * 60_000);
    if (cronMatches(expression, candidate, timeZone)) return candidate;
  }
  return undefined;
}

export function initialNextRun(rule: ScheduleRule, now = new Date()): string | undefined {
  if (rule.kind === "once") {
    const at = new Date(rule.runAt);
    return Number.isNaN(at.getTime()) ? undefined : at.toISOString();
  }
  if (rule.kind === "interval") {
    return new Date(now.getTime() + rule.everyMs).toISOString();
  }
  return nextCronRun(rule.expression, rule.timezone || "Asia/Shanghai", now)?.toISOString();
}

export class ScheduleService {
  private tasks: ScheduledTask[] = [];
  private runs: ScheduleRunRecord[] = [];
  private timer: ReturnType<typeof setInterval> | undefined;
  private loaded = false;

  constructor(
    private readonly dataDir: string,
    private readonly fire: (task: ScheduledTask) => Promise<void>,
  ) {}

  start(): void {
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

  async list(): Promise<ScheduledTask[]> {
    await this.ensure();
    return this.tasks.map((task) => ({ ...task }));
  }

  async logs(id?: string): Promise<ScheduleRunRecord[]> {
    await this.ensure();
    const rows = id ? this.runs.filter((run) => run.taskId === id) : this.runs;
    return rows.slice(-50).reverse();
  }

  async manage(request: ScheduleManageRequest, topicId: string): Promise<string> {
    await this.ensure();
    switch (request.action) {
      case "list":
        return this.tasks.length === 0
          ? "当前没有定时任务。"
          : this.tasks
              .map(
                (task) =>
                  `${task.id} ${task.status} ${task.targetBotId} 下次 ${task.nextRunAt ?? "无"}`,
              )
              .join("\n");
      case "add": {
        const task = await this.add(topicId, request);
        return `已创建定时任务 ${task.id}。`;
      }
      case "addMany": {
        const ids = [];
        for (const item of request.schedules) ids.push((await this.add(topicId, item)).id);
        return `已创建 ${ids.join("、")}。`;
      }
      case "update": {
        const task = this.tasks.find((item) => item.id === request.id);
        if (!task) return `找不到定时任务 ${request.id}。`;
        if (request.targetBotId) task.targetBotId = request.targetBotId;
        if (request.prompt) task.prompt = request.prompt;
        if (request.rule) {
          task.rule = request.rule;
          task.nextRunAt = initialNextRun(request.rule);
        }
        task.updatedAt = new Date().toISOString();
        await this.save();
        return `已更新定时任务 ${task.id}。`;
      }
      case "remove":
        this.tasks = this.tasks.filter((task) => task.id !== request.id);
        await this.save();
        return `已删除定时任务 ${request.id}。`;
      case "removeMany":
        this.tasks = this.tasks.filter((task) => !request.ids.includes(task.id));
        await this.save();
        return `已删除 ${request.ids.length} 个定时任务。`;
      case "removeAll":
        this.tasks = [];
        await this.save();
        return "已删除全部定时任务。";
      case "pause":
        return this.setStatus(request.id, "paused", "已暂停");
      case "resume": {
        const task = this.tasks.find((item) => item.id === request.id);
        if (!task) return `找不到定时任务 ${request.id}。`;
        task.status = "active";
        task.nextRunAt = initialNextRun(task.rule);
        task.updatedAt = new Date().toISOString();
        await this.save();
        return `已恢复定时任务 ${task.id}。`;
      }
      case "run": {
        const task = this.tasks.find((item) => item.id === request.id);
        if (!task) return `找不到定时任务 ${request.id}。`;
        await this.execute(task, "手动执行");
        return `已执行定时任务 ${task.id}。`;
      }
      case "logs": {
        const rows = await this.logs(request.id);
        return rows.length === 0
          ? "没有运行记录。"
          : rows
              .map((run) => `${run.at} ${run.status} ${run.detail}`)
              .join("\n");
      }
      default:
        return "不支持的定时任务操作。";
    }
  }

  private async add(
    topicId: string,
    input: { targetBotId: string; prompt: string; rule: ScheduleRule },
  ): Promise<ScheduledTask> {
    const now = new Date().toISOString();
    const task: ScheduledTask = {
      id: randomUUID().replaceAll("-", "").slice(0, 12),
      topicId,
      targetBotId: input.targetBotId,
      prompt: input.prompt,
      rule: input.rule,
      status: "active",
      nextRunAt: initialNextRun(input.rule),
      createdAt: now,
      updatedAt: now,
    };
    this.tasks.push(task);
    await this.save();
    return task;
  }

  private async setStatus(
    id: string,
    status: ScheduledTask["status"],
    label: string,
  ): Promise<string> {
    const task = this.tasks.find((item) => item.id === id);
    if (!task) return `找不到定时任务 ${id}。`;
    task.status = status;
    task.updatedAt = new Date().toISOString();
    await this.save();
    return `${label} ${task.id}。`;
  }

  private async tick(): Promise<void> {
    await this.ensure();
    const now = Date.now();
    for (const task of this.tasks) {
      if (task.status !== "active" || !task.nextRunAt) continue;
      if (new Date(task.nextRunAt).getTime() > now) continue;
      await this.execute(task, "到点执行");
    }
  }

  private async execute(task: ScheduledTask, reason: string): Promise<void> {
    const at = new Date().toISOString();
    try {
      if (task.rule.kind === "once" && task.lastRunAt) {
        task.status = "completed";
        this.runs.push({
          id: randomUUID(),
          taskId: task.id,
          at,
          status: "skipped",
          detail: "一次性任务已执行过",
        });
        await this.save();
        return;
      }
      await this.fire(task);
      task.lastRunAt = at;
      task.updatedAt = at;
      if (task.rule.kind === "once") {
        task.status = "completed";
        task.nextRunAt = undefined;
      } else if (task.rule.kind === "interval") {
        task.nextRunAt = new Date(Date.now() + task.rule.everyMs).toISOString();
      } else {
        task.nextRunAt = nextCronRun(
          task.rule.expression,
          task.rule.timezone || "Asia/Shanghai",
        )?.toISOString();
      }
      this.runs.push({
        id: randomUUID(),
        taskId: task.id,
        at,
        status: "ok",
        detail: reason,
      });
    } catch (error) {
      this.runs.push({
        id: randomUUID(),
        taskId: task.id,
        at,
        status: "failed",
        detail: error instanceof Error ? error.message : "执行失败",
      });
    }
    await this.save();
  }

  private async ensure(): Promise<void> {
    if (this.loaded) return;
    this.loaded = true;
    await mkdir(this.dataDir, { recursive: true });
    this.tasks = await readJson<ScheduledTask>(join(this.dataDir, "schedules.json"));
    this.runs = await readJson<ScheduleRunRecord>(
      join(this.dataDir, "schedule-runs.json"),
    );
  }

  private async save(): Promise<void> {
    await mkdir(this.dataDir, { recursive: true });
    await writeFile(
      join(this.dataDir, "schedules.json"),
      `${JSON.stringify(this.tasks, null, 2)}\n`,
    );
    await writeFile(
      join(this.dataDir, "schedule-runs.json"),
      `${JSON.stringify(this.runs.slice(-200), null, 2)}\n`,
    );
  }
}

async function readJson<T>(file: string): Promise<T[]> {
  try {
    const parsed = JSON.parse(await readFile(file, "utf8")) as T[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
