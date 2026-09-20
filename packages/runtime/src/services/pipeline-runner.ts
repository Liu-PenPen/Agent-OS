import { randomUUID } from "node:crypto";
import type { ChatMessage, PipelineStage } from "@ml-aos/shared";
import type { JsonStore } from "../store/json-store.js";
import type { ChatEvent } from "./chat-service.js";
import type { BotRunService } from "./bot-run-service.js";
import type { PipelineService } from "./pipeline-service.js";
import { STAGE_ROLES } from "./pipeline-bots.js";

const ACTIVE_STAGES = ["developing", "testing", "reviewing"] as const;
type ActiveStage = (typeof ACTIVE_STAGES)[number];

function isActiveStage(stage: PipelineStage): stage is ActiveStage {
  return (ACTIVE_STAGES as readonly string[]).includes(stage);
}

function stageFailDetail(error: string | undefined): string {
  if (
    error === "Aborted" ||
    error === "aborted by user" ||
    error?.toLowerCase() === "aborted"
  ) {
    return "aborted by user";
  }
  return error ?? "Stage bot run failed";
}

function buildStagePrompt(input: {
  stage: ActiveStage;
  title: string;
  localPath: string;
}): string {
  const role = STAGE_ROLES[input.stage];
  return [
    "[ML AOS pipeline]",
    `Stage: ${input.stage}`,
    `Task: ${input.title}`,
    `Workspace: ${input.localPath}`,
    `Instructions: You are the ${role} bot. Complete this stage for the task. Be concrete. When done, summarize what you did.`,
  ].join("\n");
}

export class PipelineRunner {
  private pausedPipelines = new Set<string>();

  constructor(
    private pipelines: PipelineService,
    private botRun: BotRunService,
    private store: JsonStore,
    private emit?: (e: ChatEvent) => void,
  ) {}

  /** Fire-and-forget after dispatch */
  start(pipelineId: string): void {
    void this.runUntilSettled(pipelineId).catch(() => {
      /* stage failure already persisted */
    });
  }

  /**
   * After a clarification answer: re-run the paused stage with a follow-up
   * prompt, then continue chaining stages.
   */
  async resume(topicId: string, answerLabel: string): Promise<void> {
    const state = await this.store.load();
    const topic = state.topics.find((t) => t.id === topicId);
    if (!topic?.pipelineTaskId) return;

    const pipelineId = topic.pipelineTaskId;
    if (!this.pausedPipelines.has(pipelineId)) return;

    const task = await this.pipelines.get(pipelineId);
    if (!task) return;
    if (task.stage === "completed" || task.stage === "blocked") return;
    if (!isActiveStage(task.stage)) return;

    const stageEntry = task.stages.find((s) => s.stage === task.stage);
    if (!stageEntry || stageEntry.status !== "running") return;

    const botId = stageEntry.botId;
    if (!botId) {
      await this.markFailed(
        pipelineId,
        `No bot assigned for stage ${task.stage}`,
      );
      return;
    }

    this.pausedPipelines.delete(pipelineId);

    const prompt = `User answered clarification: ${answerLabel}. Continue the stage.`;
    const result = await this.botRun.run({
      topicId,
      botId,
      prompt,
    });

    if (result.clarificationPending) {
      this.pausedPipelines.add(pipelineId);
      return;
    }

    if (!result.ok) {
      await this.markFailed(
        pipelineId,
        stageFailDetail(result.error),
      );
      return;
    }

    const excerpt = await this.messageExcerpt(result.messageId, 500);
    await this.setStageDetail(pipelineId, excerpt);
    await this.pipelines.advance(pipelineId);
    await this.runUntilSettled(pipelineId);
  }

  /**
   * Topic abort API: always clear the paused gate.
   * If a bot run was in flight (`botWasRunning`), stage failure is persisted when
   * that run settles (`ok:false` → markFailed). Otherwise mark blocked now
   * (e.g. abort while paused on clarification).
   */
  async handleAbort(topicId: string, botWasRunning = false): Promise<void> {
    const state = await this.store.load();
    const topic = state.topics.find((t) => t.id === topicId);
    if (!topic?.pipelineTaskId) return;

    const pipelineId = topic.pipelineTaskId;
    this.pausedPipelines.delete(pipelineId);

    if (botWasRunning) return;

    const task = await this.pipelines.get(pipelineId);
    if (!task) return;
    if (task.stage === "completed" || task.stage === "blocked") return;

    await this.markFailed(pipelineId, "aborted by user");
  }

  /** Used by tests — runs a single stage */
  async runStage(pipelineId: string): Promise<void> {
    const task = await this.pipelines.get(pipelineId);
    if (!task) return;
    if (task.stage === "completed" || task.stage === "blocked") return;
    if (!isActiveStage(task.stage)) return;

    const stageEntry = task.stages.find((s) => s.stage === task.stage);
    if (!stageEntry || stageEntry.status !== "running") return;

    const state = await this.store.load();
    const topic = state.topics.find((t) => t.id === task.topicId);
    if (!topic) {
      await this.markFailed(pipelineId, "Topic not found");
      return;
    }

    const workspace = state.workspaces.find((w) => w.id === topic.workspaceId);
    if (!workspace) {
      await this.markFailed(pipelineId, "Workspace not found");
      return;
    }

    const botId = stageEntry.botId;
    if (!botId) {
      await this.markFailed(
        pipelineId,
        `No bot assigned for stage ${task.stage}`,
      );
      return;
    }

    const bot = state.bots.find((b) => b.id === botId);
    const botName = bot?.name ?? botId;

    await this.appendSystemMessage(
      task.topicId,
      `▶ Stage ${task.stage} started (@${botName})`,
    );

    const prompt = buildStagePrompt({
      stage: task.stage,
      title: task.title,
      localPath: workspace.localPath,
    });

    const result = await this.botRun.run({
      topicId: task.topicId,
      botId,
      prompt,
    });

    if (result.clarificationPending) {
      this.pausedPipelines.add(pipelineId);
      return;
    }

    if (!result.ok) {
      await this.markFailed(
        pipelineId,
        stageFailDetail(result.error),
      );
      return;
    }

    const excerpt = await this.messageExcerpt(result.messageId, 500);
    await this.setStageDetail(pipelineId, excerpt);
    await this.pipelines.advance(pipelineId);
  }

  private async runUntilSettled(pipelineId: string): Promise<void> {
    for (;;) {
      const before = await this.pipelines.get(pipelineId);
      if (!before) return;
      if (before.stage === "completed" || before.stage === "blocked") return;
      if (!isActiveStage(before.stage)) return;

      const running = before.stages.find((s) => s.stage === before.stage);
      if (!running || running.status !== "running") return;

      await this.runStage(pipelineId);

      const after = await this.pipelines.get(pipelineId);
      if (!after) return;
      if (after.stage === "completed" || after.stage === "blocked") return;
      // Clarification or no progress — stop chaining
      if (after.stage === before.stage) return;
    }
  }

  private async messageExcerpt(
    messageId: string,
    maxLen: number,
  ): Promise<string> {
    const state = await this.store.load();
    const message = state.messages.find((m) => m.id === messageId);
    const content = message?.content ?? "";
    return content.length > maxLen ? content.slice(0, maxLen) : content;
  }

  private async setStageDetail(
    pipelineId: string,
    detail: string,
  ): Promise<void> {
    const state = await this.store.load();
    const task = state.pipelines.find((p) => p.id === pipelineId);
    if (!task) return;
    const stageEntry = task.stages.find((s) => s.stage === task.stage);
    if (stageEntry) {
      stageEntry.detail = detail;
    }
    await this.store.save(state);
  }

  private async markFailed(
    pipelineId: string,
    detail: string,
  ): Promise<void> {
    this.pausedPipelines.delete(pipelineId);

    const state = await this.store.load();
    const task = state.pipelines.find((p) => p.id === pipelineId);
    if (!task) return;
    if (task.stage === "blocked") return;

    const stageEntry = task.stages.find((s) => s.stage === task.stage);
    if (stageEntry) {
      stageEntry.status = "failed";
      stageEntry.detail = detail;
      stageEntry.at = new Date().toISOString();
    }

    task.stage = "blocked";
    const topic = state.topics.find((t) => t.id === task.topicId);
    if (topic) {
      topic.pipelineStage = "blocked";
    }

    await this.store.save(state);
    this.emit?.({
      type: "pipeline.update",
      topicId: task.topicId,
      pipelineStage: "blocked",
    });
  }

  private async appendSystemMessage(
    topicId: string,
    content: string,
  ): Promise<ChatMessage> {
    const state = await this.store.load();
    const message: ChatMessage = {
      id: randomUUID(),
      topicId,
      author: "system",
      content,
      createdAt: new Date().toISOString(),
    };
    state.messages.push(message);
    await this.store.save(state);
    this.emit?.({ type: "message.upsert", message });
    return message;
  }
}
