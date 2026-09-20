import { describe, it, expect, beforeEach } from "vitest";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { JsonStore } from "../store/json-store.js";
import { BotService } from "./bot-service.js";
import { WorkspaceService } from "./workspace-service.js";
import { ChatService } from "./chat-service.js";
import { PipelineService } from "./pipeline-service.js";
import type { AppState } from "../app-state.js";

async function emptyState(dataDir: string): Promise<AppState> {
  return {
    settings: {
      theme: "dark",
      defaultEngine: "mock",
      dataDir,
      notifications: true,
    },
    bots: [],
    workspaces: [],
    topics: [],
    messages: [],
    pipelines: [],
  };
}

describe("PipelineService", () => {
  let dir: string;
  let store: JsonStore;
  let chat: ChatService;
  let pipeline: PipelineService;
  let topicId: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "ml-aos-pipeline-"));
    store = new JsonStore(dir);
    await store.save(await emptyState(dir));

    const workspaceService = new WorkspaceService(store);
    chat = new ChatService(store, workspaceService, new BotService(store));
    pipeline = new PipelineService(store);

    const workspace = await workspaceService.create({
      name: "demo",
      localPath: dir,
    });
    const topic = await chat.createTopic({
      workspaceId: workspace.id,
      title: "Feature",
    });
    topicId = topic.id;
  });

  it("dispatch creates pipeline task at developing stage", async () => {
    const task = await pipeline.dispatch(topicId, { title: "Build login" });
    expect(task.stage).toBe("developing");
    expect(task.topicId).toBe(topicId);
    expect(task.title).toBe("Build login");

    const topic = await chat.getTopic(topicId);
    expect(topic!.pipelineStage).toBe("developing");
    expect(topic!.pipelineTaskId).toBe(task.id);

    const running = task.stages.find((s) => s.stage === "developing");
    expect(running?.status).toBe("running");
  });

  it("advance moves developing → testing → reviewing → completed", async () => {
    const task = await pipeline.dispatch(topicId, { title: "Flow" });
    const after1 = await pipeline.advance(task.id);
    expect(after1.stage).toBe("testing");

    const after2 = await pipeline.advance(after1.id);
    expect(after2.stage).toBe("reviewing");

    const after3 = await pipeline.advance(after2.id);
    expect(after3.stage).toBe("completed");

    const topic = await chat.getTopic(topicId);
    expect(topic!.pipelineStage).toBe("completed");
  });
});
