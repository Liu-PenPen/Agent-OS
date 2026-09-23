import type { EngineKind } from "@ml-aos/shared";
import type { CliAdapter } from "./types.js";
import { ClaudeCliAdapter } from "./claude-adapter.js";
import { CodexCliAdapter } from "./codex-adapter.js";

let claude: ClaudeCliAdapter | undefined;
let codex: CodexCliAdapter | undefined;

export function resolveAdapter(engine: EngineKind): CliAdapter {
  switch (engine) {
    case "codex":
      return (codex ??= new CodexCliAdapter());
    case "claude":
    default:
      return (claude ??= new ClaudeCliAdapter());
  }
}
