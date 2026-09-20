import { randomUUID } from "node:crypto";
import type { ChatMessage, Topic } from "@ml-aos/shared";
import type { JsonStore } from "../store/json-store.js";
import type { WorkspaceService } from "./workspace-service.js";
import type { BotService } from "./bot-service.js";
import type { SettingsService } from "./settings-service.js";
import type { CliAdapter } from "../cli/types.js";
import { BotRunService } from "./bot-run-service.js";

export interface CreateTopicInput {
  workspaceId: string;
  title: string;
}

export interface SendMessageInput {
  content: string;
  mentionBotId?: string;
}

export type ChatEvent =
  | { type: "message.upsert"; message: ChatMessage }
  | {
      type: "pipeline.update";
      topicId: string;
      pipelineStage: Topic["pipelineStage"];
    };

export class ChatService {
  private readonly botRun: BotRunService;

  constructor(
    private readonly store: JsonStore,
    private readonly workspaceService: WorkspaceService,
    private readonly botService: BotService,
    adapter?: CliAdapter,
    private readonly emit?: (event: ChatEvent) => void,
    settingsService?: SettingsService,
    botRun?: BotRunService,
  ) {
    this.botRun =
      botRun ??
      new BotRunService(
        store,
        workspaceService,
        botService,
        settingsService,
        emit
          ? (event) => {
              this.emit?.(event);
            }
          : undefined,
        adapter,
      );
  }

  async abort(topicId: string): Promise<{ ok: true; aborted: boolean }> {
    return this.botRun.abort(topicId);
  }

  async createTopic(input: CreateTopicInput): Promise<Topic> {
    const workspace = await this.workspaceService.get(input.workspaceId);
    if (!workspace) {
      throw new Error(`Workspace not found: ${input.workspaceId}`);
    }

    const state = await this.store.load();
    const topic: Topic = {
      id: randomUUID(),
      workspaceId: input.workspaceId,
      title: input.title,
      createdAt: new Date().toISOString(),
      pipelineStage: "idle",
    };
    state.topics.push(topic);
    await this.store.save(state);

    this.emit?.({
      type: "pipeline.update",
      topicId: topic.id,
      pipelineStage: topic.pipelineStage,
    });

    return topic;
  }

  async listTopics(workspaceId?: string): Promise<Topic[]> {
    const state = await this.store.load();
    if (!workspaceId) return state.topics;
    return state.topics.filter((t) => t.workspaceId === workspaceId);
  }

  async getTopic(id: string): Promise<Topic | undefined> {
    const state = await this.store.load();
    return state.topics.find((t) => t.id === id);
  }

  async listMessages(topicId: string): Promise<ChatMessage[]> {
    const topic = await this.getTopic(topicId);
    if (!topic) {
      throw new Error(`Topic not found: ${topicId}`);
    }
    const state = await this.store.load();
    return state.messages
      .filter((m) => m.topicId === topicId)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  async sendMessage(
    topicId: string,
    input: SendMessageInput,
  ): Promise<ChatMessage[]> {
    const topic = await this.getTopic(topicId);
    if (!topic) {
      throw new Error(`Topic not found: ${topicId}`);
    }

    const userMessage = await this.appendMessage({
      topicId,
      author: "user",
      content: input.content,
    });

    if (!input.mentionBotId) {
      return [userMessage];
    }

    const result = await this.botRun.run({
      topicId,
      botId: input.mentionBotId,
      prompt: input.content,
    });

    const finalMessages = await this.listMessages(topicId);
    const userIndex = finalMessages.findIndex((m) => m.id === userMessage.id);
    if (result.clarificationPending) {
      return finalMessages.filter(
        (m, index) =>
          m.id === userMessage.id ||
          m.id === result.messageId ||
          (index > userIndex && m.kind === "clarification"),
      );
    }

    return finalMessages.filter(
      (m) => m.id === userMessage.id || m.id === result.messageId,
    );
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
}
