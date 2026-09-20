import type { EngineKind } from "@ml-aos/shared";
import type { CliAdapter } from "./types.js";
import { MockCliAdapter } from "./mock-adapter.js";
import { ClaudeCliAdapter } from "./claude-adapter.js";
import { CodexCliStubAdapter } from "./codex-adapter.js";

const mock = new MockCliAdapter();
const codex = new CodexCliStubAdapter();
let claude: ClaudeCliAdapter | undefined;

export function resolveAdapter(engine: EngineKind): CliAdapter {
  switch (engine) {
    case "claude":
      // Resolve binary at first use (Windows needs real .exe, not claude.cmd).
      return (claude ??= new ClaudeCliAdapter());
    case "codex":
      return codex;
    case "mock":
    default:
      return mock;
  }
}
