import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  maskToken,
  resolveGiteeCredentials,
  setGiteeCredentialsDataDir,
  updateStoredGiteeCredentials,
  viewGiteeCredentials,
} from "./credentials.js";

describe("gitee credentials", () => {
  const originalEnv = { ...process.env };
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "ml-aos-gitee-cred-"));
    setGiteeCredentialsDataDir(dir);
    delete process.env.ML_AOS_GITEE_TOKEN;
    delete process.env.MI_CLAW_GITEE_TOKEN;
    delete process.env.GITEE_ENT_MCP_ACCESS_TOKEN;
    delete process.env.ML_AOS_GITEE_ENTERPRISE_ID;
    delete process.env.MI_CLAW_GITEE_ENTERPRISE_ID;
    delete process.env.ML_AOS_GITEE_USER_ID;
    delete process.env.GITEE_USER_ID;
    delete process.env.ML_AOS_GITEE_API_BASE;
    delete process.env.GITEE_ENT_API_BASE;
  });

  afterEach(async () => {
    process.env = { ...originalEnv };
    await rm(dir, { recursive: true, force: true });
  });

  it("maskToken keeps last 4 chars", () => {
    expect(maskToken("abcdefgh")).toBe("••••efgh");
  });

  it("resolves from store when env empty", () => {
    updateStoredGiteeCredentials(
      {
        token: "store-token-xyz",
        enterpriseId: "ent-1",
        userId: "user-1",
      },
      dir,
    );
    const config = resolveGiteeCredentials(dir);
    expect(config.token).toBe("store-token-xyz");
    expect(config.enterpriseId).toBe("ent-1");
    expect(config.userId).toBe("user-1");
  });

  it("env wins over store", () => {
    updateStoredGiteeCredentials(
      {
        token: "store-token",
        enterpriseId: "store-ent",
        userId: "store-user",
      },
      dir,
    );
    process.env.ML_AOS_GITEE_TOKEN = "env-token";
    process.env.ML_AOS_GITEE_ENTERPRISE_ID = "env-ent";
    process.env.ML_AOS_GITEE_USER_ID = "env-user";
    const config = resolveGiteeCredentials(dir);
    expect(config).toMatchObject({
      token: "env-token",
      enterpriseId: "env-ent",
      userId: "env-user",
    });
  });

  it("accepts legacy MI_CLAW_ aliases", () => {
    process.env.MI_CLAW_GITEE_TOKEN = "legacy-token";
    process.env.MI_CLAW_GITEE_ENTERPRISE_ID = "legacy-ent";
    process.env.GITEE_USER_ID = "legacy-user";
    const config = resolveGiteeCredentials(dir);
    expect(config.token).toBe("legacy-token");
  });

  it("empty token patch keeps stored token", () => {
    updateStoredGiteeCredentials(
      {
        token: "keep-me",
        enterpriseId: "e",
        userId: "u",
      },
      dir,
    );
    updateStoredGiteeCredentials({ token: "", enterpriseId: "e2" }, dir);
    expect(viewGiteeCredentials(dir).enterpriseId).toBe("e2");
    expect(resolveGiteeCredentials(dir).token).toBe("keep-me");
  });

  it("mask placeholder does not overwrite token", () => {
    updateStoredGiteeCredentials(
      { token: "real-secret-token", enterpriseId: "e", userId: "u" },
      dir,
    );
    updateStoredGiteeCredentials({ token: "••••oken" }, dir);
    expect(resolveGiteeCredentials(dir).token).toBe("real-secret-token");
  });

  it("clearToken removes stored token", () => {
    updateStoredGiteeCredentials(
      { token: "gone", enterpriseId: "e", userId: "u" },
      dir,
    );
    updateStoredGiteeCredentials({ clearToken: true }, dir);
    expect(() => resolveGiteeCredentials(dir)).toThrow(/Token/);
  });
});
