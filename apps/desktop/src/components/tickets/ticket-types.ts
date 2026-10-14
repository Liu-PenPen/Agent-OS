/** UI types for the ticket inbox (API wiring later). */

export type TicketEngine = "claude" | "codex";

export type TicketRole =
  | "ceo"
  | "product"
  | "developer"
  | "tester"
  | "reviewer";

export type TicketPipelineStage =
  | "idle"
  | "developing"
  | "testing"
  | "reviewing"
  | "completed"
  | "blocked";

export interface TicketProject {
  id: string;
  name: string;
  programId: string;
  ident: string;
  localPath?: string;
  defaultEngine: TicketEngine;
  /** Bot id，或旧配置里的角色名。空数组表示不限制。 */
  cast: string[];
  testBaseUrl?: string;
  testStartCommand?: string;
}

export interface TicketItem {
  id: number;
  ident: string;
  title: string;
  stateTitle: string;
  sprintId?: number;
  sprintTitle: string;
  programId: string;
  url: string;
  priority: string;
  priorityRank?: number;
  /** Set after hand-off (UI mock) */
  topicId?: string;
  pipelineStage?: TicketPipelineStage;
}

export interface TicketDetail extends TicketItem {
  description: string;
  authorName: string;
  planStartedAt?: string;
  deadline?: string;
  imageUrls: string[];
}

export interface TicketSprintGroup {
  sprintTitle: string;
  tickets: TicketItem[];
}
