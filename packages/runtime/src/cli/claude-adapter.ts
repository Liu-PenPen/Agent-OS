import {
  spawn,
  type ChildProcess,
  type SpawnOptions,
} from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { createInterface } from "node:readline";
import { claudeMcpArgs } from "../mcp/claude-mcp.js";
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

/** Windows: prompt via stdin (avoid cmd escaping / GBK mojibake). Else: argv. */
export type CliPromptInput = "argument" | "stdin";

export function promptInputForPlatform(
  platform: NodeJS.Platform = process.platform,
): CliPromptInput {
  return platform === "win32" ? "stdin" : "argument";
}

/**
 * Resolve a spawnable Claude binary.
 * Prefer real `.exe` when discoverable; fall back to `claude` (with shell on Windows).
 * Aligned with agent-os: Windows `.cmd` shims need `shell: true`.
 */
export function resolveClaudeCommand(
  env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform,
  execPath: string = process.execPath,
): string {
  const override = env.ML_AOS_CLAUDE_PATH?.trim();
  if (override) return override;

  if (platform !== "win32") {
    return "claude";
  }

  const besideNode = join(
    dirname(execPath),
    "node_modules",
    "@anthropic-ai",
    "claude-code",
    "bin",
    "claude.exe",
  );
  if (existsSync(besideNode)) return besideNode;

  // Prefer npm global install next to common Node prefixes.
  const where = spawnSyncWhere();
  if (where) {
    const exe = where.find((line) => /\.exe$/i.test(line));
    if (exe && existsSync(exe)) return exe;

    for (const line of where) {
      // E:\node\nodejs\claude.cmd → …\node_modules\@anthropic-ai\claude-code\bin\claude.exe
      const dir = dirname(line);
      const nested = join(
        dir,
        "node_modules",
        "@anthropic-ai",
        "claude-code",
        "bin",
        "claude.exe",
      );
      if (existsSync(nested)) return nested;
    }
  }

  // agent-os style: let cmd resolve `claude` / `claude.cmd` via shell.
  return "claude";
}

function spawnSyncWhere(): string[] | undefined {
  try {
    // Lazy require to keep tests free of real where.exe when mocked.
    const { spawnSync } = require("node:child_process") as typeof import("node:child_process");
    const where = spawnSync("where.exe", ["claude"], {
      encoding: "utf8",
      windowsHide: true,
    });
    if (where.status !== 0 || !where.stdout) return undefined;
    return where.stdout
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
  } catch {
    return undefined;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function usageTokens(usage: unknown): number | undefined {
  if (!isRecord(usage)) return undefined;
  const values = [
    asNumber(usage.input_tokens),
    asNumber(usage.output_tokens),
    asNumber(usage.cache_read_input_tokens),
    asNumber(usage.cache_creation_input_tokens),
  ].filter((value): value is number => value !== undefined);
  return values.length ? values.reduce((sum, value) => sum + value, 0) : undefined;
}

function contextWindowTokens(modelUsage: unknown): number | undefined {
  if (!isRecord(modelUsage)) return undefined;
  const windows = Object.values(modelUsage)
    .filter(isRecord)
    .map((usage) => asNumber(usage.contextWindow))
    .filter((value): value is number => value !== undefined && value > 0);
  return windows.length ? Math.max(...windows) : undefined;
}

function usageEvent(
  usage: unknown,
  modelUsage?: unknown,
): CliEvent | undefined {
  const usedTokens = usageTokens(usage);
  if (usedTokens === undefined) return undefined;
  const contextWindowTokensValue = contextWindowTokens(modelUsage);
  return {
    type: "usage",
    usedTokens,
    ...(contextWindowTokensValue
      ? { contextWindowTokens: contextWindowTokensValue }
      : {}),
  };
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
      const usage = usageEvent(event.message.usage);
      if (usage) events.push(usage);
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

    if (event.type === "stream_event" && isRecord(event.event)) {
      const inner = event.event;
      const block = isRecord(inner.content_block) ? inner.content_block : undefined;
      if (
        inner.type === "content_block_start" &&
        block?.type === "tool_use" &&
        typeof block.name === "string"
      ) {
        events.push({
          type: "tool",
          name: block.name,
          input: block.input,
        });
      }
      const delta = isRecord(inner.delta) ? inner.delta : undefined;
      if (
        inner.type === "content_block_delta" &&
        delta &&
        delta.type === "text_delta" &&
        typeof delta.text === "string" &&
        delta.text.length > 0
      ) {
        events.push({ type: "text_delta", text: delta.text });
      }
    }

    if (event.type === "result") {
      const usage = usageEvent(event.usage, event.modelUsage);
      if (usage) events.push(usage);
      if (event.is_error) {
        events.push({
          type: "error",
          message:
            typeof event.result === "string"
              ? event.result
              : "Claude Code 执行失败",
        });
      } else if (typeof event.result === "string" && event.result.length > 0) {
        events.push({ type: "text_delta", text: event.result });
      }
      events.push({ type: "done", ...(sessionId ? { sessionId } : {}) });
    }

    return events;
  } catch {
    return [{ type: "text_delta", text: `${trimmed}\n` }];
  }
}

function buildArgs(input: CliRunInput, promptInput: CliPromptInput): string[] {
  const args = [
    "--dangerously-skip-permissions",
    "-p",
    ...(promptInput === "argument" ? [input.prompt] : []),
    "--output-format",
    "stream-json",
    "--include-partial-messages",
    "--verbose",
    ...claudeMcpArgs(),
  ];
  if (input.sessionId) {
    return ["--resume", input.sessionId, ...args];
  }
  return args;
}

export class ClaudeCliAdapter implements CliAdapter {
  constructor(
    private readonly spawnFn: SpawnFn = spawn,
    private readonly command: string = resolveClaudeCommand(),
    private readonly platform: NodeJS.Platform = process.platform,
  ) {}

  async *run(input: CliRunInput): AsyncIterable<CliEvent> {
    if (!existsSync(input.cwd)) {
      throw new CliEngineUnavailableError(
        `工作区目录不存在：${input.cwd}。请在「工作区」设置中选择有效的本地路径。`,
      );
    }

    const promptInput = promptInputForPlatform(this.platform);
    const useShell = this.platform === "win32";
    const queue: CliEvent[] = [];
    let notify: (() => void) | undefined;
    let finished = false;
    let spawnError: Error | undefined;
    let sawDone = false;

    const wake = () => {
      notify?.();
      notify = undefined;
    };

    const child = this.spawnFn(this.command, buildArgs(input, promptInput), {
      cwd: input.cwd,
      env: { ...process.env, ...input.env },
      // agent-os: Windows 下 claude 常为 .cmd，必须 shell:true
      shell: useShell,
      windowsHide: true,
      stdio: ["pipe", "pipe", "pipe"],
    });

    if (child.stdin) {
      if (promptInput === "stdin") {
        child.stdin.end(input.prompt, "utf8");
      } else {
        child.stdin.end();
      }
    }

    const onAbort = () => {
      killProcessTree(child);
      finished = true;
      wake();
    };
    if (input.signal?.aborted) onAbort();
    else input.signal?.addEventListener("abort", onAbort, { once: true });

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
      if (input.signal?.aborted) {
        queue.push({ type: "error", message: "aborted by user" });
      } else if (!sawDone) {
        if (code && code !== 0) {
          const detail = stderr.trim();
          queue.push({
            type: "error",
            message: detail
              ? `claude 退出码 ${code}：${detail}`
              : `claude 退出码 ${code}`,
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
