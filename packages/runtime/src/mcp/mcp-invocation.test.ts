import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  mcpConfigDataDir,
  resolveMcpServerInvocation,
} from "./mcp-invocation.js";

describe("mcp-invocation", () => {
  const originalCwd = process.cwd();
  const originalDataDir = process.env.ML_AOS_DATA_DIR;

  afterEach(() => {
    process.chdir(originalCwd);
    if (originalDataDir === undefined) {
      delete process.env.ML_AOS_DATA_DIR;
    } else {
      process.env.ML_AOS_DATA_DIR = originalDataDir;
    }
  });

  it("prefers bundled app-tools-server.js when present in cwd", () => {
    const dir = mkdtempSync(join(tmpdir(), "ml-aos-mcp-"));
    writeFileSync(join(dir, "app-tools-server.js"), "export {}\n", "utf8");
    process.chdir(dir);
    const invocation = resolveMcpServerInvocation();
    expect(invocation.command).toBe(process.execPath);
    expect(invocation.args).toEqual([join(dir, "app-tools-server.js")]);
  });

  it("falls back to tsx + TypeScript source in dev tree", () => {
    const dir = mkdtempSync(join(tmpdir(), "ml-aos-mcp-dev-"));
    process.chdir(dir);
    const invocation = resolveMcpServerInvocation();
    expect(invocation.command).toBe(process.execPath);
    expect(invocation.args[0]).toMatch(/tsx/);
    expect(invocation.args[1]).toMatch(/app-tools-server\.ts$/);
  });

  it("uses ML_AOS_DATA_DIR for MCP config files", () => {
    const dir = mkdtempSync(join(tmpdir(), "ml-aos-mcp-data-"));
    process.env.ML_AOS_DATA_DIR = dir;
    expect(mcpConfigDataDir()).toBe(dir);
  });
});
