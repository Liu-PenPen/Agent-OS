import { randomUUID } from "node:crypto";
import type { ChatMessage, EngineKind } from "@ml-aos/shared";
import type { JsonStore } from "../store/json-store.js";
import type { WorkspaceService } from "./workspace-service.js";
import type { BotService } from "./bot-service.js";
import type { SettingsService } from "./settings-service.js";
import { resolveAdapter } from "../cli/resolve-adapter.js";
import { CliEngineUnavailableError } from "../cli/errors.js";
import type { CliAdapter } from "../cli/types.js";
import { buildBotPrompt } from "./bot-prompt.js";
import {
  refreshSkillBindings,
  skillNotReadyMessage,
} from "./skill-install.js";
import { normalizeToolName } from "@ml-aos/shared";

/** Ignore a later full-message replay so the bubble is not pasted twice. */
export function mergeStreamText(current: string, delta: string): string {
  if (!delta) return current;
  if (!current) return delta;
  if (delta === current || current.endsWith(delta)) return current;
  if (delta.startsWith(current)) return delta;
  return current + delta;
}

export function engineLabel(engine: EngineKind): string {
  if (engine === "codex") return "Codex";
  return "Claude Code";
}

export function toolStepLabel(name: string): string {
  const labels: Record<string, string> = {
    Read: "正在读取文件",
    Write: "正在写入文件",
    Edit: "正在修改文件",
    Bash: "正在执行命令",
    Grep: "正在搜索",
    Glob: "正在查找文件",
    dispatch_task: "正在派发任务",
    request_clarification: "正在整理确认问题",
    request_spec_approval: "正在提交产品方案",
    request_approval: "正在请求审批",
    schedule_manage: "正在管理定时任务",
    submit_acceptance: "正在提交验收结果",
    run_acceptance_suite: "正在跑验收套件",
  };
  return labels[name] ?? `正在调用 ${name}`;
}

export function toolDetail(input: unknown): string | undefined {
  if (!input || typeof input !== "object") return undefined;
  const record = input as Record<string, unknown>;
  const raw =
    record.command ??
    record.file_path ??
    record.path ??
    record.pattern ??
    record.query ??
    record.prompt;
  if (typeof raw !== "string") return undefined;
  const text = raw.replace(/\s+/g, " ").trim();
  if (!text) return undefined;
  return text.length > 80 ? `${text.slice(0, 80)}…` : text;
}

/** True when Claude streamed an empty tool_use start (or no usable args yet). */
export function isEmptyToolInput(input: unknown): boolean {
  if (input == null) return true;
  if (typeof input !== "object") return false;
  return Object.keys(input as Record<string, unknown>).length === 0;
}

function isAbortError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return error.name === "AbortError" || /abort/i.test(error.message);
}

export type BotRunEvent = {
  type: "message.upsert";
  message: ChatMessage;
};

export interface BotRunRequest {
  topicId: string;
  botId: string;
  prompt: string;
  signal?: AbortSignal;
  /** chat = user @mention; handoff = runtime auto-dispatch; correction = force tool retry (new session). */
  origin?: "chat" | "handoff" | "resume" | "correction";
  /** Set on the CEO report run: who CEO should send the work to after analyzing. */
  handoffNext?: "developer" | "tester" | "reviewer";
  /** When true, clear this bot's CLI session before spawn (agent-os clearCliSessionId). */
  clearSession?: boolean;
}

export type BotRunSettled = {
  req: BotRunRequest;
  result: BotRunResult;
  bot: { id: string; name: string; role: string };
};

export interface BotRunResult {
  ok: boolean;
  messageId: string;
  error?: string;
  clarificationPending?: boolean;
  toolCalls?: { name: string; input?: unknown }[];
}

export class BotRunService {
  private readonly adapterOverride?: CliAdapter;
  private readonly runControllers = new Map<string, AbortController>();
  private readonly discarded = new Set<string>();
  private onSettled?: (info: BotRunSettled) => void | Promise<void>;

  isDiscarded(topicId: string): boolean {
    return this.discarded.has(topicId);
  }

  /** Stop an in-flight run and ignore any later writes for this topic. */
  discard(topicId: string): boolean {
    this.discarded.add(topicId);
    const controller = this.runControllers.get(topicId);
    if (!controller) return false;
    controller.abort();
    this.runControllers.delete(topicId);
    return true;
  }

  setOnSettled(handler: (info: BotRunSettled) => void | Promise<void>): void {
    this.onSettled = handler;
  }

  /** Drop one bot's (or all bots') CLI session for a topic — agent-os clearCliSessionId. */
  async clearCliSession(topicId: string, botId?: string): Promise<void> {
    await this.store.transact((state) => {
      const topic = state.topics.find((t) => t.id === topicId);
      if (!topic) return;
      if (!botId) {
        topic.cliSessions = {};
        topic.cliSessionId = undefined;
        return;
      }
      if (topic.cliSessions?.[botId]) {
        const next = { ...topic.cliSessions };
        delete next[botId];
        topic.cliSessions = next;
      }
      // Legacy single session was shared; drop it when any bot clears.
      topic.cliSessionId = undefined;
    });
  }

  constructor(
    private readonly store: JsonStore,
    private readonly workspaceService: WorkspaceService,
    private readonly botService: BotService,
    private readonly settingsService?: SettingsService,
    private readonly emit?: (event: BotRunEvent) => void,
    adapter?: CliAdapter,
  ) {
    this.adapterOverride = adapter;
  }

  private async pickAdapter(botEngine: EngineKind): Promise<CliAdapter> {
    if (this.adapterOverride) return this.adapterOverride;
    const settings = await this.settingsService?.get();
    const engine = botEngine || settings?.defaultEngine || "claude";
    return resolveAdapter(engine);
  }

  async abort(topicId: string): Promise<{ ok: true; aborted: boolean }> {
    const state = await this.store.load();
    const topic = state.topics.find((t) => t.id === topicId);
    if (!topic) {
      throw new Error(`Topic not found: ${topicId}`);
    }
    const controller = this.runControllers.get(topicId);
    controller?.abort();
    this.runControllers.delete(topicId);
    const cancelled = await this.cancelStreaming(topicId);
    return { ok: true, aborted: Boolean(controller) || cancelled };
  }

  /** Mark in-flight cards stopped even if the CLI process is already gone. */
  private async cancelStreaming(topicId: string): Promise<boolean> {
    const updated: ChatMessage[] = [];
    await this.store.transact((state) => {
      state.messages = state.messages.map((message) => {
        if (
          message.topicId !== topicId ||
          (!message.streaming && message.run?.status !== "running")
        ) {
          return message;
        }
        const next: ChatMessage = {
          ...message,
          streaming: false,
          content: message.content.trim() ? message.content : "任务已停止。",
          run: message.run
            ? {
                ...message.run,
                status: "cancelled",
                current: "已停止",
                finishedAt: new Date().toISOString(),
              }
            : message.run,
        };
        updated.push(next);
        return next;
      });
    });
    for (const message of updated) {
      this.emit?.({ type: "message.upsert", message });
    }
    return updated.length > 0;
  }

  /**
   * Create an empty streaming bot message and continue the run in the background.
   * HTTP chat endpoints use this so the client can stream via WebSocket.
   */
  async start(req: BotRunRequest): Promise<ChatMessage> {
    const prepared = await this.prepare(req);
    void this.drive(prepared)
      .then(async (result) => {
        if (this.discarded.has(prepared.req.topicId)) return;
        await this.onSettled?.({
          req: prepared.req,
          result,
          bot: {
            id: prepared.bot.id,
            name: prepared.bot.name,
            role: prepared.bot.role,
          },
        });
      })
      .catch(async (error) => {
        if (this.discarded.has(prepared.req.topicId)) return;
        const aborted = isAbortError(error);
        const message =
          error instanceof Error ? error.message : "智能体运行失败";
        if (!aborted) {
          await this.updateMessageContent(
            prepared.botMessage.id,
            `[error] ${message}`,
            false,
          );
        }
        await this.settleRun(
          prepared.botMessage.id,
          aborted ? "cancelled" : "failed",
        );
      });
    return prepared.botMessage;
  }

  /** Run to completion (pipeline stages). */
  async run(req: BotRunRequest): Promise<BotRunResult> {
    const prepared = await this.prepare(req);
    return this.drive(prepared);
  }

  private async prepare(req: BotRunRequest): Promise<{
    req: BotRunRequest;
    botMessage: ChatMessage;
    bot: NonNullable<Awaited<ReturnType<BotService["get"]>>>;
    cwd: string;
    sessionId?: string;
    controller: AbortController;
  }> {
    const state = await this.store.load();
    const topic = state.topics.find((t) => t.id === req.topicId);
    if (!topic) {
      throw new Error(`Topic not found: ${req.topicId}`);
    }

    const bot = await this.botService.get(req.botId);
    if (!bot) {
      throw new Error(`Bot not found: ${req.botId}`);
    }
    if (!bot.enabled) {
      throw new Error(`Bot is disabled: ${req.botId}`);
    }

    const workspace = await this.workspaceService.get(topic.workspaceId);
    if (!workspace) {
      throw new Error(`Workspace not found: ${topic.workspaceId}`);
    }

    if (req.clearSession || req.origin === "correction") {
      await this.clearCliSession(req.topicId, bot.id);
    }

    const freshState = await this.store.load();
    const freshTopic = freshState.topics.find((t) => t.id === req.topicId);
    const sessionId =
      req.clearSession || req.origin === "correction"
        ? undefined
        : freshTopic?.cliSessions?.[bot.id];

    const botMessage = await this.appendMessage({
      topicId: req.topicId,
      author: "bot",
      botId: bot.id,
      content: "",
      streaming: true,
      engine: engineLabel(bot.defaultEngine),
    });

    const previous = this.runControllers.get(req.topicId);
    previous?.abort();
    const controller = new AbortController();
    this.runControllers.set(req.topicId, controller);

    if (req.signal) {
      if (req.signal.aborted) {
        controller.abort();
      } else {
        req.signal.addEventListener("abort", () => controller.abort(), {
          once: true,
        });
      }
    }

    return {
      req,
      botMessage,
      bot,
      cwd: workspace.localPath,
      sessionId,
      controller,
    };
  }

  private async drive(prepared: {
    req: BotRunRequest;
    botMessage: ChatMessage;
    bot: NonNullable<Awaited<ReturnType<BotService["get"]>>>;
    cwd: string;
    sessionId?: string;
    controller: AbortController;
  }): Promise<BotRunResult> {
    const { req, botMessage, bot, cwd, sessionId, controller } = prepared;
    let content = "";
    let clarificationPending = false;
    let runError: string | undefined;
    let sawTool = false;
    let notedAnalysis = false;
    let notedReply = false;
    let settled = false;
    const toolCalls: { name: string; input?: unknown }[] = [];
    const adapter = await this.pickAdapter(bot.defaultEngine);
    const skills = refreshSkillBindings(bot.skills);
    const blocked = skillNotReadyMessage(skills);
    if (blocked) {
      throw new Error(blocked);
    }
    const prompt = buildBotPrompt({ ...bot, skills }, req.prompt);
    try {
      for await (const event of adapter.run({
        prompt,
        cwd,
        sessionId,
        signal: controller.signal,
        env: {
          ML_AOS_API_BASE: process.env.ML_AOS_API_BASE ?? "http://127.0.0.1:17890",
          ML_AOS_TOPIC_ID: req.topicId,
        },
      })) {
        if (this.discarded.has(req.topicId) || controller.signal.aborted) break;
        if (event.type === "text_delta") {
          content = mergeStreamText(content, event.text);
          await this.pushStreamingContent(botMessage.id, content);
          if (!sawTool && !notedReply) {
            notedReply = true;
            await this.patchRun(botMessage.id, { current: "正在组织回复" });
          }
          if (sawTool && !notedAnalysis) {
            notedAnalysis = true;
            await this.patchRun(botMessage.id, {
              current: "正在分析执行结果",
            });
          }
        } else if (event.type === "tool") {
          const name = normalizeToolName(event.name);
          const last = toolCalls[toolCalls.length - 1];
          // Claude streams content_block_start with {} then a full tool_use.
          // Do not use toolDetail() here — MCP tools have no path/command fields.
          if (last?.name === name && isEmptyToolInput(event.input)) {
            // Empty duplicate start event — ignore.
          } else if (last?.name === name && isEmptyToolInput(last.input)) {
            last.input = event.input;
            await this.replaceLastToolDetail(botMessage.id, event.input);
          } else {
            sawTool = true;
            notedAnalysis = false;
            toolCalls.push({ name, input: event.input });
            await this.recordTool(botMessage.id, event.name, event.input);
          }
        } else if (event.type === "usage") {
          await this.patchRun(botMessage.id, {
            contextUsed: event.usedTokens,
            ...(event.contextWindowTokens
              ? { contextWindow: event.contextWindowTokens }
              : {}),
          });
        } else if (event.type === "clarification") {
          await this.appendClarificationMessage({
            topicId: req.topicId,
            botId: bot.id,
            clarification: {
              id: event.id,
              prompt: event.prompt,
              options: event.options,
              status: "pending",
            },
          });
          clarificationPending = true;
        } else if (event.type === "done" && event.sessionId) {
          await this.updateTopicSession(req.topicId, bot.id, event.sessionId);
        } else if (event.type === "error") {
          const aborted = /abort/i.test(event.message);
          runError = event.message;
          await this.updateMessageContent(
            botMessage.id,
            aborted ? "任务已停止。" : `[error] ${event.message}`,
            false,
          );
          await this.settleRun(botMessage.id, aborted ? "cancelled" : "failed");
          settled = true;
        }
      }
    } catch (error) {
      const aborted =
        this.discarded.has(req.topicId) ||
        controller.signal.aborted ||
        isAbortError(error);
      if (!settled) {
        await this.settleRun(botMessage.id, aborted ? "cancelled" : "failed");
        settled = true;
      }
      if (error instanceof CliEngineUnavailableError && !aborted) {
        await this.updateMessageContent(
          botMessage.id,
          `[error] ${error.message}`,
          false,
        );
      }
      throw error;
    } finally {
      if (this.runControllers.get(req.topicId) === controller) {
        this.runControllers.delete(req.topicId);
      }
      const stopped =
        controller.signal.aborted || this.discarded.has(req.topicId);
      if (!settled && stopped) {
        if (!content.trim()) {
          await this.updateMessageContent(botMessage.id, "任务已停止。", false);
        }
        await this.settleRun(botMessage.id, "cancelled");
        settled = true;
      }
      if (!settled && !runError) {
        await this.settleRun(botMessage.id, "success");
      }
    }

    const stopped =
      controller.signal.aborted || this.discarded.has(req.topicId);
    return {
      ok: !runError && !stopped,
      messageId: botMessage.id,
      ...(runError ? { error: runError } : {}),
      ...(stopped && !runError ? { error: "aborted" } : {}),
      ...(clarificationPending ? { clarificationPending: true } : {}),
      ...(toolCalls.length > 0 ? { toolCalls } : {}),
    };
  }

  private async appendClarificationMessage(input: {
    topicId: string;
    botId: string;
    clarification: NonNullable<ChatMessage["clarification"]>;
  }): Promise<ChatMessage> {
    const message: ChatMessage = {
      id: randomUUID(),
      topicId: input.topicId,
      author: "bot",
      botId: input.botId,
      content: input.clarification.prompt,
      createdAt: new Date().toISOString(),
      kind: "clarification",
      clarification: input.clarification,
    };
    if (this.discarded.has(input.topicId)) return message;
    let saved = false;
    await this.store.transact((state) => {
      if (!state.topics.some((t) => t.id === input.topicId)) return;
      state.messages.push(message);
      saved = true;
    });
    if (saved) this.emit?.({ type: "message.upsert", message });
    return message;
  }

  private async appendMessage(
    input: Pick<ChatMessage, "topicId" | "author" | "content"> & {
      botId?: string;
      streaming?: boolean;
      engine?: string;
    },
  ): Promise<ChatMessage> {
    const message: ChatMessage = {
      id: randomUUID(),
      topicId: input.topicId,
      author: input.author,
      content: input.content,
      createdAt: new Date().toISOString(),
      ...(input.botId ? { botId: input.botId } : {}),
      ...(input.streaming ? { streaming: true } : {}),
      ...(input.author === "bot"
        ? {
            run: {
              status: "running" as const,
              engine: input.engine,
              current: "正在理解任务",
              toolCount: 0,
              tools: [],
            },
          }
        : {}),
    };
    if (this.discarded.has(input.topicId)) return message;
    let saved = false;
    await this.store.transact((state) => {
      if (!state.topics.some((t) => t.id === input.topicId)) return;
      state.messages.push(message);
      saved = true;
    });
    if (saved) this.emit?.({ type: "message.upsert", message });
    return message;
  }

  private streamingWrites = new Map<string, Promise<void>>();

  private async pushStreamingContent(
    messageId: string,
    content: string,
  ): Promise<void> {
    const previous = this.streamingWrites.get(messageId) ?? Promise.resolve();
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    this.streamingWrites.set(messageId, gate);
    await previous;
    try {
      await this.updateMessageContent(messageId, content, true);
    } finally {
      release();
      if (this.streamingWrites.get(messageId) === gate) {
        this.streamingWrites.delete(messageId);
      }
    }
  }

  private async replaceLastToolDetail(
    messageId: string,
    input: unknown,
  ): Promise<void> {
    const detail = toolDetail(input);
    if (!detail) return;
    let updated: ChatMessage | undefined;
    await this.store.transact((state) => {
      const index = state.messages.findIndex((m) => m.id === messageId);
      const current = state.messages[index];
      if (!current?.run?.tools?.length) return;
      if (current.run.status === "cancelled") return;
      const tools = [...current.run.tools];
      const last = tools[tools.length - 1];
      if (!last) return;
      tools[tools.length - 1] = { ...last, detail };
      const next: ChatMessage = {
        ...current,
        run: { ...current.run, tools },
      };
      state.messages[index] = next;
      updated = next;
    });
    if (updated) this.emit?.({ type: "message.upsert", message: updated });
  }

  private async recordTool(
    messageId: string,
    name: string,
    input: unknown,
  ): Promise<void> {
    const detail = toolDetail(input);
    await this.patchRun(messageId, {
      status: "running",
      current: toolStepLabel(name),
      pushTool: { name, ...(detail ? { detail } : {}) },
    });
  }

  private async patchRun(
    messageId: string,
    patch: {
      status?: NonNullable<ChatMessage["run"]>["status"];
      current?: string;
      pushTool?: { name: string; detail?: string };
      contextUsed?: number;
      contextWindow?: number;
    },
  ): Promise<void> {
    let updated: ChatMessage | undefined;
    await this.store.transact((state) => {
      const index = state.messages.findIndex((m) => m.id === messageId);
      if (index === -1) return;
      const current = state.messages[index];
      if (!current) return;
      if (this.discarded.has(current.topicId)) return;
      if (current.run?.status === "cancelled") return;
      const run = current.run ?? {
        status: "running" as const,
        toolCount: 0,
        tools: [],
      };
      const tools = patch.pushTool
        ? [...(run.tools ?? []), patch.pushTool].slice(-8)
        : run.tools;
      const next: ChatMessage = {
        ...current,
        run: {
          ...run,
          ...(patch.status ? { status: patch.status } : {}),
          ...(patch.current ? { current: patch.current } : {}),
          ...(patch.pushTool
            ? { toolCount: (run.toolCount ?? 0) + 1, tools }
            : {}),
          ...(patch.contextUsed !== undefined
            ? {
                contextUsed: patch.contextUsed,
                contextStart: run.contextStart ?? patch.contextUsed,
              }
            : {}),
          ...(patch.contextWindow !== undefined
            ? { contextWindow: patch.contextWindow }
            : {}),
        },
      };
      state.messages[index] = next;
      updated = next;
    });
    if (updated) this.emit?.({ type: "message.upsert", message: updated });
  }

  private async settleRun(
    messageId: string,
    status: "success" | "failed" | "cancelled",
  ): Promise<void> {
    let updated: ChatMessage | undefined;
    await this.store.transact((state) => {
      const index = state.messages.findIndex((m) => m.id === messageId);
      if (index === -1) return;
      const current = state.messages[index];
      if (!current) return;
      if (this.discarded.has(current.topicId)) return;
      const run = current.run ?? {
        status,
        toolCount: 0,
        tools: [],
      };
      const next: ChatMessage = {
        ...current,
        streaming: false,
        run: {
          ...run,
          status,
          finishedAt: new Date().toISOString(),
        },
      };
      state.messages[index] = next;
      updated = next;
    });
    if (updated) this.emit?.({ type: "message.upsert", message: updated });
  }

  private async updateMessageContent(
    messageId: string,
    content: string,
    streaming: boolean,
  ): Promise<ChatMessage | undefined> {
    let updated: ChatMessage | undefined;
    await this.store.transact((state) => {
      const index = state.messages.findIndex((m) => m.id === messageId);
      const current = state.messages[index];
      if (!current) return;
      if (this.discarded.has(current.topicId)) return;
      if (streaming && current.run?.status === "cancelled") return;
      updated = {
        ...state.messages[index],
        content,
        streaming,
      };
      state.messages[index] = updated;
    });
    if (!updated) return updated;
    this.emit?.({ type: "message.upsert", message: updated });
    return updated;
  }

  private async updateTopicSession(
    topicId: string,
    botId: string,
    sessionId: string,
  ): Promise<void> {
    await this.store.transact((state) => {
      const topic = state.topics.find((t) => t.id === topicId);
      if (!topic) return;
      topic.cliSessions = { ...topic.cliSessions, [botId]: sessionId };
      // Stop sharing the legacy topic-wide session across roles.
      topic.cliSessionId = undefined;
    });
  }

  private async clearStreaming(messageId: string): Promise<void> {
    let updated: ChatMessage | undefined;
    await this.store.transact((state) => {
      const index = state.messages.findIndex((m) => m.id === messageId);
      if (index === -1) return;
      if (!state.messages[index].streaming) return;
      updated = { ...state.messages[index], streaming: false };
      state.messages[index] = updated;
    });
    if (updated) {
      this.emit?.({ type: "message.upsert", message: updated });
    }
  }
}
