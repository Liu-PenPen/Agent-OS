import { describe, it, expect, beforeEach } from "vitest";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { JsonStore } from "../store/json-store.js";
import { BotService } from "./bot-service.js";
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

describe("BotService", () => {
  let dir: string;
  let store: JsonStore;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "ml-aos-bot-"));
    store = new JsonStore(dir);
    await store.save(await emptyState(dir));
  });

  it("creates and lists bots", async () => {
    const svc = new BotService(store);
    const bot = await svc.create({
      name: "Dev Bot",
      role: "developer",
      defaultEngine: "claude",
      instructions: "code",
      enabled: true,
    });
    expect(bot.id).toBeTruthy();
    expect(bot.name).toBe("Dev Bot");

    const list = await svc.list();
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe(bot.id);
  });

  it("updates and deletes bots", async () => {
    const svc = new BotService(store);
    const bot = await svc.create({
      name: "A",
      role: "developer",
      defaultEngine: "claude",
      instructions: "",
      enabled: true,
    });

    const updated = await svc.update(bot.id, { name: "B", enabled: false });
    expect(updated.name).toBe("B");
    expect(updated.enabled).toBe(false);

    await svc.delete(bot.id);
    expect(await svc.list()).toHaveLength(0);
  });
});
