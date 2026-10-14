import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { findWorkspaceRoot, loadDotEnv } from "./load-env.js";

describe("loadDotEnv", () => {
  let root: string;
  const saved: Record<string, string | undefined> = {};

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "ml-aos-env-"));
    await writeFile(join(root, "pnpm-workspace.yaml"), "packages:\n  - packages/*\n");
    await mkdir(join(root, "packages", "runtime"), { recursive: true });
    await writeFile(
      join(root, ".env"),
      "MI_CLAW_GITEE_TOKEN=from-root\nMI_CLAW_GITEE_ENTERPRISE_ID=123\n",
    );
    for (const key of [
      "MI_CLAW_GITEE_TOKEN",
      "MI_CLAW_GITEE_ENTERPRISE_ID",
      "LOAD_ENV_TEST_ONLY",
    ]) {
      saved[key] = process.env[key];
      delete process.env[key];
    }
  });

  afterEach(async () => {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    await rm(root, { recursive: true, force: true });
  });

  it("finds workspace root from packages/runtime cwd", () => {
    expect(findWorkspaceRoot(join(root, "packages", "runtime"))).toBe(root);
  });

  it("loads repo-root .env when cwd is packages/runtime", () => {
    loadDotEnv(join(root, "packages", "runtime"));
    expect(process.env.MI_CLAW_GITEE_TOKEN).toBe("from-root");
    expect(process.env.MI_CLAW_GITEE_ENTERPRISE_ID).toBe("123");
  });
});
