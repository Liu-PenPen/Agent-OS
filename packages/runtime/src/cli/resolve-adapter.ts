import type { EngineKind } from "@ml-aos/shared";
import type { CliAdapter } from "./types.js";
import { MockCliAdapter } from "./mock-adapter.js";
import { ClaudeCliAdapter } from "./claude-adapter.js";
import { CodexCliStubAdapter } from "./codex-adapter.js";

const mock = new MockCliAdapter();
const claude = new ClaudeCliAdapter();
const codex = new CodexCliStubAdapter();

export function resolveAdapter(engine: EngineKind): CliAdapter {
  switch (engine) {
    case "claude":
      return claude;
    case "codex":
      return codex;
    case "mock":
    default:
      return mock;
  }
}
