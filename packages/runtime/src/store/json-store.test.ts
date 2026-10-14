import { describe, it, expect, beforeEach } from "vitest";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { JsonStore } from "./json-store.js";
import type { AppState } from "../app-state.js";

describe("JsonStore", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "ml-aos-"));
  });

  it("round-trips empty state", async () => {
    const store = new JsonStore(dir);
    const empty: AppState = {
      settings: {
        theme: "dark",
        defaultEngine: "claude",
        dataDir: dir,
        notifications: true,
      },
      bots: [],
      workspaces: [],
      topics: [],
      messages: [],
      pipelines: [],
    };
    await store.save(empty);
    const loaded = await store.load();
    expect(loaded.settings.theme).toBe("dark");
    expect(loaded.bots).toEqual([]);
  });
});
