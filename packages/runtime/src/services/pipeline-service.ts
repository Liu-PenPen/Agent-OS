import { randomUUID } from "node:crypto";
import type { PipelineStage, PipelineTask, Topic } from "@ml-aos/shared";
import type { JsonStore } from "../store/json-store.js";
import type { ChatEvent } from "./chat-service.js";
import { resolveStageBotIds } from "./pipeline-bots.js";

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

export class PipelineService {
  private readonly timers = new Map<string, ReturnType<typeof setTimeout>>();
  private onDispatch?: (pipelineId: string) => void;

  constructor(
    private readonly store: JsonStore,
    private readonly emit?: (event: ChatEvent) => void,
    private readonly mockAutoAdvanceMs?: number,
  ) {}

  /** Wire PipelineRunner.start after construction */
  setOnDispatch(handler: (pipelineId: string) => void): void {
    this.onDispatch = handler;
  }

  async dispatch(topicId: string, input: DispatchInput): Promise<PipelineTask> {
    const state = await this.store.load();
    const topic = state.topics.find((t) => t.id === topicId);
    if (!topic) {
      throw new Error(`Topic not found: ${topicId}`);
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
    await this.store.save(state);

    this.emitPipelineUpdate(topicId, "developing");

    if (this.mockAutoAdvanceMs && this.mockAutoAdvanceMs > 0) {
      this.scheduleAutoAdvance(task.id);
    }

    this.onDispatch?.(task.id);

    return task;
  }

  async get(id: string): Promise<PipelineTask | undefined> {
    const state = await this.store.load();
    return state.pipelines.find((p) => p.id === id);
  }

  async advance(id: string): Promise<PipelineTask> {
    const state = await this.store.load();
    const task = state.pipelines.find((p) => p.id === id);
    if (!task) {
      throw new Error(`Pipeline not found: ${id}`);
    }
    if (task.stage === "completed") {
      return task;
    }

    const currentIndex = STAGE_ORDER.indexOf(task.stage);
    const currentStage = task.stages.find((s) => s.stage === task.stage);
    if (currentStage) {
      currentStage.status = "done";
      currentStage.at = new Date().toISOString();
    }

    const nextStage = STAGE_ORDER[currentIndex + 1];
    if (!nextStage) {
      await this.store.save(state);
      return task;
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

    await this.store.save(state);
    this.emitPipelineUpdate(task.topicId, nextStage);

    if (nextStage === "completed") {
      this.clearAutoAdvance(id);
    } else if (this.mockAutoAdvanceMs && this.mockAutoAdvanceMs > 0) {
      this.scheduleAutoAdvance(id);
    }

    return task;
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
