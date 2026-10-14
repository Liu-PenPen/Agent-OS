import { z } from "zod";

export type ThemeMode = "warm" | "dark" | "light" | "system";
export type EngineKind = "claude" | "codex";
export type PipelineStage =
  | "idle"
  | "developing"
  | "testing"
  | "reviewing"
  | "completed"
  | "blocked";

export interface AppSettings {
  theme: ThemeMode;
  defaultEngine: EngineKind;
  dataDir: string;
  notifications: boolean;
}

/** A skill bound to a bot after it is resolved in the user skill library. */
export interface SkillBinding {
  id: string;
  /** `owner/repo@skill`, `bundled:<id>`, or the skill id when discovered locally. */
  source: string;
  /** Absolute path to SKILL.md when status is ready. */
  localPath?: string;
  status: "ready" | "failed";
  error?: string;
}

export interface BotConfig {
  id: string;
  name: string;
  role: string;
  defaultEngine: EngineKind;
  instructions: string;
  enabled: boolean;
  /** Installed skills. Legacy stores may still contain plain skill ids. */
  skills?: SkillBinding[];
}

export interface Workspace {
  id: string;
  name: string;
  localPath: string;
  gitUrl?: string;
}

export interface Topic {
  id: string;
  workspaceId: string;
  title: string;
  createdAt: string;
  /** @deprecated Prefer cliSessions (per-bot). Kept for migration. */
  cliSessionId?: string;
  /** Claude/Codex session id keyed by botId — aligns with agent-os per-bot isolation. */
  cliSessions?: Record<string, string>;
  pipelineStage: PipelineStage;
  pipelineTaskId?: string;
}

export type MessageAuthor = "user" | "bot" | "system";

export interface ChatMessage {
  id: string;
  topicId: string;
  author: MessageAuthor;
  botId?: string;
  content: string;
  createdAt: string;
  /** True while the bot reply is still being streamed. */
  streaming?: boolean;
  kind?: "text" | "clarification" | "tool" | "dispatch" | "mention" | "app-tool";
  /** Live or finished CLI run, attached to the bot reply. */
  run?: {
    status: "running" | "success" | "failed" | "cancelled";
    engine?: string;
    current?: string;
    toolCount?: number;
    tools?: { name: string; detail?: string }[];
    /** Tokens in the latest model usage report. Absent until the engine sends one. */
    contextUsed?: number;
    /** Tokens at the first usage report of this run. */
    contextStart?: number;
    /** Context window from the engine, when it reports one. */
    contextWindow?: number;
    finishedAt?: string;
  };
  /** Structured handoff. Present when kind is dispatch. */
  dispatch?: {
    fromName: string;
    toName: string;
    objective: string;
    instruction?: string;
    expectedOutput?: string;
    project?: string;
    reportToName?: string;
  };
  clarification?: {
    id: string;
    prompt: string;
    options: { id: string; label: string }[];
    selectedOptionId?: string;
    status: "pending" | "answered";
  };
  /** Structured agent-os tool card. Present when kind is app-tool. */
  appTool?: {
    token: string;
    tool: "clarification" | "spec" | "approval" | "visual" | "acceptance";
    status: "pending" | "done";
    title?: string;
    summary?: string;
    detail?: string;
    specPath?: string;
    ticketsPath?: string;
    documentUrl?: string;
    operation?: string;
    impact?: string;
    rollback?: string;
    imageUrl?: string;
    channel?: "team" | "pipeline";
    pipelineId?: string;
    /** Acceptance run id when tool === acceptance */
    acceptanceId?: string;
    acceptanceVerdict?: "pass" | "fail" | "skip";
    /** Structured options for clarification cards (Feishu-style clickable choices). */
    questions?: {
      id: string;
      prompt: string;
      options: { id: string; label: string; recommended?: boolean }[];
    }[];
  };
}

export interface PipelineTask {
  id: string;
  topicId: string;
  title: string;
  stage: PipelineStage;
  stages: {
    stage: PipelineStage;
    botId?: string;
    status: "pending" | "running" | "done" | "failed";
    detail?: string;
    at?: string;
  }[];
}

export interface User {
  id: string;
  username: string;
  email: string;
  createdAt: string;
}

export interface StoredUser extends User {
  passwordHash: string;
  salt: string;
}

export interface AuthResponse {
  user: User;
  token: string;
}

const ThemeModeSchema = z.enum(["warm", "dark", "light", "system"]);
const EngineKindSchema = z.preprocess(
  (value) => (value === "mock" ? "claude" : value),
  z.enum(["claude", "codex"]),
);
const PipelineStageSchema = z.enum([
  "idle",
  "developing",
  "testing",
  "reviewing",
  "completed",
  "blocked",
]);

export const AppSettingsSchema = z.object({
  theme: ThemeModeSchema.default("warm"),
  defaultEngine: EngineKindSchema,
  dataDir: z.string(),
  notifications: z.boolean(),
});

export const SkillBindingSchema = z.object({
  id: z.string(),
  source: z.string(),
  localPath: z.string().optional(),
  status: z.enum(["ready", "failed"]),
  error: z.string().optional(),
});

function skillBindingFromStored(value: string | SkillBinding): SkillBinding {
  if (typeof value !== "string") return value;
  const id = value.trim().toLowerCase();
  return {
    id,
    source: id,
    status: "failed",
    error: "尚未安装",
  };
}

export const BotConfigSchema: z.ZodType<BotConfig, z.ZodTypeDef, unknown> = z
  .object({
    id: z.string(),
    name: z.string(),
    role: z.string(),
    defaultEngine: EngineKindSchema,
    instructions: z.string(),
    enabled: z.boolean(),
    skills: z
      .array(z.union([z.string(), SkillBindingSchema]))
      .optional()
      .default([])
      .transform((items) => items.map(skillBindingFromStored)),
  })
  .transform((bot): BotConfig => {
    if (
      !bot.id ||
      !bot.name ||
      !bot.role ||
      bot.instructions == null ||
      bot.enabled == null ||
      !bot.defaultEngine
    ) {
      throw new Error("Invalid bot config");
    }
    return {
      id: bot.id,
      name: bot.name,
      role: bot.role,
      defaultEngine: bot.defaultEngine,
      instructions: bot.instructions,
      enabled: bot.enabled,
      skills: bot.skills ?? [],
    };
  });

export const WorkspaceSchema = z.object({
  id: z.string(),
  name: z.string(),
  localPath: z.string(),
  gitUrl: z.string().optional(),
});

export const TopicSchema = z.object({
  id: z.string(),
  workspaceId: z.string(),
  title: z.string(),
  createdAt: z.string(),
  cliSessionId: z.string().optional(),
  cliSessions: z.record(z.string()).optional(),
  pipelineStage: PipelineStageSchema,
  pipelineTaskId: z.string().optional(),
});

export const ChatMessageSchema = z.object({
  id: z.string(),
  topicId: z.string(),
  author: z.enum(["user", "bot", "system"]),
  botId: z.string().optional(),
  content: z.string(),
  createdAt: z.string(),
  streaming: z.boolean().optional(),
  kind: z.enum(["text", "clarification", "tool", "dispatch", "mention", "app-tool"]).optional(),
  run: z
    .object({
      status: z.enum(["running", "success", "failed", "cancelled"]),
      engine: z.string().optional(),
      current: z.string().optional(),
      toolCount: z.number().int().nonnegative().optional(),
      tools: z
        .array(
          z.object({
            name: z.string(),
            detail: z.string().optional(),
          }),
        )
        .optional(),
      contextUsed: z.number().int().nonnegative().optional(),
      contextStart: z.number().int().nonnegative().optional(),
      contextWindow: z.number().int().positive().optional(),
      finishedAt: z.string().optional(),
    })
    .optional(),
  dispatch: z
    .object({
      fromName: z.string(),
      toName: z.string(),
      objective: z.string(),
      instruction: z.string().optional(),
      expectedOutput: z.string().optional(),
      project: z.string().optional(),
      reportToName: z.string().optional(),
    })
    .optional(),
  clarification: z
    .object({
      id: z.string(),
      prompt: z.string(),
      options: z.array(z.object({ id: z.string(), label: z.string() })),
      selectedOptionId: z.string().optional(),
      status: z.enum(["pending", "answered"]),
    })
    .optional(),
  appTool: z
    .object({
      token: z.string(),
      tool: z.enum([
        "clarification",
        "spec",
        "approval",
        "visual",
        "acceptance",
      ]),
      status: z.enum(["pending", "done"]),
      title: z.string().optional(),
      summary: z.string().optional(),
      detail: z.string().optional(),
      specPath: z.string().optional(),
      ticketsPath: z.string().optional(),
      documentUrl: z.string().optional(),
      operation: z.string().optional(),
      impact: z.string().optional(),
      rollback: z.string().optional(),
      imageUrl: z.string().optional(),
      channel: z.enum(["team", "pipeline"]).optional(),
      pipelineId: z.string().optional(),
      acceptanceId: z.string().optional(),
      acceptanceVerdict: z.enum(["pass", "fail", "skip"]).optional(),
      questions: z
        .array(
          z.object({
            id: z.string(),
            prompt: z.string(),
            options: z.array(
              z.object({
                id: z.string(),
                label: z.string(),
                recommended: z.boolean().optional(),
              }),
            ),
          }),
        )
        .optional(),
    })
    .optional(),
});

export const PipelineTaskSchema = z.object({
  id: z.string(),
  topicId: z.string(),
  title: z.string(),
  stage: PipelineStageSchema,
  stages: z.array(
    z.object({
      stage: PipelineStageSchema,
      botId: z.string().optional(),
      status: z.enum(["pending", "running", "done", "failed"]),
      detail: z.string().optional(),
      at: z.string().optional(),
    }),
  ),
});

export const UserSchema = z.object({
  id: z.string(),
  username: z.string(),
  email: z.string(),
  createdAt: z.string(),
});

export const StoredUserSchema = UserSchema.extend({
  passwordHash: z.string(),
  salt: z.string(),
});

export const AuthResponseSchema = z.object({
  user: UserSchema,
  token: z.string(),
});
