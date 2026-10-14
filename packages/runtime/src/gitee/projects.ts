import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { z } from "zod";
import { findWorkspaceRoot } from "../load-env.js";
import { listEnterprisePrograms } from "./client.js";

const TicketRoleSchema = z.enum([
  "ceo",
  "product",
  "developer",
  "tester",
  "reviewer",
]);

const GiteeProjectBaseSchema = z.object({
  id: z.string().trim().min(1).max(64),
  name: z.string().trim().min(1).max(120),
  ident: z.string().trim().min(1).max(64).optional(),
  programId: z
    .union([z.string(), z.number()])
    .transform((value) => String(value)),
});

const GiteeProjectsFileSchema = z.object({
  projects: z.array(GiteeProjectBaseSchema).default([]),
});

const ProjectRuntimeSettingsSchema = z.object({
  localPath: z.string().trim().min(1).optional(),
  defaultEngine: z.enum(["claude", "codex"]).optional(),
  cast: z.array(z.string().trim().min(1).max(80)).optional(),
  testBaseUrl: z.string().trim().min(1).max(300).optional(),
  testStartCommand: z.string().trim().min(1).max(500).optional(),
});

const SettingsFileSchema = z.object({
  projects: z.record(ProjectRuntimeSettingsSchema).default({}),
});

export type TicketRole = z.infer<typeof TicketRoleSchema>;
export type GiteeProjectBase = z.infer<typeof GiteeProjectBaseSchema>;
export type ProjectRuntimeSettings = z.infer<typeof ProjectRuntimeSettingsSchema>;

export type GiteeProjectConfig = GiteeProjectBase & {
  localPath?: string;
  defaultEngine: "claude" | "codex";
  /** Bot id，或旧数据里的角色名（ceo / product / developer / tester / reviewer）。 */
  cast: string[];
  testBaseUrl?: string;
  testStartCommand?: string;
  /** true when row came from Gitee API rather than local JSON only */
  fromRemote?: boolean;
};

function defaultConfigPath(dataDir: string): string {
  return (
    process.env.ML_AOS_GITEE_PROJECTS_CONFIG?.trim() ||
    process.env.GITEE_PROJECTS_CONFIG?.trim() ||
    resolve(dataDir, "gitee-projects.json")
  );
}

export class GiteeProjectsStore {
  constructor(
    private readonly dataDir: string,
    private readonly configPath = defaultConfigPath(dataDir),
  ) {}

  /** Absolute path of the local project allowlist JSON. */
  allowlistPath(): string {
    return this.configPath;
  }

  private settingsPath(): string {
    return resolve(this.dataDir, "gitee-project-settings.json");
  }

  /** Optional local allowlist / aliases. Missing file is OK. */
  async loadLocalAllowlist(): Promise<GiteeProjectBase[]> {
    const candidates = [this.configPath];
    // Soft legacy: repo config/gitee-projects.json (do not commit real lists).
    if (!process.env.GITEE_PROJECTS_CONFIG?.trim() && !process.env.ML_AOS_GITEE_PROJECTS_CONFIG?.trim()) {
      candidates.push(
        resolve(findWorkspaceRoot(), "config", "gitee-projects.json"),
      );
    }
    for (const path of candidates) {
      try {
        const raw = await readFile(path, "utf8");
        const parsed = GiteeProjectsFileSchema.parse(JSON.parse(raw));
        return parsed.projects;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") continue;
        throw error;
      }
    }
    return [];
  }

  private async loadSettings(): Promise<
    Record<string, ProjectRuntimeSettings>
  > {
    try {
      const raw = await readFile(this.settingsPath(), "utf8");
      return SettingsFileSchema.parse(JSON.parse(raw)).projects;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return {};
      throw error;
    }
  }

  private async saveSettings(
    projects: Record<string, ProjectRuntimeSettings>,
  ): Promise<void> {
    const path = this.settingsPath();
    await mkdir(dirname(path), { recursive: true });
    await writeFile(
      path,
      `${JSON.stringify({ projects }, null, 2)}\n`,
      "utf8",
    );
  }

  private mergeOverlay(
    project: GiteeProjectBase,
    settings: Record<string, ProjectRuntimeSettings>,
    fromRemote: boolean,
  ): GiteeProjectConfig {
    const overlay = settings[project.id] ?? settings[project.programId] ?? {};
    return {
      ...project,
      localPath: overlay.localPath,
      defaultEngine: overlay.defaultEngine ?? "claude",
      cast: overlay.cast ?? [],
      testBaseUrl: overlay.testBaseUrl,
      testStartCommand: overlay.testStartCommand,
      fromRemote,
    };
  }

  /**
   * Prefer live Gitee programs; merge localPath/engine/cast from data/.
   * If `gitee-projects.json` exists and non-empty, treat it as allowlist filter.
   */
  async list(): Promise<GiteeProjectConfig[]> {
    const settings = await this.loadSettings();
    const allowlist = await this.loadLocalAllowlist();
    const allowIds =
      allowlist.length > 0
        ? new Set(
            allowlist.flatMap((p) => [p.id, p.programId].filter(Boolean)),
          )
        : null;

    let remote: GiteeProjectBase[] = [];
    let remoteError: string | undefined;
    try {
      remote = (await listEnterprisePrograms()).map((p) => ({
        id: p.id,
        name: p.name,
        ident: p.ident,
        programId: p.programId,
      }));
    } catch (error) {
      remoteError = error instanceof Error ? error.message : String(error);
    }

    if (remote.length > 0) {
      const filtered = allowIds
        ? remote.filter(
            (p) => allowIds.has(p.id) || allowIds.has(p.programId),
          )
        : remote;
      if (filtered.length > 0) {
        return filtered.map((p) => this.mergeOverlay(p, settings, true));
      }
    }

    if (allowlist.length > 0) {
      return allowlist.map((p) => this.mergeOverlay(p, settings, false));
    }

    if (remoteError) {
      throw new Error(
        `无法从 Gitee 拉取项目列表：${remoteError}。也可提供 config/gitee-projects.json 作为离线兜底。`,
      );
    }
    return [];
  }

  async get(projectId: string): Promise<GiteeProjectConfig | undefined> {
    const list = await this.list();
    return list.find(
      (p) => p.id === projectId || p.programId === projectId,
    );
  }

  async updateSettings(
    projectId: string,
    patch: ProjectRuntimeSettings,
  ): Promise<GiteeProjectConfig> {
    const current = await this.get(projectId);
    if (!current) {
      throw new Error(`Gitee 项目不存在: ${projectId}`);
    }

    const settings = await this.loadSettings();
    const key = current.id;
    const prev = settings[key] ?? settings[current.programId] ?? {};
    const next: ProjectRuntimeSettings = {
      localPath:
        patch.localPath !== undefined
          ? patch.localPath.trim() || undefined
          : prev.localPath,
      defaultEngine: patch.defaultEngine ?? prev.defaultEngine,
      cast: patch.cast ?? prev.cast,
      testBaseUrl:
        patch.testBaseUrl !== undefined
          ? patch.testBaseUrl.trim() || undefined
          : prev.testBaseUrl,
      testStartCommand:
        patch.testStartCommand !== undefined
          ? patch.testStartCommand.trim() || undefined
          : prev.testStartCommand,
    };
    settings[key] = next;
    await this.saveSettings(settings);
    const merged = await this.get(key);
    if (!merged) throw new Error(`Gitee 项目不存在: ${projectId}`);
    return merged;
  }
}
