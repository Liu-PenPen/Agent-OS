import { randomUUID } from "node:crypto";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { z } from "zod";
import type { JsonStore } from "../store/json-store.js";
import type { BotRunService } from "./bot-run-service.js";
import type { BotService } from "./bot-service.js";
import type { ChatService } from "./chat-service.js";
import type { WorkspaceService } from "./workspace-service.js";
import {
  getIssueDetail,
  giteeConfigured,
  listIssueTypeStates,
  listMyTodoIssues,
  readGiteeEnvConfig,
  updateIssueState as giteeUpdateIssueState,
  type GiteeIssueDetail,
  type GiteeIssueStateOption,
  type GiteeTodoIssue,
} from "../gitee/client.js";
import { downloadIssueImages } from "../gitee/issue-assets.js";
import {
  GiteeProjectsStore,
  type GiteeProjectConfig,
  type ProjectRuntimeSettings,
} from "../gitee/projects.js";
import { findWorkspaceRoot } from "../load-env.js";
import {
  TaskBoardService,
  boardTaskIdForGitee,
} from "./task-board-service.js";

const DispatchRecordSchema = z.object({
  issueId: z.number(),
  ident: z.string(),
  projectId: z.string(),
  topicId: z.string(),
  cast: z.array(z.string()),
  localPath: z.string(),
  engine: z.enum(["claude", "codex"]),
  at: z.string(),
});

const DispatchFileSchema = z.object({
  byIssueId: z.record(DispatchRecordSchema).default({}),
});

export type TicketDispatchRecord = z.infer<typeof DispatchRecordSchema>;

export type TicketListItem = GiteeTodoIssue & {
  topicId?: string;
  pipelineStage?: string;
};

function pathKey(value: string): string {
  return value.replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();
}

export class TicketService {
  private readonly projects: GiteeProjectsStore;
  private readonly taskBoard: TaskBoardService;

  constructor(
    private readonly dataDir: string,
    private readonly store: JsonStore,
    private readonly workspaceService: WorkspaceService,
    private readonly botService: BotService,
    private readonly chatService: ChatService,
    private readonly botRunService: BotRunService,
    projectsStore?: GiteeProjectsStore,
    taskBoard?: TaskBoardService,
  ) {
    this.projects = projectsStore ?? new GiteeProjectsStore(dataDir);
    this.taskBoard = taskBoard ?? new TaskBoardService(dataDir);
  }

  private dispatchPath(): string {
    return resolve(this.dataDir, "gitee-dispatches.json");
  }

  private async loadDispatches(): Promise<
    Record<string, TicketDispatchRecord>
  > {
    try {
      const raw = await readFile(this.dispatchPath(), "utf8");
      return DispatchFileSchema.parse(JSON.parse(raw)).byIssueId;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return {};
      throw error;
    }
  }

  private async saveDispatches(
    byIssueId: Record<string, TicketDispatchRecord>,
  ): Promise<void> {
    const path = this.dispatchPath();
    await mkdir(dirname(path), { recursive: true });
    await writeFile(
      path,
      `${JSON.stringify({ byIssueId }, null, 2)}\n`,
      "utf8",
    );
  }

  status(): { configured: boolean; projectsPath: string } {
    return {
      configured: giteeConfigured(),
      projectsPath:
        process.env.GITEE_PROJECTS_CONFIG?.trim() ||
        resolve(findWorkspaceRoot(), "config", "gitee-projects.json"),
    };
  }

  listProjects(): Promise<GiteeProjectConfig[]> {
    return this.projects.list();
  }

  updateProject(
    projectId: string,
    patch: ProjectRuntimeSettings,
  ): Promise<GiteeProjectConfig> {
    return this.projects.updateSettings(projectId, patch);
  }

  async listTodos(
    projectId: string,
    options?: { includeAllStates?: boolean },
  ): Promise<TicketListItem[]> {
    const project = await this.projects.get(projectId);
    if (!project) throw new Error(`Gitee 项目不存在: ${projectId}`);
    const issues = await listMyTodoIssues({
      programId: project.programId,
      includeAllStates: options?.includeAllStates,
    });
    const dispatches = await this.loadDispatches();
    const state = await this.store.load();
    return issues.map((issue) => {
      const record = dispatches[String(issue.id)];
      const topic = record
        ? state.topics.find((t) => t.id === record.topicId)
        : undefined;
      return {
        ...issue,
        topicId: record?.topicId,
        pipelineStage: topic?.pipelineStage,
      };
    });
  }

  async getTodoDetail(
    projectId: string,
    issueKey: string,
  ): Promise<GiteeIssueDetail> {
    const project = await this.projects.get(projectId);
    if (!project) throw new Error(`Gitee 项目不存在: ${projectId}`);
    return getIssueDetail(issueKey);
  }

  async dispatchToCeo(input: {
    projectId: string;
    issueId: number;
    workspaceId?: string;
    note?: string;
  }): Promise<{ topicId: string; botId: string }> {
    const project = await this.projects.get(input.projectId);
    if (!project) throw new Error(`Gitee 项目不存在: ${input.projectId}`);
    if (!project.localPath?.trim()) {
      throw new Error("请先在工单项目配置中填写本地工作目录");
    }

    const detail = await getIssueDetail(input.issueId);
    if (!detail) throw new Error(`找不到工单 #${input.issueId}`);

    const workspace = await this.resolveWorkspace(
      project.localPath,
      project.name,
      input.workspaceId,
    );

    const bots = await this.botService.list();
    const ceo = bots.find(
      (b) => b.enabled && b.role.toLowerCase() === "ceo",
    );
    if (!ceo) throw new Error("未找到已启用的 CEO 助理");

    const config = readGiteeEnvConfig();
    const downloads = await downloadIssueImages({
      config,
      localPath: project.localPath,
      ident: detail.ident,
      urls: detail.imageUrls,
    });

    const topic = await this.chatService.createTopic({
      workspaceId: workspace.id,
      title: `${detail.ident} ${detail.title}`.slice(0, 120),
    });

    const castMembers = bots.filter(
      (bot) =>
        bot.enabled &&
        project.cast.some(
          (token) =>
            token === bot.id ||
            token.toLowerCase() === bot.role.toLowerCase(),
        ),
    );
    const castLabel =
      project.cast.length === 0
        ? "全团队（未限制 Cast）"
        : castMembers.length > 0
          ? castMembers
              .map((bot) => `${bot.name}（targetBotId=${bot.id}）`)
              .join("、")
          : project.cast.join("、");
    const castHas = (role: string) =>
      castMembers.some((bot) => bot.role.toLowerCase() === role);

    const descriptionBlock = detail.description.trim()
      ? detail.description.trim()
      : "（无描述）";

    const userNote = input.note?.trim() ?? "";
    const noteBlock = userNote
      ? ["", "—— 用户补充 ——", userNote]
      : [];

    const imageLines =
      downloads.length === 0
        ? ["附图：无"]
        : [
            "附图（本地优先，失败则用 URL）：",
            ...downloads.map((item, i) => {
              if (item.localPath) {
                return `  ${i + 1}. ${item.localPath}`;
              }
              return `  ${i + 1}. [下载失败: ${item.error ?? "unknown"}] ${item.url}`;
            }),
          ];

    const prompt = [
      "用户从 Gitee 待办中选中了一条工单，请你作为 CEO 助理组织后续工作。",
      `项目：${project.name}（${project.ident ?? project.programId}）`,
      `迭代：${detail.sprintTitle}`,
      `工作项：${detail.ident}`,
      `标题：${detail.title}`,
      `链接：${detail.url}`,
      `工作目录：${project.localPath}`,
      `默认引擎：${project.defaultEngine}`,
      `参与 Cast：${castLabel}`,
      "",
      "—— 工单描述 ——",
      descriptionBlock,
      ...noteBlock,
      "",
      ...imageLines,
      "",
      project.cast.length > 0
        ? `约束：后续 dispatch_task 只能派给 Cast 内成员（${castLabel}）；不要派给名单外成员。`
        : "可按需派给 product / developer / tester / reviewer。",
      castHas("developer") && !castHas("product")
        ? "这是已指派的缺陷/工程工单且 Cast 含 developer、不含 product：读完描述后必须立刻调用 dispatch_task，targetBotId=developer（可用 objective/instruction 写清修复点）。禁止长篇分析后让用户手工开工。"
        : "请先阅读描述与附图（及用户补充，若有），确认范围后立刻调用 dispatch_task；新需求优先 product，已明确的修复任务优先 developer。",
      "禁止写「启动流水线」或让用户点不存在的按钮；口头「已交给某某」无效。不要自己写代码。",
    ].join("\n");

    await this.store.transact((state) => {
      state.messages.push({
        id: randomUUID(),
        topicId: topic.id,
        author: "system",
        content: [
          `[gitee] 已接入工单 ${detail.ident}`,
          detail.url,
          `项目目录：${project.localPath}`,
          `引擎：${project.defaultEngine}`,
          `Cast：${castLabel}`,
          detail.description.trim()
            ? `描述摘要：${detail.description.trim().slice(0, 240)}`
            : "描述：（无描述）",
          userNote ? `用户补充：${userNote.slice(0, 240)}` : null,
        ]
          .filter(Boolean)
          .join("\n"),
        createdAt: new Date().toISOString(),
      });
    });

    // Must be "chat" (not "handoff"): handoff marks inCollaboration and skips
    // team-leader-guard, so CEO can dump analysis without dispatch_task.
    // clearSession: avoid resuming a prior analysis session that never dispatched.
    await this.botRunService.start({
      topicId: topic.id,
      botId: ceo.id,
      origin: "chat",
      clearSession: true,
      prompt,
    });

    const dispatches = await this.loadDispatches();
    dispatches[String(detail.id)] = {
      issueId: detail.id,
      ident: detail.ident,
      projectId: project.id,
      topicId: topic.id,
      cast: project.cast,
      localPath: project.localPath,
      engine: project.defaultEngine,
      at: new Date().toISOString(),
    };
    await this.saveDispatches(dispatches);

    await this.taskBoard.upsert({
      id: boardTaskIdForGitee(String(detail.programId), detail.ident),
      title: `${detail.ident} ${detail.title}`.slice(0, 200),
      status: "running",
      source: "gitee",
      gitee: {
        programId: String(detail.programId),
        issueId: detail.id,
        issueIdent: detail.ident,
        url: detail.url,
        issueTypeId: detail.issueTypeId,
      },
      topicId: topic.id,
      botId: ceo.id,
      stage: topic.pipelineStage ?? "idle",
    });

    return { topicId: topic.id, botId: ceo.id };
  }

  async listIssueStates(
    projectId: string,
    issueId: number,
  ): Promise<GiteeIssueStateOption[]> {
    const project = await this.projects.get(projectId);
    if (!project) throw new Error(`Gitee 项目不存在: ${projectId}`);
    const detail = await getIssueDetail(issueId);
    if (detail.issueTypeId == null) {
      throw new Error("工单缺少 issue_type，无法列状态");
    }
    return listIssueTypeStates(detail.issueTypeId);
  }

  async updateIssueState(input: {
    projectId: string;
    issueId: number;
    issueStateId: number;
  }): Promise<{ stateTitle: string; stateId: number }> {
    const project = await this.projects.get(input.projectId);
    if (!project) throw new Error(`Gitee 项目不存在: ${input.projectId}`);

    const detail = await getIssueDetail(input.issueId);
    if (String(detail.programId) !== String(project.programId)) {
      throw new Error(
        `工单不属于当前项目：issue programId=${detail.programId}, project programId=${project.programId}`,
      );
    }

    const result = await giteeUpdateIssueState({
      issueId: input.issueId,
      issueStateId: input.issueStateId,
    });

    let stateTitle = result.stateTitle.trim();
    if (!stateTitle) {
      try {
        const states = await this.listIssueStates(
          input.projectId,
          input.issueId,
        );
        stateTitle =
          states.find((s) => s.id === result.stateId)?.title ??
          states.find((s) => s.id === input.issueStateId)?.title ??
          "";
      } catch {
        // keep empty title if lookup fails
      }
    }

    const synced = { stateId: result.stateId, stateTitle };
    const boardRow = await this.taskBoard.findByGiteeIssueId(input.issueId);
    if (boardRow) {
      await this.taskBoard.recordGiteeSync(boardRow.id, {
        id: synced.stateId,
        title: synced.stateTitle,
      });
    }

    return synced;
  }

  private async resolveWorkspace(
    localPath: string,
    projectName: string,
    preferredId?: string,
  ) {
    const workspaces = await this.workspaceService.list();
    if (preferredId) {
      const preferred = workspaces.find((w) => w.id === preferredId);
      if (preferred && pathKey(preferred.localPath) === pathKey(localPath)) {
        return preferred;
      }
    }
    const matched = workspaces.find(
      (w) => pathKey(w.localPath) === pathKey(localPath),
    );
    if (matched) return matched;
    return this.workspaceService.create({
      name: projectName,
      localPath,
    });
  }
}
