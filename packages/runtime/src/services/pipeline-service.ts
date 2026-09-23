import { randomUUID } from "node:crypto";
import type { PipelineStage, PipelineTask, Topic } from "@ml-aos/shared";
import type { JsonStore } from "../store/json-store.js";
import type { ChatEvent } from "./chat-service.js";
import { resolveStageBotIds } from "./pipeline-bots.js";
import {
  boardTaskIdForPipeline,
  type TaskBoardService,
} from "./task-board-service.js";

const STAGE_ORDER: PipelineStage[] = [
  "developing",
  "testing",
  "reviewing",
  "completed",
];

export interface DispatchInput {
  title: string;
  assigneeBotIds?: string[];
}

function lastStageBotId(task: PipelineTask): string | undefined {
  const current = task.stages.find((s) => s.stage === task.stage);
  if (current?.botId) return current.botId;
  for (let i = task.stages.length - 1; i >= 0; i--) {
    const botId = task.stages[i]?.botId;
    if (botId) return botId;
  }
  return undefined;
}

export class PipelineService {
  private readonly timers = new Map<string, ReturnType<typeof setTimeout>>();
  private onDispatch?: (pipelineId: string) => void;

  constructor(
    private readonly store: JsonStore,
    private readonly emit?: (event: ChatEvent) => void,
    private readonly mockAutoAdvanceMs?: number,
    private readonly taskBoard?: TaskBoardService,
  ) {}

  /** Wire PipelineRunner.start after construction */
  setOnDispatch(handler: (pipelineId: string) => void): void {
    this.onDispatch = handler;
  }

  async dispatch(topicId: string, input: DispatchInput): Promise<PipelineTask> {
    let missing = false;
    let taskOut: PipelineTask | undefined;

    await this.store.transact((state) => {
      const topic = state.topics.find((t) => t.id === topicId);
      if (!topic) {
        missing = true;
        return;
      }

      const resolved = resolveStageBotIds(state.bots, input.assigneeBotIds);
      const now = new Date().toISOString();
      const task: PipelineTask = {
        id: randomUUID(),
        topicId,
        title: input.title,
        stage: "developing",
        stages: STAGE_ORDER.map((stage, index) => ({
          stage,
          botId:
            stage === "developing" ||
            stage === "testing" ||
            stage === "reviewing"
              ? resolved[stage]
              : undefined,
          status: index === 0 ? "running" : "pending",
          at: index === 0 ? now : undefined,
        })),
      };

      state.pipelines.push(task);
      topic.pipelineStage = "developing";
      topic.pipelineTaskId = task.id;
      taskOut = task;
    });

    if (missing || !taskOut) {
      throw new Error(`Topic not found: ${topicId}`);
    }

    this.emitPipelineUpdate(topicId, "developing");
    await this.ensureBoardRunning(taskOut);

    if (this.mockAutoAdvanceMs && this.mockAutoAdvanceMs > 0) {
      this.scheduleAutoAdvance(taskOut.id);
    }

    this.onDispatch?.(taskOut.id);

    return taskOut;
  }

  async get(id: string): Promise<PipelineTask | undefined> {
    const state = await this.store.load();
    return state.pipelines.find((p) => p.id === id);
  }

  async advance(id: string): Promise<PipelineTask> {
    let missing = false;
    let taskOut: PipelineTask | undefined;
    let emitted: PipelineStage | undefined;

    await this.store.transact((state) => {
      const task = state.pipelines.find((p) => p.id === id);
      if (!task) {
        missing = true;
        return;
      }
      if (task.stage === "completed") {
        taskOut = task;
        return;
      }

      const currentIndex = STAGE_ORDER.indexOf(task.stage);
      const currentStage = task.stages.find((s) => s.stage === task.stage);
      if (currentStage) {
        currentStage.status = "done";
        currentStage.at = new Date().toISOString();
      }

      const nextStage = STAGE_ORDER[currentIndex + 1];
      if (!nextStage) {
        taskOut = task;
        return;
      }

      task.stage = nextStage;
      const nextEntry = task.stages.find((s) => s.stage === nextStage);
      if (nextEntry) {
        nextEntry.status = nextStage === "completed" ? "done" : "running";
        nextEntry.at = new Date().toISOString();
      }

      const topic = state.topics.find((t) => t.id === task.topicId);
      if (topic) {
        topic.pipelineStage = nextStage;
      }
      taskOut = task;
      emitted = nextStage;
    });

    if (missing || !taskOut) {
      throw new Error(`Pipeline not found: ${id}`);
    }
    if (!emitted) return taskOut;

    this.emitPipelineUpdate(taskOut.topicId, emitted);

    if (emitted === "completed") {
      this.clearAutoAdvance(id);
      await this.syncBoardCompleted(taskOut);
    } else {
      await this.syncBoardStage(taskOut);
      if (this.mockAutoAdvanceMs && this.mockAutoAdvanceMs > 0) {
        this.scheduleAutoAdvance(id);
      }
    }

    return taskOut;
  }

  private async ensureBoardRunning(task: PipelineTask): Promise<void> {
    if (!this.taskBoard) return;
    const byTopic = await this.taskBoard.findByTopicId(task.topicId);
    if (byTopic) {
      await this.taskBoard.upsert({
        id: byTopic.id,
        title: byTopic.title,
        status: byTopic.status === "completed" ? byTopic.status : "running",
        source: byTopic.source,
        topicId: task.topicId,
        pipelineId: task.id,
        stage: task.stage,
        botId: lastStageBotId(task),
      });
      return;
    }
    await this.taskBoard.upsert({
      id: boardTaskIdForPipeline(task.id),
      title: task.title,
      status: "running",
      source: "pipeline",
      topicId: task.topicId,
      pipelineId: task.id,
      stage: task.stage,
      botId: lastStageBotId(task),
    });
  }

  private async syncBoardStage(task: PipelineTask): Promise<void> {
    if (!this.taskBoard) return;
    const byTopic = await this.taskBoard.findByTopicId(task.topicId);
    if (!byTopic) return;
    await this.taskBoard.upsert({
      id: byTopic.id,
      title: byTopic.title,
      status: byTopic.status,
      source: byTopic.source,
      topicId: task.topicId,
      pipelineId: byTopic.pipelineId ?? task.id,
      stage: task.stage,
      botId: lastStageBotId(task),
    });
  }

  private async syncBoardCompleted(task: PipelineTask): Promise<void> {
    if (!this.taskBoard) return;
    const byTopic = await this.taskBoard.findByTopicId(task.topicId);
    const id = byTopic?.id ?? boardTaskIdForPipeline(task.id);
    if (!byTopic) {
      await this.taskBoard.upsert({
        id,
        title: task.title,
        status: "completed",
        source: "pipeline",
        topicId: task.topicId,
        pipelineId: task.id,
        stage: "completed",
        botId: lastStageBotId(task),
      });
    }
    await this.taskBoard.markCompleted(id, {
      stage: "completed",
      botId: lastStageBotId(task),
    });
  }

  private scheduleAutoAdvance(pipelineId: string): void {
    this.clearAutoAdvance(pipelineId);
    const timer = setTimeout(() => {
      void this.advance(pipelineId).catch(() => {
        this.clearAutoAdvance(pipelineId);
      });
    }, this.mockAutoAdvanceMs);
    this.timers.set(pipelineId, timer);
  }

  private clearAutoAdvance(pipelineId: string): void {
    const timer = this.timers.get(pipelineId);
    if (timer) {
      clearTimeout(timer);
      this.timers.delete(pipelineId);
    }
  }

  private emitPipelineUpdate(
    topicId: string,
    pipelineStage: Topic["pipelineStage"],
  ): void {
    this.emit?.({
      type: "pipeline.update",
      topicId,
      pipelineStage,
    });
  }
}
