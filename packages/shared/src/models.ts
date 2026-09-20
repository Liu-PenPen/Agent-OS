import { z } from "zod";

export type ThemeMode = "dark" | "light" | "system";
export type EngineKind = "claude" | "codex" | "mock";
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

export interface BotConfig {
  id: string;
  name: string;
  role: string;
  defaultEngine: EngineKind;
  instructions: string;
  enabled: boolean;
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
  cliSessionId?: string;
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
  kind?: "text" | "clarification" | "tool";
  clarification?: {
    id: string;
    prompt: string;
    options: { id: string; label: string }[];
    selectedOptionId?: string;
    status: "pending" | "answered";
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

const ThemeModeSchema = z.enum(["dark", "light", "system"]);
const EngineKindSchema = z.enum(["claude", "codex", "mock"]);
const PipelineStageSchema = z.enum([
  "idle",
  "developing",
  "testing",
  "reviewing",
  "completed",
  "blocked",
]);

export const AppSettingsSchema = z.object({
  theme: ThemeModeSchema.default("dark"),
  defaultEngine: EngineKindSchema,
  dataDir: z.string(),
  notifications: z.boolean(),
});

export const BotConfigSchema = z.object({
  id: z.string(),
  name: z.string(),
  role: z.string(),
  defaultEngine: EngineKindSchema,
  instructions: z.string(),
  enabled: z.boolean(),
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
  kind: z.enum(["text", "clarification", "tool"]).optional(),
  clarification: z
    .object({
      id: z.string(),
      prompt: z.string(),
      options: z.array(z.object({ id: z.string(), label: z.string() })),
      selectedOptionId: z.string().optional(),
      status: z.enum(["pending", "answered"]),
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
