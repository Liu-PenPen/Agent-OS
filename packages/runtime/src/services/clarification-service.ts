import { randomUUID } from "node:crypto";
import type { ChatMessage } from "@ml-aos/shared";
import type { JsonStore } from "../store/json-store.js";
import type { ChatEvent } from "./chat-service.js";
import type { PipelineRunner } from "./pipeline-runner.js";

export interface AnswerInput {
  optionId: string;
}

export interface ListClarificationsInput {
  status?: "pending" | "answered";
}

export class ClarificationService {
  constructor(
    private readonly store: JsonStore,
    private readonly emit?: (event: ChatEvent) => void,
    private readonly pipelineRunner?: Pick<PipelineRunner, "resume">,
  ) {}

  async list(input: ListClarificationsInput = {}): Promise<ChatMessage[]> {
    const state = await this.store.load();
    return state.messages.filter((message) => {
      if (message.kind !== "clarification" || !message.clarification) {
        return false;
      }
      if (!input.status) return true;
      return message.clarification.status === input.status;
    });
  }

  async answer(
    clarificationId: string,
    input: AnswerInput,
  ): Promise<ChatMessage> {
    const state = await this.store.load();
    const index = state.messages.findIndex(
      (m) => m.clarification?.id === clarificationId,
    );
    if (index === -1) {
      throw new Error(`Clarification not found: ${clarificationId}`);
    }

    const message = state.messages[index];
    const clarification = message.clarification!;
    const option = clarification.options.find((o) => o.id === input.optionId);
    if (!option) {
      throw new Error(`Option not found: ${input.optionId}`);
    }
    if (clarification.status === "answered") {
      throw new Error(`Clarification already answered: ${clarificationId}`);
    }

    const updated: ChatMessage = {
      ...message,
      clarification: {
        ...clarification,
        status: "answered",
        selectedOptionId: input.optionId,
      },
    };
    state.messages[index] = updated;

    const systemMessage: ChatMessage = {
      id: randomUUID(),
      topicId: message.topicId,
      author: "system",
      content: `Clarification answered: ${option.label}`,
      createdAt: new Date().toISOString(),
    };
    state.messages.push(systemMessage);

    const topic = state.topics.find((t) => t.id === message.topicId);
    const shouldResume =
      Boolean(topic?.pipelineTaskId) &&
      topic?.pipelineStage !== "completed" &&
      topic?.pipelineStage !== "blocked" &&
      topic?.pipelineStage !== undefined;

    await this.store.save(state);
    this.emit?.({ type: "message.upsert", message: updated });
    this.emit?.({ type: "message.upsert", message: systemMessage });

    if (shouldResume && topic) {
      void this.pipelineRunner?.resume(topic.id, option.label);
    }

    return updated;
  }
}
