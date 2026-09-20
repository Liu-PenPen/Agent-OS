import type {
  AppSettings,
  BotConfig,
  ChatMessage,
  EngineKind,
  PipelineTask,
  ThemeMode,
  Topic,
  Workspace,
} from "@ml-aos/shared";

const BASE_URL = "http://127.0.0.1:17890";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
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
};

export type UpdateBotInput = Partial<CreateBotInput>;

export const api = {
  baseUrl: BASE_URL,

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

  advancePipeline(id: string): Promise<PipelineTask> {
    return request<PipelineTask>(`/api/pipelines/${id}/advance`, {
      method: "POST",
      body: JSON.stringify({}),
    });
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

  dispatchTopic(
    topicId: string,
    input: { title: string; assigneeBotIds?: string[] },
  ): Promise<PipelineTask> {
    return request<PipelineTask>(`/api/topics/${topicId}/dispatch`, {
      method: "POST",
      body: JSON.stringify(input),
    });
  },
};
