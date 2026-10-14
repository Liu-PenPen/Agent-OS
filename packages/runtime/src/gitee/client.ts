import { comparePriorityThenIdent, priorityRank } from "./priority.js";
import { extractImageUrls } from "./issue-assets.js";
import {
  giteeCredentialsConfigured,
  resolveGiteeCredentials,
} from "./credentials.js";

export interface GiteeEnvConfig {
  token: string;
  enterpriseId: string;
  userId: string;
  apiBase: string;
}

export interface GiteeTodoIssue {
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
}

export interface GiteeIssueDetail extends GiteeTodoIssue {
  description: string;
  authorName: string;
  planStartedAt?: string;
  deadline?: string;
  imageUrls: string[];
  issueTypeId?: number;
}

export interface GiteeIssueStateOption {
  id: number;
  title: string;
}

interface RawPerson {
  name?: string;
  remark?: string;
  username?: string;
}

interface RawIssue {
  id?: number;
  ident?: string;
  title?: string;
  program_id?: number | string;
  html_url?: string;
  description?: string;
  priority_human?: string;
  priority?: string | number;
  plan_started_at?: string;
  deadline?: string;
  created_at?: string;
  author?: RawPerson;
  issue_state?: { title?: string; id?: number };
  issue_type?: { id?: number };
  issue_type_id?: number;
  scrum_sprint?: { id?: number; title?: string } | null;
}

interface PagedIssues {
  data?: RawIssue[];
  total_count?: number;
}

const MCP_USER_AGENT = "mcp-gitee-ent ml-aos Go/windows/amd64/node";

/** @deprecated Prefer resolveGiteeCredentials — kept for call-site compatibility. */
export function readGiteeEnvConfig(): GiteeEnvConfig {
  return resolveGiteeCredentials();
}

export function giteeConfigured(): boolean {
  return giteeCredentialsConfigured();
}

function isTodoState(title: string): boolean {
  const value = title.trim().toLowerCase();
  return value === "todo" || value === "待办" || value.includes("待办");
}

function issueUrl(
  enterpriseId: string,
  programId: string,
  issue: RawIssue,
): string {
  if (issue.html_url?.trim()) return issue.html_url.trim();
  const ident = issue.ident?.trim();
  if (ident) {
    return `https://e.gitee.com/${enterpriseId}/projects/${programId}/issues/${ident}`;
  }
  return `https://e.gitee.com/${enterpriseId}/projects/${programId}`;
}

function readPriority(issue: RawIssue): string {
  const human = issue.priority_human?.trim();
  if (human) return human;
  if (issue.priority != null && String(issue.priority).trim()) {
    return String(issue.priority).trim();
  }
  return "未设置";
}

function personName(person?: RawPerson): string {
  return (
    person?.remark?.trim() ||
    person?.name?.trim() ||
    person?.username?.trim() ||
    "未知"
  );
}

function toSummary(
  config: GiteeEnvConfig,
  issue: RawIssue,
  fallbackProgramId: string,
): GiteeTodoIssue | null {
  if (!issue.id || !issue.ident || !issue.title) return null;
  const programId = String(issue.program_id ?? fallbackProgramId);
  const priority = readPriority(issue);
  return {
    id: issue.id,
    ident: issue.ident,
    title: issue.title,
    stateTitle: issue.issue_state?.title?.trim() || "",
    sprintId: issue.scrum_sprint?.id,
    sprintTitle: issue.scrum_sprint?.title?.trim() || "未规划迭代",
    programId,
    url: issueUrl(config.enterpriseId, programId, issue),
    priority,
    priorityRank: priorityRank(priority),
  };
}

interface RawIssueState {
  id?: number;
  title?: string;
}

interface PagedIssueStates {
  data?: RawIssueState[];
}

function giteeHeaders(config: GiteeEnvConfig): Record<string, string> {
  return {
    Accept: "application/json",
    Authorization: `Bearer ${config.token}`,
    "User-Agent": MCP_USER_AGENT,
    "Content-Type": "application/json",
  };
}

async function giteeRequest(
  config: GiteeEnvConfig,
  method: string,
  path: string,
  options: {
    query?: Record<string, string | number | boolean | undefined>;
    body?: unknown;
  } = {},
): Promise<{ status: number; text: string }> {
  const url = new URL(`${config.apiBase}${path}`);
  for (const [key, value] of Object.entries(options.query ?? {})) {
    if (value === undefined || value === "") continue;
    url.searchParams.set(key, String(value));
  }
  const response = await fetch(url, {
    method,
    headers: giteeHeaders(config),
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  const text = await response.text();
  return { status: response.status, text };
}

function throwGiteeError(status: number, text: string): never {
  throw new Error(`Gitee API ${status}: ${text.slice(0, 240)}`);
}

async function giteeGet<T>(
  config: GiteeEnvConfig,
  path: string,
  query: Record<string, string | number | boolean | undefined> = {},
): Promise<T> {
  const { status, text } = await giteeRequest(config, "GET", path, { query });
  if (status >= 400) throwGiteeError(status, text);
  return JSON.parse(text) as T;
}

function readIssueTypeId(issue: RawIssue): number | undefined {
  return issue.issue_type?.id ?? issue.issue_type_id;
}

function mapIssueStates(payload: PagedIssueStates | RawIssueState[]): GiteeIssueStateOption[] {
  const batch = Array.isArray(payload) ? payload : (payload.data ?? []);
  return batch
    .filter((row): row is RawIssueState & { id: number; title: string } =>
      typeof row.id === "number" && typeof row.title === "string",
    )
    .map((row) => ({ id: row.id, title: row.title }));
}

export async function listIssueTypeStates(
  issueTypeId: number,
): Promise<GiteeIssueStateOption[]> {
  const config = readGiteeEnvConfig();
  const primary = await giteeRequest(
    config,
    "GET",
    `/${config.enterpriseId}/issue_types/${issueTypeId}/states`,
  );
  if (primary.status === 404) {
    const fallback = await giteeRequest(
      config,
      "GET",
      `/${config.enterpriseId}/issue_states`,
      { query: { issue_type_id: issueTypeId } },
    );
    if (fallback.status >= 400) throwGiteeError(fallback.status, fallback.text);
    return mapIssueStates(JSON.parse(fallback.text) as PagedIssueStates);
  }
  if (primary.status >= 400) throwGiteeError(primary.status, primary.text);
  return mapIssueStates(JSON.parse(primary.text) as PagedIssueStates);
}

export async function updateIssueState(input: {
  issueId: number | string;
  issueStateId: number;
}): Promise<{ stateId: number; stateTitle: string }> {
  const config = readGiteeEnvConfig();
  const issueId = String(input.issueId).trim();
  const path = `/${config.enterpriseId}/issues/${issueId}`;
  const body = { issue_state_id: input.issueStateId };

  let result = await giteeRequest(config, "PUT", path, { body });
  if (result.status === 405) {
    result = await giteeRequest(config, "PATCH", path, { body });
  }
  if (result.status >= 400) throwGiteeError(result.status, result.text);

  const raw = JSON.parse(result.text) as RawIssue;
  const stateId = raw.issue_state?.id ?? input.issueStateId;
  const stateTitle = raw.issue_state?.title?.trim() ?? "";
  return { stateId, stateTitle };
}

export interface GiteeProgram {
  id: string;
  name: string;
  ident?: string;
  programId: string;
}

interface RawProgram {
  id?: number | string;
  name?: string;
  title?: string;
  ident?: string;
  identification?: string;
}

interface PagedPrograms {
  data?: RawProgram[];
  total_count?: number;
}

/** List enterprise programs. Merges joined/assigned/created so the picker is complete. */
export async function listEnterprisePrograms(options?: {
  type?: "joined" | "assigned" | "created" | "only_star";
  perPage?: number;
  maxPages?: number;
  status?: string;
}): Promise<GiteeProgram[]> {
  const config = readGiteeEnvConfig();
  const perPage = options?.perPage ?? 50;
  const maxPages = options?.maxPages ?? 20;
  const types = options?.type
    ? [options.type]
    : (["joined", "assigned", "created"] as const);
  const byId = new Map<string, GiteeProgram>();

  for (const type of types) {
    for (let page = 1; page <= maxPages; page += 1) {
      const payload = await giteeGet<PagedPrograms | RawProgram[]>(
        config,
        `/${config.enterpriseId}/programs`,
        {
          type,
          status: options?.status ?? "0,1",
          sort: "accessed_at",
          direction: "desc",
          page,
          per_page: perPage,
        },
      );
      const batch = Array.isArray(payload) ? payload : (payload.data ?? []);
      for (const item of batch) {
        const programId = item.id != null ? String(item.id) : "";
        const name = (item.name ?? item.title ?? "").trim();
        if (!programId || !name) continue;
        if (byId.has(programId)) continue;
        const ident = (item.ident ?? item.identification)?.trim();
        byId.set(programId, {
          id: programId,
          name,
          ident: ident || undefined,
          programId,
        });
      }
      if (batch.length < perPage) break;
    }
  }

  return [...byId.values()].sort((a, b) =>
    a.name.localeCompare(b.name, "zh-CN"),
  );
}

export async function listMyTodoIssues(options: {
  programId: string;
  perPage?: number;
  maxPages?: number;
  /** When true, return all assignee issues (not only todo). */
  includeAllStates?: boolean;
}): Promise<GiteeTodoIssue[]> {
  const config = readGiteeEnvConfig();
  const perPage = options.perPage ?? 50;
  const maxPages = options.maxPages ?? 20;
  const todos: GiteeTodoIssue[] = [];

  for (let page = 1; page <= maxPages; page += 1) {
    const payload = await giteeGet<PagedIssues>(
      config,
      `/${config.enterpriseId}/issues`,
      {
        program_id: options.programId,
        assignee_id: config.userId,
        show_scrum_sprints: true,
        page,
        per_page: perPage,
      },
    );
    const batch = payload.data ?? [];
    for (const issue of batch) {
      const stateTitle = issue.issue_state?.title?.trim() || "";
      if (!options.includeAllStates && !isTodoState(stateTitle)) continue;
      const summary = toSummary(config, issue, options.programId);
      if (summary) todos.push(summary);
    }
    if (batch.length < perPage) break;
  }

  todos.sort((left, right) => {
    const sprint = left.sprintTitle.localeCompare(right.sprintTitle, "zh-CN");
    if (sprint !== 0) return sprint;
    return comparePriorityThenIdent(left, right);
  });
  return todos;
}

/** Fetch a single issue by numeric id (ident alone is not accepted by Gitee Ent API). */
export async function getIssueDetail(
  issueKey: string | number,
): Promise<GiteeIssueDetail> {
  const config = readGiteeEnvConfig();
  const key = String(issueKey).trim();
  if (!/^\d+$/.test(key)) {
    throw new Error(
      `工单详情需使用数字 id（收到: ${key}）。请从列表点击工单卡片。`,
    );
  }
  const raw = await giteeGet<RawIssue>(
    config,
    `/${config.enterpriseId}/issues/${key}`,
  );
  const summary = toSummary(config, raw, String(raw.program_id ?? ""));
  if (!summary) {
    throw new Error(`工单详情无效: ${issueKey}`);
  }
  const description = raw.description?.trim() ?? "";
  return {
    ...summary,
    description,
    authorName: personName(raw.author),
    planStartedAt: raw.plan_started_at || undefined,
    deadline: raw.deadline || undefined,
    imageUrls: extractImageUrls(description),
    issueTypeId: readIssueTypeId(raw),
  };
}

export { extractImageUrls };
