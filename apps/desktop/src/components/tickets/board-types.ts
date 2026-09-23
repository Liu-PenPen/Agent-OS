/** Task board + Gitee issue state types for desktop API. */

export type BoardTaskStatus = "running" | "completed" | "failed";

export type BoardFailureReason =
  | "cli_crash"
  | "user_reject"
  | "timeout"
  | "pipeline_blocked"
  | "unknown";

export interface BoardGiteeRef {
  programId: string;
  issueId: number;
  issueIdent: string;
  url: string;
  issueTypeId?: number;
  lastSyncedStateId?: number;
  lastSyncedStateTitle?: string;
  lastSyncedAt?: string;
}

export interface BoardTask {
  id: string;
  title: string;
  status: BoardTaskStatus;
  source: "gitee" | "pipeline" | "direct";
  gitee?: BoardGiteeRef;
  topicId?: string;
  pipelineId?: string;
  botId?: string;
  stage?: string;
  tokens?: { input?: number; output?: number; total?: number };
  failureReason?: BoardFailureReason;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
}

export interface BoardSummary {
  running: number;
  completed: number;
  failed: number;
  tokensToday: number;
}

export interface TicketIssueState {
  id: number;
  title: string;
}

export interface TicketIssueStateUpdate {
  stateId: number;
  stateTitle: string;
}
