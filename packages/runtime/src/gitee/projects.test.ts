import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { mkdtemp, writeFile, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { GiteeProjectsStore } from "./projects.js";

vi.mock("./client.js", () => ({
  listEnterprisePrograms: vi.fn(async () => [
    {
      id: "818309",
      name: "航研所项目",
      ident: "PJ20251201",
      programId: "818309",
    },
    {
      id: "900001",
      name: "AOS Core",
      ident: "PJ20260301",
      programId: "900001",
    },
  ]),
}));

describe("GiteeProjectsStore", () => {
  let dir: string;
  let configPath: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "ml-aos-gitee-"));
    const configDir = join(dir, "config");
    await mkdir(configDir, { recursive: true });
    configPath = join(configDir, "gitee-projects.json");
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
    vi.clearAllMocks();
  });

  it("lists programs from Gitee when no local json", async () => {
    const store = new GiteeProjectsStore(dir, configPath);
    const list = await store.list();
    expect(list).toHaveLength(2);
    expect(list[0]?.fromRemote).toBe(true);
    expect(list.map((p) => p.name)).toContain("航研所项目");
  });

  it("filters remote list by optional allowlist json", async () => {
    await writeFile(
      configPath,
      JSON.stringify({
        projects: [
          {
            id: "818309",
            name: "航研所项目",
            programId: "818309",
          },
        ],
      }),
      "utf8",
    );
    const store = new GiteeProjectsStore(dir, configPath);
    const list = await store.list();
    expect(list).toHaveLength(1);
    expect(list[0]?.programId).toBe("818309");
  });

  it("merges runtime settings onto remote programs", async () => {
    const store = new GiteeProjectsStore(dir, configPath);
    const updated = await store.updateSettings("818309", {
      localPath: "E:\\\\work\\\\hangyan",
      defaultEngine: "codex",
      cast: ["ceo", "developer"],
    });
    expect(updated.localPath).toBe("E:\\\\work\\\\hangyan");
    expect(updated.defaultEngine).toBe("codex");
    expect(updated.cast).toEqual(["ceo", "developer"]);
  });
});
