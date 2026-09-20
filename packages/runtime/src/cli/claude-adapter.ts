import {
  spawn,
  type ChildProcess,
  type SpawnOptions,
} from "node:child_process";
import { createInterface } from "node:readline";
import type { CliAdapter, CliEvent, CliRunInput } from "./types.js";
import {
  CLAUDE_MISSING_MESSAGE,
  CliEngineUnavailableError,
} from "./errors.js";

export type SpawnFn = (
  command: string,
  args: readonly string[],
  options: SpawnOptions,
) => ChildProcess;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function killProcessTree(child: ChildProcess): void {
  if (!child.pid) {
    child.kill();
    return;
  }
  if (process.platform !== "win32") {
    child.kill("SIGTERM");
    return;
  }
  spawn("taskkill", ["/pid", String(child.pid), "/t", "/f"], {
    windowsHide: true,
    stdio: "ignore",
    shell: false,
  });
}

/** Best-effort map of Claude stream-json (or plain) stdout lines → CliEvent. */
export function parseClaudeStdoutLine(line: string): CliEvent[] {
  const trimmed = line.trim();
  if (!trimmed) return [];

  try {
    const event = JSON.parse(trimmed) as Record<string, unknown>;
    const events: CliEvent[] = [];
    const sessionId =
      typeof event.session_id === "string" ? event.session_id : undefined;

    if (event.type === "assistant" && isRecord(event.message)) {
      const content = event.message.content;
      if (Array.isArray(content)) {
        for (const block of content) {
          if (!isRecord(block)) continue;
          if (block.type === "text" && typeof block.text === "string") {
            events.push({ type: "text_delta", text: block.text });
          } else if (
            block.type === "tool_use" &&
            typeof block.name === "string"
          ) {
            events.push({
              type: "tool",
              name: block.name,
              input: block.input,
            });
          }
        }
      }
    }

    if (event.type === "result") {
      if (event.is_error) {
        events.push({
          type: "error",
          message:
            typeof event.result === "string"
              ? event.result
              : "Claude Code execution failed",
        });
      } else if (typeof event.result === "string" && event.result.length > 0) {
        // Final answer when no assistant text blocks were streamed.
        events.push({ type: "text_delta", text: event.result });
      }
      events.push({ type: "done", ...(sessionId ? { sessionId } : {}) });
    }

    return events;
  } catch {
    return [{ type: "text_delta", text: `${trimmed}\n` }];
  }
}

function buildArgs(input: CliRunInput): string[] {
  const args = [
    "--dangerously-skip-permissions",
    "-p",
    input.prompt,
    "--output-format",
    "stream-json",
    "--verbose",
  ];
  if (input.sessionId) {
    return ["--resume", input.sessionId, ...args];
  }
  return args;
}

export class ClaudeCliAdapter implements CliAdapter {
  constructor(
    private readonly spawnFn: SpawnFn = spawn,
    private readonly command = "claude",
  ) {}

  async *run(input: CliRunInput): AsyncIterable<CliEvent> {
    const queue: CliEvent[] = [];
    let notify: (() => void) | undefined;
    let finished = false;
    let spawnError: Error | undefined;
    let sawDone = false;

    const wake = () => {
      notify?.();
      notify = undefined;
    };

    const child = this.spawnFn(this.command, buildArgs(input), {
      cwd: input.cwd,
      env: process.env,
      shell: false,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });

    const onAbort = () => killProcessTree(child);
    input.signal?.addEventListener("abort", onAbort, { once: true });

    child.on("error", (err: NodeJS.ErrnoException) => {
      if (err.code === "ENOENT") {
        spawnError = new CliEngineUnavailableError(CLAUDE_MISSING_MESSAGE);
      } else {
        queue.push({ type: "error", message: err.message });
      }
      finished = true;
      wake();
    });

    let stderr = "";
    child.stderr?.on("data", (chunk: Buffer | string) => {
      stderr += typeof chunk === "string" ? chunk : chunk.toString("utf8");
    });

    if (child.stdout) {
      const lines = createInterface({ input: child.stdout });
      lines.on("line", (line) => {
        for (const event of parseClaudeStdoutLine(line)) {
          if (event.type === "done") sawDone = true;
          queue.push(event);
        }
        wake();
      });
    }

    child.on("close", (code) => {
      if (!sawDone) {
        if (code && code !== 0) {
          const detail = stderr.trim();
          queue.push({
            type: "error",
            message: detail
              ? `claude exited with code ${code}: ${detail}`
              : `claude exited with code ${code}`,
          });
        }
        queue.push({ type: "done", sessionId: input.sessionId });
      }
      finished = true;
      wake();
    });

    try {
      while (!finished || queue.length > 0) {
        if (queue.length === 0) {
          await new Promise<void>((resolve) => {
            notify = resolve;
          });
          continue;
        }
        const next = queue.shift();
        if (next) yield next;
      }
    } finally {
      input.signal?.removeEventListener("abort", onAbort);
    }

    if (spawnError) throw spawnError;
  }
}
