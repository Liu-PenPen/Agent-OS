import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import {
  AppSettingsSchema,
  BotConfigSchema,
  WorkspaceSchema,
  TopicSchema,
  ChatMessageSchema,
  PipelineTaskSchema,
} from "@ml-aos/shared";
import type { AppState } from "../app-state.js";

const FILES = {
  settings: "settings.json",
  bots: "bots.json",
  workspaces: "workspaces.json",
  topics: "topics.json",
  messages: "messages.json",
  pipelines: "pipelines.json",
} as const;

function isEnoent(error: unknown): boolean {
  return (
    error instanceof Error &&
    "code" in error &&
    (error as NodeJS.ErrnoException).code === "ENOENT"
  );
}

export class JsonStore {
  constructor(private readonly dataDir: string) {}

  async save(state: AppState): Promise<void> {
    await mkdir(this.dataDir, { recursive: true });
    await writeFile(
      join(this.dataDir, FILES.settings),
      JSON.stringify(state.settings, null, 2),
    );
    await writeFile(
      join(this.dataDir, FILES.bots),
      JSON.stringify(state.bots, null, 2),
    );
    await writeFile(
      join(this.dataDir, FILES.workspaces),
      JSON.stringify(state.workspaces, null, 2),
    );
    await writeFile(
      join(this.dataDir, FILES.topics),
      JSON.stringify(state.topics, null, 2),
    );
    await writeFile(
      join(this.dataDir, FILES.messages),
      JSON.stringify(state.messages, null, 2),
    );
    await writeFile(
      join(this.dataDir, FILES.pipelines),
      JSON.stringify(state.pipelines, null, 2),
    );
  }

  async load(): Promise<AppState> {
    return {
      settings: await this.loadSettings(),
      bots: await this.loadArray(FILES.bots, BotConfigSchema),
      workspaces: await this.loadArray(FILES.workspaces, WorkspaceSchema),
      topics: await this.loadArray(FILES.topics, TopicSchema),
      messages: await this.loadArray(FILES.messages, ChatMessageSchema),
      pipelines: await this.loadArray(FILES.pipelines, PipelineTaskSchema),
    };
  }

  private async loadSettings() {
    try {
      const raw = await readFile(
        join(this.dataDir, FILES.settings),
        "utf-8",
      );
      return AppSettingsSchema.parse(JSON.parse(raw));
    } catch (error) {
      if (isEnoent(error)) {
        return AppSettingsSchema.parse({
          theme: "dark",
          defaultEngine: "mock",
          dataDir: this.dataDir,
          notifications: true,
        });
      }
      throw error;
    }
  }

  private async loadArray<T>(
    file: string,
    schema: z.ZodType<T>,
  ): Promise<T[]> {
    try {
      const raw = await readFile(join(this.dataDir, file), "utf-8");
      return z.array(schema).parse(JSON.parse(raw));
    } catch (error) {
      if (isEnoent(error)) {
        return [];
      }
      throw error;
    }
  }
}
