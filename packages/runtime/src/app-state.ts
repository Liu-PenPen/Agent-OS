import type {
  AppSettings,
  BotConfig,
  Workspace,
  Topic,
  ChatMessage,
  PipelineTask,
  StoredUser,
} from "@ml-aos/shared";

export interface AppState {
  settings: AppSettings;
  bots: BotConfig[];
  workspaces: Workspace[];
  topics: Topic[];
  messages: ChatMessage[];
  pipelines: PipelineTask[];
  users?: StoredUser[];
}
