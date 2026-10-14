import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import type { GiteeEnvConfig } from "./client.js";

const DEFAULT_API_BASE = "https://api.gitee.com/enterprises";
const SETTINGS_HINT = "请在应用偏好 → 集成 / Gitee 中填写，或配置本机环境变量 / .env";

export type StoredGiteeCredentials = {
  token?: string;
  enterpriseId?: string;
  userId?: string;
  apiBase?: string;
};

export type GiteeCredentialsView = {
  configured: boolean;
  tokenMasked: string | null;
  tokenSet: boolean;
  enterpriseId: string;
  userId: string;
  apiBase: string;
  /** Which layer supplied each field after merge. */
  sources: {
    token: "env" | "store" | "none";
    enterpriseId: "env" | "store" | "none";
    userId: "env" | "store" | "none";
    apiBase: "env" | "store" | "default";
  };
  envOverridesActive: boolean;
};

export type UpdateGiteeCredentialsInput = {
  token?: string;
  enterpriseId?: string;
  userId?: string;
  apiBase?: string;
  clearToken?: boolean;
};

let credentialsDataDir: string | null = null;

/** Call once at runtime boot so sync Gitee client can resolve store fallback. */
export function setGiteeCredentialsDataDir(dataDir: string): void {
  credentialsDataDir = dataDir;
}

export function getGiteeCredentialsDataDir(): string {
  return (
    credentialsDataDir ??
    process.env.ML_AOS_DATA_DIR?.trim() ??
    join(process.cwd(), "data")
  );
}

export function maskToken(token: string): string {
  const value = token.trim();
  if (!value) return "";
  if (value.length <= 4) return "••••";
  return `••••${value.slice(-4)}`;
}

function envPick(...keys: string[]): string {
  for (const key of keys) {
    const value = process.env[key]?.trim();
    if (value) return value;
  }
  return "";
}

/** Partial credentials present only in process.env (after loadDotEnv). */
export function readEnvGiteePartial(): {
  token: string;
  enterpriseId: string;
  userId: string;
  apiBase: string;
} {
  return {
    token: envPick(
      "ML_AOS_GITEE_TOKEN",
      "MI_CLAW_GITEE_TOKEN",
      "GITEE_ENT_MCP_ACCESS_TOKEN",
    ),
    enterpriseId: envPick(
      "ML_AOS_GITEE_ENTERPRISE_ID",
      "MI_CLAW_GITEE_ENTERPRISE_ID",
    ),
    userId: envPick("ML_AOS_GITEE_USER_ID", "GITEE_USER_ID"),
    apiBase: envPick("ML_AOS_GITEE_API_BASE", "GITEE_ENT_API_BASE"),
  };
}

function credentialsPath(dataDir = getGiteeCredentialsDataDir()): string {
  return join(dataDir, "gitee-credentials.json");
}

export function loadStoredGiteeCredentials(
  dataDir = getGiteeCredentialsDataDir(),
): StoredGiteeCredentials {
  const path = credentialsPath(dataDir);
  if (!existsSync(path)) return {};
  try {
    const raw = JSON.parse(readFileSync(path, "utf8")) as StoredGiteeCredentials;
    return {
      token: typeof raw.token === "string" ? raw.token.trim() : undefined,
      enterpriseId:
        typeof raw.enterpriseId === "string" ? raw.enterpriseId.trim() : undefined,
      userId: typeof raw.userId === "string" ? raw.userId.trim() : undefined,
      apiBase: typeof raw.apiBase === "string" ? raw.apiBase.trim() : undefined,
    };
  } catch {
    return {};
  }
}

export function saveStoredGiteeCredentials(
  next: StoredGiteeCredentials,
  dataDir = getGiteeCredentialsDataDir(),
): StoredGiteeCredentials {
  const path = credentialsPath(dataDir);
  mkdirSync(dirname(path), { recursive: true });
  const cleaned: StoredGiteeCredentials = {
    token: next.token?.trim() || undefined,
    enterpriseId: next.enterpriseId?.trim() || undefined,
    userId: next.userId?.trim() || undefined,
    apiBase: next.apiBase?.trim() || undefined,
  };
  writeFileSync(path, `${JSON.stringify(cleaned, null, 2)}\n`, "utf8");
  return cleaned;
}

export function updateStoredGiteeCredentials(
  input: UpdateGiteeCredentialsInput,
  dataDir = getGiteeCredentialsDataDir(),
): StoredGiteeCredentials {
  const current = loadStoredGiteeCredentials(dataDir);
  const next: StoredGiteeCredentials = { ...current };

  if (input.clearToken) {
    delete next.token;
  } else if (typeof input.token === "string") {
    const trimmed = input.token.trim();
    // Empty / mask placeholder = keep existing (ADR 0003).
    if (trimmed && !trimmed.startsWith("••••")) {
      next.token = trimmed;
    }
  }

  if (typeof input.enterpriseId === "string") {
    next.enterpriseId = input.enterpriseId.trim() || undefined;
  }
  if (typeof input.userId === "string") {
    next.userId = input.userId.trim() || undefined;
  }
  if (typeof input.apiBase === "string") {
    next.apiBase = input.apiBase.trim() || undefined;
  }

  return saveStoredGiteeCredentials(next, dataDir);
}

function sourceOf(
  envValue: string,
  storeValue: string | undefined,
): "env" | "store" | "none" {
  if (envValue) return "env";
  if (storeValue) return "store";
  return "none";
}

export function viewGiteeCredentials(
  dataDir = getGiteeCredentialsDataDir(),
): GiteeCredentialsView {
  const env = readEnvGiteePartial();
  const stored = loadStoredGiteeCredentials(dataDir);
  const token = env.token || stored.token || "";
  const enterpriseId = env.enterpriseId || stored.enterpriseId || "";
  const userId = env.userId || stored.userId || "";
  const apiBase = (
    env.apiBase ||
    stored.apiBase ||
    DEFAULT_API_BASE
  ).replace(/\/$/, "");
  const sources = {
    token: sourceOf(env.token, stored.token),
    enterpriseId: sourceOf(env.enterpriseId, stored.enterpriseId),
    userId: sourceOf(env.userId, stored.userId),
    apiBase: env.apiBase
      ? ("env" as const)
      : stored.apiBase
        ? ("store" as const)
        : ("default" as const),
  };
  return {
    configured: Boolean(token && enterpriseId && userId),
    tokenMasked: token ? maskToken(token) : null,
    tokenSet: Boolean(token),
    enterpriseId,
    userId,
    apiBase,
    sources,
    envOverridesActive:
      sources.token === "env" ||
      sources.enterpriseId === "env" ||
      sources.userId === "env" ||
      sources.apiBase === "env",
  };
}

/**
 * Env wins over dataDir store (ADR 0002). Throws with settings hint when incomplete.
 */
export function resolveGiteeCredentials(
  dataDir = getGiteeCredentialsDataDir(),
): GiteeEnvConfig {
  const env = readEnvGiteePartial();
  const stored = loadStoredGiteeCredentials(dataDir);
  const token = env.token || stored.token || "";
  const enterpriseId = env.enterpriseId || stored.enterpriseId || "";
  const userId = env.userId || stored.userId || "";
  const apiBase = (
    env.apiBase ||
    stored.apiBase ||
    DEFAULT_API_BASE
  ).replace(/\/$/, "");

  if (!token) {
    throw new Error(`缺少 Gitee Token（ML_AOS_GITEE_TOKEN）。${SETTINGS_HINT}`);
  }
  if (!enterpriseId) {
    throw new Error(
      `缺少 Gitee 企业 ID（ML_AOS_GITEE_ENTERPRISE_ID）。${SETTINGS_HINT}`,
    );
  }
  if (!userId) {
    throw new Error(`缺少 Gitee 用户 ID（ML_AOS_GITEE_USER_ID）。${SETTINGS_HINT}`);
  }
  return { token, enterpriseId, userId, apiBase };
}

export function giteeCredentialsConfigured(
  dataDir = getGiteeCredentialsDataDir(),
): boolean {
  try {
    resolveGiteeCredentials(dataDir);
    return true;
  } catch {
    return false;
  }
}
