/** Thrown when a selected CLI engine binary is missing or unusable. */
export class CliEngineUnavailableError extends Error {
  readonly status = 503 as const;

  constructor(message: string) {
    super(message);
    this.name = "CliEngineUnavailableError";
  }
}

export const CLAUDE_MISSING_MESSAGE =
  "未找到 Claude CLI。请安装 Claude Code，确保 `claude` 在 PATH 中，并完成登录；或在「智能体」设置中将引擎改为 Codex。";

export const CODEX_MISSING_MESSAGE =
  "未找到 Codex CLI。请安装并登录 OpenAI Codex，确保 `codex` 在 PATH 中；或在「智能体」设置中将引擎改为 Claude。";
