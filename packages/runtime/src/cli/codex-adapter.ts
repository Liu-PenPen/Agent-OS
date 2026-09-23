import {
  spawn,
  type ChildProcess,
  type SpawnOptions,
} from "node:child_process";
import { existsSync } from "node:fs";
import { createInterface } from "node:readline";
import { codexAppToolArgs } from "../mcp/codex-mcp.js";
import type { CliAdapter, CliEvent, CliRunInput } from "./types.js";
import {
  CODEX_MISSING_MESSAGE,
  CliEngineUnavailableError,
} from "./errors.js";

export type SpawnFn = (
  command: string,
  args: readonly string[],
  options: SpawnOptions,
) => ChildProcess;

const APP_TOOLS = new Set([
  "request_clarification",
  "request_spec_approval",
  "dispatch_task",
  "request_approval",
  "schedule_manage",
  "submit_acceptance",
  "run_acceptance_suite",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function shortText(value: unknown, maxLength = 72): string | undefined {
  if (typeof value !== "string") return undefined;
  const text = value.replace(/\s+/g, " ").trim();
  if (!text) return undefined;
  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}…` : text;
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

function toolEvents(item: Record<string, unknown>): CliEvent[] {
  if (item.type === "command_execution") {
    return [{ type: "tool", name: "Bash", input: { command: item.command } }];
  }
  if (item.type === "file_change") {
    return [{ type: "tool", name: "Edit", input: { path: shortText(item.path) } }];
  }
  if (item.type === "web_search") {
    return [{ type: "tool", name: "WebSearch", input: { query: item.query } }];
  }
  if (item.type === "mcp_tool_call") {
    const server = typeof item.server === "string" ? item.server : "";
    const tool = typeof item.tool === "string" ? item.tool : "MCP";
    const input = item.arguments ?? item.input;
    if (server === "agent_os" && APP_TOOLS.has(tool)) {
      return [{ type: "tool", name: tool, input }];
    }
    return [{ type: "tool", name: tool || "MCP", input }];
  }
  return [];
}

/** Map one Codex JSONL line to ml-aos CliEvents. */
export function parseCodexStdoutLine(line: string): CliEvent[] {
  const trimmed = line.trim();
  if (!trimmed) return [];
  let event: Record<string, unknown>;
  try {
    event = JSON.parse(trimmed) as Record<string, unknown>;
  } catch {
    return [];
  }

  if (event.type === "thread.started" && typeof event.thread_id === "string") {
    return [{ type: "done", sessionId: event.thread_id }];
  }
  // Note: thread.started only carries session — don't end the run. Buffer session separately.
  return parseCodexEvent(event);
}

function parseCodexEvent(event: Record<string, unknown>): CliEvent[] {
  if (event.type === "error" || event.type === "turn.failed") {
    const message =
      typeof event.message === "string"
        ? event.message
        : isRecord(event.error) && typeof event.error.message === "string"
          ? event.error.message
          : "Codex 执行失败";
    return [{ type: "error", message }];
  }

  if (event.type === "turn.completed" && isRecord(event.usage)) {
    const inputTokens = asNumber(event.usage.input_tokens) ?? 0;
    const outputTokens = asNumber(event.usage.output_tokens) ?? 0;
    const used = inputTokens + outputTokens;
    return used > 0 ? [{ type: "usage", usedTokens: used }] : [];
  }

  if (!isRecord(event.item)) return [];
  const item = event.item;

  if (
    event.type === "item.completed" &&
    item.type === "agent_message" &&
    typeof item.text === "string"
  ) {
    return [{ type: "text_delta", text: item.text }];
  }

  if (event.type === "item.started") {
    return toolEvents(item);
  }

  return [];
}

function buildArgs(input: CliRunInput, promptInput: "argument" | "stdin"): string[] {
  const args = [
    ...codexAppToolArgs(),
    "exec",
    "--json",
    "--skip-git-repo-check",
  ];
  if (process.platform === "win32") {
    args.push("--dangerously-bypass-approvals-and-sandbox");
  } else {
    args.push("--yolo");
  }
  if (input.sessionId) {
    // resume insert: exec resume --json ... sessionId
    const withoutExec = args.filter((a) => a !== "exec");
    const head = [...codexAppToolArgs(), "exec", "resume", "--json", "--skip-git-repo-check"];
    if (process.platform === "win32") {
      head.push("--dangerously-bypass-approvals-and-sandbox");
    } else {
      head.push("--yolo");
    }
    head.push(input.sessionId);
    head.push(promptInput === "stdin" ? "-" : input.prompt);
    return head;
  }
  args.push(promptInput === "stdin" ? "-" : input.prompt);
  return args;
}

export class CodexCliAdapter implements CliAdapter {
  constructor(
    private readonly spawnFn: SpawnFn = spawn,
    private readonly command: string = process.env.ML_AOS_CODEX_PATH?.trim() || "codex",
    private readonly platform: NodeJS.Platform = process.platform,
  ) {}

  async *run(input: CliRunInput): AsyncIterable<CliEvent> {
    if (!existsSync(input.cwd)) {
      throw new CliEngineUnavailableError(
        `工作区目录不存在：${input.cwd}。请在「工作区」设置中选择有效的本地路径。`,
      );
    }

    const promptInput = this.platform === "win32" ? "stdin" : "argument";
    const useShell = this.platform === "win32";
    const queue: CliEvent[] = [];
    let notify: (() => void) | undefined;
    let finished = false;
    let sessionId: string | undefined = input.sessionId;
    let sawDone = false;

    const push = (events: CliEvent[]) => {
      for (const event of events) {
        if (event.type === "done" && event.sessionId) {
          sessionId = event.sessionId;
          // thread.started emits done-shaped marker in some parsers — ignore early end
          continue;
        }
        queue.push(event);
      }
      notify?.();
    };

    const args = buildArgs(input, promptInput);
    let child: ChildProcess;
    try {
      child = this.spawnFn(this.command, args, {
        cwd: input.cwd,
        env: { ...process.env, ...input.env },
        stdio: ["pipe", "pipe", "pipe"],
        windowsHide: true,
        shell: useShell,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new CliEngineUnavailableError(
        /ENOENT|not found/i.test(message) ? CODEX_MISSING_MESSAGE : message,
      );
    }

    if (promptInput === "stdin" && child.stdin) {
      child.stdin.write(input.prompt, "utf8");
      child.stdin.end();
    }

    const onAbort = () => killProcessTree(child);
    if (input.signal) {
      if (input.signal.aborted) onAbort();
      else input.signal.addEventListener("abort", onAbort, { once: true });
    }

    const stdout = child.stdout;
    if (stdout) {
      const lines = createInterface({ input: stdout });
      lines.on("line", (line) => {
        try {
          const raw = JSON.parse(line.trim()) as Record<string, unknown>;
          if (raw.type === "thread.started" && typeof raw.thread_id === "string") {
            sessionId = raw.thread_id;
            return;
          }
          push(parseCodexEvent(raw));
        } catch {
          // ignore non-json
        }
      });
    }

    let stderr = "";
    child.stderr?.on("data", (chunk: Buffer | string) => {
      stderr += chunk.toString();
    });

    child.once("error", (error) => {
      const message = error.message || String(error);
      push([
        {
          type: "error",
          message: /ENOENT|not found/i.test(message)
            ? CODEX_MISSING_MESSAGE
            : message,
        },
      ]);
      finished = true;
      notify?.();
    });

    child.once("close", (code) => {
      if (code && code !== 0 && stderr.trim()) {
        push([{ type: "error", message: stderr.trim().slice(0, 500) }]);
      }
      if (!sawDone) {
        push([{ type: "done", ...(sessionId ? { sessionId } : {}) }]);
        sawDone = true;
      }
      finished = true;
      notify?.();
    });

    while (!finished || queue.length > 0) {
      if (queue.length === 0) {
        await new Promise<void>((resolve) => {
          notify = resolve;
        });
        notify = undefined;
        continue;
      }
      const next = queue.shift()!;
      if (next.type === "done") sawDone = true;
      yield next;
    }
  }
}
