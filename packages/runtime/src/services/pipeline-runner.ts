import { randomUUID } from "node:crypto";
import type { ChatMessage, PipelineStage } from "@ml-aos/shared";
import type { JsonStore } from "../store/json-store.js";
import type { ChatEvent } from "./chat-service.js";
import type { BotRunService } from "./bot-run-service.js";
import type { PipelineService } from "./pipeline-service.js";
import { STAGE_ROLES } from "./pipeline-bots.js";
import type { AppControl } from "./app-control.js";
import {
  boardTaskIdForPipeline,
  type TaskBoardService,
} from "./task-board-service.js";

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
  const stageHints: Record<ActiveStage, string> = {
    developing:
      "完成本阶段开发：按已确认规格实现变更，做最小必要验证，并总结改动与风险。",
    testing:
      "完成本阶段测试：对照验收标准验证交付物，列出通过/失败项；失败须可复现。",
    reviewing:
      "完成本阶段审查：独立审查变更，明确给出 REVIEW_PASSED 或 REVIEW_FAILED 及理由。",
  };
  return [
    "[ML AOS 流水线]",
    `阶段：${input.stage}（角色：${role}）`,
    `任务：${input.title}`,
    `工作区：${input.localPath}`,
    `要求：${stageHints[input.stage]}`,
    "完成后用简洁中文总结本阶段结论。",
  ].join("\n");
}

export class PipelineRunner {
  private pausedPipelines = new Set<string>();

  constructor(
    private pipelines: PipelineService,
    private botRun: BotRunService,
    private store: JsonStore,
    private emit?: (e: ChatEvent) => void,
    private control?: AppControl,
    private taskBoard?: TaskBoardService,
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

    const excerpt = await this.messageExcerpt(result.messageId, 1500);
    const gate = this.control
      ? await this.control.inspectStage({
          pipelineId,
          topicId: task.topicId,
          stage: task.stage,
          botId,
          excerpt,
          workspacePath: workspace.localPath,
        })
      : "continue";
    if (gate === "pause") {
      this.pausedPipelines.add(pipelineId);
      await this.setStageDetail(pipelineId, excerpt.slice(0, 500));
      return;
    }
    if (gate === "bounce") {
      await this.rewindToDeveloper(pipelineId, excerpt, false);
      return;
    }
    if (gate === "block") {
      await this.markFailed(pipelineId, "打回开发已达上限");
      return;
    }
    await this.setStageDetail(pipelineId, excerpt.slice(0, 500));
    await this.pipelines.advance(pipelineId);
  }

  async continueAfterHuman(topicId: string): Promise<void> {
    const state = await this.store.load();
    const topic = state.topics.find((item) => item.id === topicId);
    if (!topic?.pipelineTaskId) return;
    const pipelineId = topic.pipelineTaskId;
    if (!this.pausedPipelines.has(pipelineId)) return;
    this.pausedPipelines.delete(pipelineId);
    await this.pipelines.advance(pipelineId);
    await this.runUntilSettled(pipelineId);
  }

  async rewindToDeveloper(
    pipelineId: string,
    evidence: string,
    chain = true,
  ): Promise<void> {
    this.pausedPipelines.delete(pipelineId);
    let topicId = "";
    await this.store.transact((state) => {
      const task = state.pipelines.find((item) => item.id === pipelineId);
      if (!task || task.stage === "completed" || task.stage === "blocked") return;
      topicId = task.topicId;
      task.stage = "developing";
      for (const stage of task.stages) {
        if (stage.stage === "developing") {
          stage.status = "running";
          stage.detail = evidence.slice(0, 500);
          stage.at = new Date().toISOString();
        } else if (stage.stage === "testing" || stage.stage === "reviewing") {
          stage.status = "pending";
          stage.detail = undefined;
        }
      }
      const topic = state.topics.find((item) => item.id === task.topicId);
      if (topic) topic.pipelineStage = "developing";
    });
    if (!topicId) return;
    await this.appendSystemMessage(
      topicId,
      `打回开发。证据：${evidence.slice(0, 400)}`,
    );
    this.emit?.({
      type: "pipeline.update",
      topicId,
      pipelineStage: "developing",
    });
    if (chain) await this.runUntilSettled(pipelineId);
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
    await this.store.transact((state) => {
      const task = state.pipelines.find((p) => p.id === pipelineId);
      if (!task) return;
      const stageEntry = task.stages.find((s) => s.stage === task.stage);
      if (stageEntry) {
        stageEntry.detail = detail;
      }
    });
  }

  private async markFailed(
    pipelineId: string,
    detail: string,
  ): Promise<void> {
    this.pausedPipelines.delete(pipelineId);

    let topicId: string | undefined;
    let title: string | undefined;
    let botId: string | undefined;
    let alreadyBlocked = false;
    await this.store.transact((state) => {
      const task = state.pipelines.find((p) => p.id === pipelineId);
      if (!task) return;
      if (task.stage === "blocked") {
        alreadyBlocked = true;
        return;
      }

      const stageEntry = task.stages.find((s) => s.stage === task.stage);
      if (stageEntry) {
        stageEntry.status = "failed";
        stageEntry.detail = detail;
        stageEntry.at = new Date().toISOString();
        botId = stageEntry.botId;
      }

      task.stage = "blocked";
      title = task.title;
      const topic = state.topics.find((t) => t.id === task.topicId);
      if (topic) {
        topic.pipelineStage = "blocked";
      }
      topicId = task.topicId;
    });

    if (!topicId || alreadyBlocked) return;
    this.emit?.({
      type: "pipeline.update",
      topicId,
      pipelineStage: "blocked",
    });
    await this.syncBoardFailed(pipelineId, topicId, title ?? pipelineId, botId);
  }

  private async syncBoardFailed(
    pipelineId: string,
    topicId: string,
    title: string,
    botId?: string,
  ): Promise<void> {
    if (!this.taskBoard) return;
    const byTopic = await this.taskBoard.findByTopicId(topicId);
    const id = byTopic?.id ?? boardTaskIdForPipeline(pipelineId);
    if (!byTopic) {
      await this.taskBoard.upsert({
        id,
        title,
        status: "running",
        source: "pipeline",
        topicId,
        pipelineId,
        stage: "blocked",
        botId,
      });
    }
    await this.taskBoard.markFailed(id, "pipeline_blocked", {
      stage: "blocked",
      botId,
    });
  }

  private async appendSystemMessage(
    topicId: string,
    content: string,
  ): Promise<ChatMessage | undefined> {
    const message: ChatMessage = {
      id: randomUUID(),
      topicId,
      author: "system",
      content,
      createdAt: new Date().toISOString(),
    };
    let saved = false;
    await this.store.transact((state) => {
      if (!state.topics.some((t) => t.id === topicId)) return;
      state.messages.push(message);
      saved = true;
    });
    if (!saved) return;
    this.emit?.({ type: "message.upsert", message });
    return message;
  }
}
