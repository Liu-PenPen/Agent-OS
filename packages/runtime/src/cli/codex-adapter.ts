import type { CliAdapter, CliEvent, CliRunInput } from "./types.js";
import { CODEX_STUB_MESSAGE } from "./errors.js";

/** Placeholder until a real Codex CLI adapter is wired. */
export class CodexCliStubAdapter implements CliAdapter {
  async *run(_input: CliRunInput): AsyncIterable<CliEvent> {
    yield { type: "error", message: CODEX_STUB_MESSAGE };
    yield { type: "done" };
  }
}
