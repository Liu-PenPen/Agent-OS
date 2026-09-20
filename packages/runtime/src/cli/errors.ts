/** Thrown when a selected CLI engine binary is missing or unusable. */
export class CliEngineUnavailableError extends Error {
  readonly status = 503 as const;

  constructor(message: string) {
    super(message);
    this.name = "CliEngineUnavailableError";
  }
}

export const CLAUDE_MISSING_MESSAGE =
  "Claude CLI not found. Install Claude Code, ensure `claude` is on PATH, and login.";

export const CODEX_STUB_MESSAGE =
  "Codex CLI adapter is not implemented yet. Switch the bot engine to mock or claude.";
