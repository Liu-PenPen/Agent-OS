import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AcceptanceService } from "./acceptance-service.js";

describe("AcceptanceService", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "ml-aos-acc-"));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("saves to data dir and workspace .ml-aos/acceptance", async () => {
    const ws = join(dir, "ws");
    const service = new AcceptanceService(dir);
    const result = await service.save({
      topicId: "topic-1",
      botId: "tester",
      workspacePath: ws,
      submission: {
        verdict: "pass",
        summary: "核心路径通过",
        checks: [
          { id: "c1", title: "登录", status: "pass" },
          { id: "c2", title: "列表", status: "pass" },
        ],
        evidence: [{ kind: "note", text: "smoke ok" }],
        source: "agent-browser",
        baseURL: "http://localhost:5173",
      },
    });

    expect(result.id).toBeTruthy();
    expect(result.verdict).toBe("pass");
    const latest = await service.latest("topic-1");
    expect(latest?.summary).toBe("核心路径通过");

    const wsFile = join(ws, ".ml-aos", "acceptance", `${result.id}.json`);
    const raw = JSON.parse(await readFile(wsFile, "utf8"));
    expect(raw.checks).toHaveLength(2);
  });

  it("formats tester prompt extras with baseURL", () => {
    const service = new AcceptanceService(dir);
    const text = service.formatTesterPromptExtras({
      testBaseUrl: "http://127.0.0.1:3000",
      testStartCommand: "pnpm dev",
    });
    expect(text).toContain("submit_acceptance");
    expect(text).toContain("http://127.0.0.1:3000");
    expect(text).toContain("pnpm dev");
  });
});
