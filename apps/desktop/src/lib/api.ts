import type {
  AppSettings,
  AuthResponse,
  BotConfig,
  ChatMessage,
  EngineKind,
  PipelineTask,
  ThemeMode,
  Topic,
  User,
  Workspace,
} from "@ml-aos/shared";
import type {
  BoardSummary,
  BoardTask,
  BoardTaskStatus,
  TicketIssueState,
  TicketIssueStateUpdate,
} from "../components/tickets/board-types";

const BASE_URL = "http://127.0.0.1:17890";

export type TicketPullPriority = "severe" | "major" | "none";

export type TicketPullTask = {
  id: string;
  projectId: string;
  everyHours: number;
  priority: TicketPullPriority;
  status: "draft" | "active" | "paused";
  nextRunAt?: string;
  lastRunAt?: string;
  lastResult?: string;
  createdAt: string;
  updatedAt: string;
};

export type AgentScheduleTask = {
  id: string;
  prompt: string;
  botId: string;
  workspaceId: string;
  everyHours: number;
  status: "draft" | "active" | "paused";
  topicId?: string;
  nextRunAt?: string;
  lastRunAt?: string;
  lastResult?: string;
  createdAt: string;
  updatedAt: string;
};

let authToken: string | null =
  typeof window !== "undefined" ? localStorage.getItem("ml_aos_token") : null;

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
    ...((init?.headers as Record<string, string>) ?? {}),
  };
  const res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers,
  });
  if (!res.ok) {
    const text = await res.text();
    let message = text || `HTTP ${res.status}`;
    try {
      const body = JSON.parse(text) as { error?: unknown };
      if (typeof body.error === "string" && body.error.trim()) {
        message = body.error;
      }
    } catch {
      // keep raw text when body is not JSON
    }
    throw new Error(message);
  }
  if (res.status === 204) {
    return undefined as T;
  }
  return (await res.json()) as T;
}

export type CreateWorkspaceInput = {
  name: string;
  localPath: string;
  gitUrl?: string;
};

export type UpdateWorkspaceInput = Partial<CreateWorkspaceInput>;

export type CreateBotInput = {
  name: string;
  role: string;
  defaultEngine: EngineKind;
  instructions: string;
  enabled: boolean;
  skills?: string[];
};

export type UpdateBotInput = Partial<CreateBotInput>;

export type GiteeIntegrationSettings = {
  configured: boolean;
  tokenMasked: string | null;
  tokenSet: boolean;
  enterpriseId: string;
  userId: string;
  apiBase: string;
  sources: {
    token: "env" | "store" | "none";
    enterpriseId: "env" | "store" | "none";
    userId: "env" | "store" | "none";
    apiBase: "env" | "store" | "default";
  };
  envOverridesActive: boolean;
  projectsConfigPath: string;
  projectsConfigViaEnv: boolean;
  allowlistCount: number;
};

export type UpdateGiteeIntegrationInput = {
  token?: string;
  enterpriseId?: string;
  userId?: string;
  apiBase?: string;
  clearToken?: boolean;
};

export type GiteeConnectionTestResult = {
  ok: boolean;
  message: string;
  programCount?: number;
};

export const api = {
  baseUrl: BASE_URL,

  setToken(token: string | null) {
    authToken = token;
    if (typeof window !== "undefined") {
      if (token) {
        localStorage.setItem("ml_aos_token", token);
      } else {
        localStorage.removeItem("ml_aos_token");
      }
    }
  },

  getToken(): string | null {
    return authToken;
  },

  register(input: {
    username: string;
    email: string;
    password: string;
  }): Promise<AuthResponse> {
    return request<AuthResponse>("/api/auth/register", {
      method: "POST",
      body: JSON.stringify(input),
    });
  },

  login(input: {
    identifier: string;
    password: string;
  }): Promise<AuthResponse> {
    return request<AuthResponse>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify(input),
    });
  },

  getMe(): Promise<User> {
    return request<User>("/api/auth/me");
  },

  getSettings(): Promise<AppSettings> {
    return request<AppSettings>("/api/settings");
  },

  patchSettings(patch: Partial<AppSettings>): Promise<AppSettings> {
    return request<AppSettings>("/api/settings", {
      method: "PATCH",
      body: JSON.stringify(patch),
    });
  },

  setTheme(theme: ThemeMode): Promise<AppSettings> {
    return this.patchSettings({ theme });
  },

  getGiteeIntegration(): Promise<GiteeIntegrationSettings> {
    return request<GiteeIntegrationSettings>("/api/integrations/gitee");
  },

  patchGiteeIntegration(
    patch: UpdateGiteeIntegrationInput,
  ): Promise<GiteeIntegrationSettings> {
    return request<GiteeIntegrationSettings>("/api/integrations/gitee", {
      method: "PATCH",
      body: JSON.stringify(patch),
    });
  },

  testGiteeConnection(): Promise<GiteeConnectionTestResult> {
    return request<GiteeConnectionTestResult>("/api/integrations/gitee/test", {
      method: "POST",
      body: "{}",
    });
  },

  listWorkspaces(): Promise<Workspace[]> {
    return request<Workspace[]>("/api/workspaces");
  },

  createWorkspace(input: CreateWorkspaceInput): Promise<Workspace> {
    return request<Workspace>("/api/workspaces", {
      method: "POST",
      body: JSON.stringify(input),
    });
  },

  updateWorkspace(id: string, patch: UpdateWorkspaceInput): Promise<Workspace> {
    return request<Workspace>(`/api/workspaces/${id}`, {
      method: "PATCH",
      body: JSON.stringify(patch),
    });
  },

  deleteWorkspace(id: string): Promise<void> {
    return request<void>(`/api/workspaces/${id}`, { method: "DELETE" });
  },

  cloneWorkspace(id: string): Promise<Workspace> {
    return request<Workspace>(`/api/workspaces/${id}/clone`, {
      method: "POST",
      body: JSON.stringify({}),
    });
  },

  listBots(): Promise<BotConfig[]> {
    return request<BotConfig[]>("/api/bots");
  },

  createBot(input: CreateBotInput): Promise<BotConfig> {
    return request<BotConfig>("/api/bots", {
      method: "POST",
      body: JSON.stringify(input),
    });
  },

  updateBot(id: string, patch: UpdateBotInput): Promise<BotConfig> {
    return request<BotConfig>(`/api/bots/${id}`, {
      method: "PATCH",
      body: JSON.stringify(patch),
    });
  },

  deleteBot(id: string): Promise<void> {
    return request<void>(`/api/bots/${id}`, { method: "DELETE" });
  },

  seedBotTeam(): Promise<BotConfig[]> {
    return request<BotConfig[]>("/api/bots/seed-team", { method: "POST" });
  },

  listClarifications(
    status?: "pending" | "answered",
  ): Promise<ChatMessage[]> {
    const q = status ? `?status=${status}` : "";
    return request<ChatMessage[]>(`/api/clarifications${q}`);
  },

  answerClarification(
    id: string,
    optionId: string,
  ): Promise<ChatMessage> {
    return request<ChatMessage>(`/api/clarifications/${id}/answer`, {
      method: "POST",
      body: JSON.stringify({ optionId }),
    });
  },

  getPipeline(id: string): Promise<PipelineTask> {
    return request<PipelineTask>(`/api/pipelines/${id}`);
  },

  listTopics(workspaceId?: string): Promise<Topic[]> {
    const q = workspaceId
      ? `?workspaceId=${encodeURIComponent(workspaceId)}`
      : "";
    return request<Topic[]>(`/api/topics${q}`);
  },

  createTopic(input: { workspaceId: string; title?: string }): Promise<Topic> {
    return request<Topic>("/api/topics", {
      method: "POST",
      body: JSON.stringify(input),
    });
  },

  deleteTopic(topicId: string): Promise<void> {
    return request<void>(`/api/topics/${topicId}`, { method: "DELETE" });
  },

  listMessages(topicId: string): Promise<ChatMessage[]> {
    return request<ChatMessage[]>(`/api/topics/${topicId}/messages`);
  },

  sendMessage(
    topicId: string,
    input: { content: string; mentionBotId?: string },
  ): Promise<ChatMessage[]> {
    return request<ChatMessage[]>(`/api/topics/${topicId}/messages`, {
      method: "POST",
      body: JSON.stringify(input),
    });
  },

  abortTopic(topicId: string): Promise<{ ok: true; aborted: boolean }> {
    return request<{ ok: true; aborted: boolean }>(
      `/api/topics/${topicId}/abort`,
      { method: "POST", body: JSON.stringify({}) },
    );
  },

  answerControl(
    topicId: string,
    body: {
      token: string;
      action: "clarification" | "spec" | "approval" | "visual";
      answer?: string;
      decision?: "approved" | "rejected" | "false_positive" | "confirmed";
    },
  ): Promise<{ ok: true }> {
    return request<{ ok: true }>(`/api/topics/${topicId}/controls`, {
      method: "POST",
      body: JSON.stringify(body),
    });
  },

  listSchedules(): Promise<
    Array<{
      id: string;
      targetBotId: string;
      prompt: string;
      status: string;
      nextRunAt?: string;
      lastRunAt?: string;
    }>
  > {
    return request("/api/schedules");
  },

  manageSchedule(requestBody: Record<string, unknown>): Promise<{ notice: string }> {
    return request("/api/schedules/manage", {
      method: "POST",
      body: JSON.stringify({ request: requestBody }),
    });
  },

  listTicketPulls(): Promise<TicketPullTask[]> {
    return request("/api/ticket-pulls");
  },

  createTicketPull(body: {
    projectId: string;
    everyHours: number;
    priority: TicketPullPriority;
  }): Promise<TicketPullTask> {
    return request("/api/ticket-pulls", {
      method: "POST",
      body: JSON.stringify(body),
    });
  },

  ticketPullAction(
    id: string,
    action: "start" | "pause" | "resume" | "run" | "remove",
  ): Promise<{ ok: true }> {
    return request(
      `/api/ticket-pulls/${encodeURIComponent(id)}/${action}`,
      { method: "POST", body: "{}" },
    );
  },

  listAgentSchedules(): Promise<AgentScheduleTask[]> {
    return request("/api/agent-schedules");
  },

  createAgentSchedule(body: {
    prompt: string;
    botId: string;
    workspaceId: string;
    everyHours: number;
  }): Promise<AgentScheduleTask> {
    return request("/api/agent-schedules", {
      method: "POST",
      body: JSON.stringify(body),
    });
  },

  agentScheduleAction(
    id: string,
    action: "start" | "pause" | "resume" | "run" | "remove",
  ): Promise<{ ok: true }> {
    return request(
      `/api/agent-schedules/${encodeURIComponent(id)}/${action}`,
      { method: "POST", body: "{}" },
    );
  },

  ticketsStatus(): Promise<{ configured: boolean; projectsPath: string }> {
    return request("/api/tickets/status");
  },

  listTicketProjects(): Promise<
    Array<{
      id: string;
      name: string;
      programId: string;
      ident?: string;
      localPath?: string;
      defaultEngine: "claude" | "codex";
      cast: string[];
      testBaseUrl?: string;
      testStartCommand?: string;
    }>
  > {
    return request("/api/tickets/projects");
  },

  updateTicketProject(
    id: string,
    patch: {
      localPath?: string;
      defaultEngine?: "claude" | "codex";
      cast?: string[];
      testBaseUrl?: string;
      testStartCommand?: string;
    },
  ): Promise<{
    id: string;
    name: string;
    programId: string;
    ident?: string;
    localPath?: string;
    defaultEngine: "claude" | "codex";
    cast: string[];
    testBaseUrl?: string;
    testStartCommand?: string;
  }> {
    return request(`/api/tickets/projects/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify(patch),
    });
  },

  listTicketTodos(
    projectId: string,
    options?: { all?: boolean },
  ): Promise<
    Array<{
      id: number;
      ident: string;
      title: string;
      stateTitle: string;
      sprintId?: number;
      sprintTitle: string;
      programId: string;
      url: string;
      priority: string;
      priorityRank: number;
      topicId?: string;
      pipelineStage?: string;
    }>
  > {
    const q = options?.all ? "?all=1" : "";
    return request(
      `/api/tickets/projects/${encodeURIComponent(projectId)}/todos${q}`,
    );
  },

  getTicketDetail(
    projectId: string,
    issueKey: string | number,
  ): Promise<{
    id: number;
    ident: string;
    title: string;
    stateTitle: string;
    sprintId?: number;
    sprintTitle: string;
    programId: string;
    url: string;
    priority: string;
    priorityRank: number;
    description: string;
    authorName: string;
    planStartedAt?: string;
    deadline?: string;
    imageUrls: string[];
    topicId?: string;
    pipelineStage?: string;
  }> {
    return request(
      `/api/tickets/projects/${encodeURIComponent(projectId)}/issues/${encodeURIComponent(String(issueKey))}`,
    );
  },

  dispatchTicket(input: {
    projectId: string;
    issueId: number;
    workspaceId?: string;
    note?: string;
  }): Promise<{ topicId: string; botId: string }> {
    return request("/api/tickets/dispatch", {
      method: "POST",
      body: JSON.stringify(input),
    });
  },

  listTicketIssueStates(
    projectId: string,
    issueKey: string | number,
  ): Promise<TicketIssueState[]> {
    return request(
      `/api/tickets/projects/${encodeURIComponent(projectId)}/issues/${encodeURIComponent(String(issueKey))}/states`,
    );
  },

  updateTicketIssueState(
    projectId: string,
    issueKey: string | number,
    issueStateId: number,
  ): Promise<TicketIssueStateUpdate> {
    return request(
      `/api/tickets/projects/${encodeURIComponent(projectId)}/issues/${encodeURIComponent(String(issueKey))}/state`,
      {
        method: "POST",
        body: JSON.stringify({ issueStateId }),
      },
    );
  },

  boardTasks(status?: BoardTaskStatus): Promise<BoardTask[]> {
    const q = status ? `?status=${status}` : "";
    return request<BoardTask[]>(`/api/board/tasks${q}`);
  },

  boardSummary(): Promise<BoardSummary> {
    return request<BoardSummary>("/api/board/summary");
  },

  listAcceptance(topicId: string): Promise<
    Array<{
      id: string;
      topicId: string;
      verdict: "pass" | "fail" | "skip";
      summary: string;
      at: string;
      source: string;
      checks: Array<{
        id: string;
        title: string;
        status: "pass" | "fail" | "skip";
        detail?: string;
      }>;
      baseURL?: string;
      skipReason?: string;
    }>
  > {
    return request(`/api/topics/${encodeURIComponent(topicId)}/acceptance`);
  },

  latestAcceptance(topicId: string): Promise<{
    id: string;
    topicId: string;
    verdict: "pass" | "fail" | "skip";
    summary: string;
    at: string;
    source: string;
    checks: Array<{
      id: string;
      title: string;
      status: "pass" | "fail" | "skip";
      detail?: string;
    }>;
    baseURL?: string;
    skipReason?: string;
  } | null> {
    return request(
      `/api/topics/${encodeURIComponent(topicId)}/acceptance/latest`,
    );
  },

  runAcceptanceSuite(input: {
    topicId: string;
    botId?: string;
    baseURL?: string;
  }): Promise<unknown> {
    return request("/api/acceptance/run", {
      method: "POST",
      body: JSON.stringify(input),
    });
  },
};
