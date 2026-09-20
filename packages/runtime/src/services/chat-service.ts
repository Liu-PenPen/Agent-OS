import { randomUUID } from "node:crypto";
import type { ChatMessage, Topic } from "@ml-aos/shared";
import type { JsonStore } from "../store/json-store.js";
import type { WorkspaceService } from "./workspace-service.js";
import type { BotService } from "./bot-service.js";
import { MockCliAdapter } from "../cli/mock-adapter.js";
import type { CliAdapter } from "../cli/types.js";

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
  private readonly adapter: CliAdapter;

  constructor(
    private readonly store: JsonStore,
    private readonly workspaceService: WorkspaceService,
    private readonly botService: BotService,
    adapter?: CliAdapter,
    private readonly emit?: (event: ChatEvent) => void,
  ) {
    this.adapter = adapter ?? new MockCliAdapter();
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

    const bot = await this.botService.get(input.mentionBotId);
    if (!bot) {
      throw new Error(`Bot not found: ${input.mentionBotId}`);
    }
    if (!bot.enabled) {
      throw new Error(`Bot is disabled: ${input.mentionBotId}`);
    }

    const workspace = await this.workspaceService.get(topic.workspaceId);
    if (!workspace) {
      throw new Error(`Workspace not found: ${topic.workspaceId}`);
    }

    const botMessage = await this.appendMessage({
      topicId,
      author: "bot",
      botId: bot.id,
      content: "",
    });

    let content = "";
    let clarificationMessageId: string | undefined;
    for await (const event of this.adapter.run({
      prompt: input.content,
      cwd: workspace.localPath,
      sessionId: topic.cliSessionId,
    })) {
      if (event.type === "text_delta") {
        content += event.text;
        await this.updateMessageContent(botMessage.id, content);
      } else if (event.type === "clarification") {
        const clarificationMsg = await this.appendClarificationMessage({
          topicId,
          botId: bot.id,
          clarification: {
            id: event.id,
            prompt: event.prompt,
            options: event.options,
            status: "pending",
          },
        });
        clarificationMessageId = clarificationMsg.id;
      } else if (event.type === "done" && event.sessionId) {
        await this.updateTopicSession(topicId, event.sessionId);
      } else if (event.type === "error") {
        await this.updateMessageContent(botMessage.id, `[error] ${event.message}`);
      }
    }

    if (clarificationMessageId) {
      const finalMessages = await this.listMessages(topicId);
      return finalMessages.filter(
        (m) =>
          m.id === userMessage.id ||
          m.id === botMessage.id ||
          m.id === clarificationMessageId,
      );
    }

    const finalMessages = await this.listMessages(topicId);
    return finalMessages.filter(
      (m) => m.id === userMessage.id || m.id === botMessage.id,
    );
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
