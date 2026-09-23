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

function isLegacyClarification(message: ChatMessage): boolean {
  return message.kind === "clarification" && Boolean(message.clarification);
}

function isAppToolPending(message: ChatMessage): boolean {
  return (
    message.kind === "app-tool" &&
    Boolean(message.appTool) &&
    (message.appTool?.tool === "clarification" ||
      message.appTool?.tool === "spec" ||
      message.appTool?.tool === "approval" ||
      message.appTool?.tool === "visual")
  );
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
      if (isLegacyClarification(message)) {
        if (!input.status) return true;
        return message.clarification!.status === input.status;
      }
      if (isAppToolPending(message)) {
        const status = message.appTool!.status;
        if (!input.status) return true;
        if (input.status === "pending") return status === "pending";
        return status === "done";
      }
      return false;
    });
  }

  async answer(
    clarificationId: string,
    input: AnswerInput,
  ): Promise<ChatMessage> {
    let updated!: ChatMessage;
    let systemMessage!: ChatMessage;
    let shouldResume = false;
    let resumeTopicId = "";
    let resumeLabel = "";

    await this.store.transact((state) => {
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

      updated = {
        ...message,
        clarification: {
          ...clarification,
          status: "answered",
          selectedOptionId: input.optionId,
        },
      };
      state.messages[index] = updated;

      systemMessage = {
        id: randomUUID(),
        topicId: message.topicId,
        author: "system",
        content: `Clarification answered: ${option.label}`,
        createdAt: new Date().toISOString(),
      };
      state.messages.push(systemMessage);

      const topic = state.topics.find((t) => t.id === message.topicId);
      shouldResume =
        Boolean(topic?.pipelineTaskId) &&
        topic?.pipelineStage !== "completed" &&
        topic?.pipelineStage !== "blocked" &&
        topic?.pipelineStage !== undefined;
      if (shouldResume && topic) {
        resumeTopicId = topic.id;
        resumeLabel = option.label;
      }
    });

    this.emit?.({ type: "message.upsert", message: updated });
    this.emit?.({ type: "message.upsert", message: systemMessage });

    if (shouldResume) {
      void this.pipelineRunner?.resume(resumeTopicId, resumeLabel);
    }

    return updated;
  }
}
