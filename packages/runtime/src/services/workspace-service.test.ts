import { describe, it, expect, beforeEach } from "vitest";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { JsonStore } from "../store/json-store.js";
import { WorkspaceService } from "./workspace-service.js";
import type { AppState } from "../app-state.js";

async function emptyState(dataDir: string): Promise<AppState> {
  return {
    settings: {
      theme: "dark",
      defaultEngine: "claude",
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

describe("WorkspaceService", () => {
  let dir: string;
  let store: JsonStore;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "ml-aos-ws-"));
    store = new JsonStore(dir);
    await store.save(await emptyState(dir));
  });

  it("rejects workspace without localPath", async () => {
    const svc = new WorkspaceService(store);
    await expect(
      svc.create({ name: "x", localPath: "" }),
    ).rejects.toThrow(/localPath/);
  });

  it("clears topic cli sessions when localPath changes", async () => {
    const svc = new WorkspaceService(store);
    const ws = await svc.create({
      name: "proj",
      localPath: "/tmp/old",
    });

    const state = await store.load();
    state.topics.push({
      id: "topic-1",
      workspaceId: ws.id,
      title: "t",
      createdAt: new Date().toISOString(),
      cliSessionId: "abc",
      cliSessions: { "bot-1": "sess-1" },
      pipelineStage: "idle",
    });
    await store.save(state);

    await svc.update(ws.id, { localPath: "/tmp/new" });

    const after = await store.load();
    const topic = after.topics.find((t) => t.id === "topic-1");
    expect(topic?.cliSessionId).toBeUndefined();
    expect(topic?.cliSessions).toEqual({});
  });
});
