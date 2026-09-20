import { randomUUID } from "node:crypto";
import type { ChatMessage, EngineKind } from "@ml-aos/shared";
import type { JsonStore } from "../store/json-store.js";
import type { WorkspaceService } from "./workspace-service.js";
import type { BotService } from "./bot-service.js";
import type { SettingsService } from "./settings-service.js";
import { resolveAdapter } from "../cli/resolve-adapter.js";
import { CliEngineUnavailableError } from "../cli/errors.js";
import type { CliAdapter } from "../cli/types.js";

export type BotRunEvent = {
  type: "message.upsert";
  message: ChatMessage;
};

export interface BotRunRequest {
  topicId: string;
  botId: string;
  prompt: string;
  signal?: AbortSignal;
}

export interface BotRunResult {
  ok: boolean;
  messageId: string;
  error?: string;
  clarificationPending?: boolean;
}

export class BotRunService {
  private readonly adapterOverride?: CliAdapter;
  private readonly runControllers = new Map<string, AbortController>();

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
    const engine = botEngine || settings?.defaultEngine || "mock";
    return resolveAdapter(engine);
  }

  async abort(topicId: string): Promise<{ ok: true; aborted: boolean }> {
    const state = await this.store.load();
    const topic = state.topics.find((t) => t.id === topicId);
    if (!topic) {
      throw new Error(`Topic not found: ${topicId}`);
    }
    const controller = this.runControllers.get(topicId);
    if (!controller) {
      return { ok: true, aborted: false };
    }
    controller.abort();
    this.runControllers.delete(topicId);
    return { ok: true, aborted: true };
  }

  async run(req: BotRunRequest): Promise<BotRunResult> {
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

    const botMessage = await this.appendMessage({
      topicId: req.topicId,
      author: "bot",
      botId: bot.id,
      content: "",
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

    let content = "";
    let clarificationPending = false;
    let runError: string | undefined;
    const adapter = await this.pickAdapter(bot.defaultEngine);
    try {
      for await (const event of adapter.run({
        prompt: req.prompt,
        cwd: workspace.localPath,
        sessionId: topic.cliSessionId,
        signal: controller.signal,
      })) {
        if (event.type === "text_delta") {
          content += event.text;
          await this.updateMessageContent(botMessage.id, content);
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
          await this.updateTopicSession(req.topicId, event.sessionId);
        } else if (event.type === "error") {
          runError = event.message;
          await this.updateMessageContent(
            botMessage.id,
            `[error] ${event.message}`,
          );
        }
      }
    } catch (error) {
      if (error instanceof CliEngineUnavailableError) {
        await this.updateMessageContent(
          botMessage.id,
          `[error] ${error.message}`,
        );
        throw error;
      }
      throw error;
    } finally {
      if (this.runControllers.get(req.topicId) === controller) {
        this.runControllers.delete(req.topicId);
      }
    }

    return {
      ok: !runError,
      messageId: botMessage.id,
      ...(runError ? { error: runError } : {}),
      ...(clarificationPending ? { clarificationPending: true } : {}),
    };
  }

  private async appendClarificationMessage(input: {
    topicId: string;
    botId: string;
    clarification: NonNullable<ChatMessage["clarification"]>;
  }): Promise<ChatMessage> {
    const state = await this.store.load();
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
    state.messages.push(message);
    await this.store.save(state);
    this.emit?.({ type: "message.upsert", message });
    return message;
  }

  private async appendMessage(
    input: Pick<ChatMessage, "topicId" | "author" | "content"> & {
      botId?: string;
    },
  ): Promise<ChatMessage> {
    const state = await this.store.load();
    const message: ChatMessage = {
      id: randomUUID(),
      topicId: input.topicId,
      author: input.author,
      content: input.content,
      createdAt: new Date().toISOString(),
      ...(input.botId ? { botId: input.botId } : {}),
    };
    state.messages.push(message);
    await this.store.save(state);
    this.emit?.({ type: "message.upsert", message });
    return message;
  }

  private async updateMessageContent(
    messageId: string,
    content: string,
  ): Promise<ChatMessage> {
    const state = await this.store.load();
    const index = state.messages.findIndex((m) => m.id === messageId);
    if (index === -1) {
      throw new Error(`Message not found: ${messageId}`);
    }
    const updated: ChatMessage = { ...state.messages[index], content };
    state.messages[index] = updated;
    await this.store.save(state);
    this.emit?.({ type: "message.upsert", message: updated });
    return updated;
  }

  private async updateTopicSession(
    topicId: string,
    sessionId: string,
  ): Promise<void> {
    const state = await this.store.load();
    const topic = state.topics.find((t) => t.id === topicId);
    if (!topic) return;
    topic.cliSessionId = sessionId;
    await this.store.save(state);
  }
}
