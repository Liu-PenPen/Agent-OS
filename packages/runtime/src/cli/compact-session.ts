import {
  spawn,
  type ChildProcess,
} from "node:child_process";
import { createInterface } from "node:readline";
import { claudeMcpArgs } from "../mcp/claude-mcp.js";
import { resolveClaudeCommand } from "./claude-adapter.js";

export interface CompactSessionInput {
  engine: "claude" | "codex";
  sessionId: string;
  cwd: string;
  instructions?: string;
  signal?: AbortSignal;
}

export interface CompactSessionResult {
  sessionId: string;
  compacted: boolean;
  message?: string;
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** agent-os aligned: Claude resumes with `/compact` via stream-json. */
function compactClaude(input: CompactSessionInput): Promise<CompactSessionResult> {
  return new Promise((resolve, reject) => {
    if (input.signal?.aborted) {
      reject(new Error("上下文整理已取消"));
      return;
    }
    const command = input.instructions?.trim()
      ? `/compact ${input.instructions.trim()}`
      : "/compact";
    const promptInput = process.platform === "win32" ? "stdin" : "argument";
    const args = [
      "--resume",
      input.sessionId,
      "--dangerously-skip-permissions",
      "-p",
      ...(promptInput === "argument" ? [command] : []),
      "--output-format",
      "stream-json",
      "--verbose",
      ...claudeMcpArgs(),
    ];
    const child = spawn(resolveClaudeCommand(), args, {
      cwd: input.cwd,
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
      shell: process.platform === "win32",
    });
    if (promptInput === "stdin" && child.stdin) {
      child.stdin.write(`${command}\n`, "utf8");
      child.stdin.end();
    }

    let completed = false;
    let resultMessage: string | undefined;
    let settled = false;
    const lines = createInterface({ input: child.stdout! });

    const cleanup = () => {
      clearTimeout(timer);
      input.signal?.removeEventListener("abort", onAbort);
    };
    const fail = (error: Error) => {
      if (settled) return;
      settled = true;
      cleanup();
      killProcessTree(child);
      reject(error);
    };
    const succeed = () => {
      if (settled) return;
      settled = true;
      cleanup();
      killProcessTree(child);
      resolve({
        sessionId: input.sessionId,
        compacted: true,
        message: resultMessage,
      });
    };
    const onAbort = () => fail(new Error("上下文整理已取消"));
    const timer = setTimeout(
      () => fail(new Error("Claude 上下文整理超时")),
      30 * 60 * 1000,
    );
    input.signal?.addEventListener("abort", onAbort, { once: true });

    lines.on("line", (line) => {
      try {
        const message = JSON.parse(line) as Record<string, unknown>;
        if (message.type === "system" && message.subtype === "compact_boundary") {
          completed = true;
        }
        if (message.type === "result" && message.is_error === true) {
          fail(
            new Error(
              typeof message.result === "string"
                ? message.result
                : "Claude 上下文整理失败",
            ),
          );
          return;
        }
        if (message.type === "result" && typeof message.result === "string") {
          resultMessage = message.result.trim() || undefined;
        }
      } catch {
        // ignore
      }
    });
    child.once("error", (error) => fail(error));
    child.once("close", () => {
      if (settled) return;
      if (completed) succeed();
      else fail(new Error("Claude 上下文整理未完成就退出"));
    });
  });
}

/** agent-os aligned: Codex app-server thread/compact/start. */
function compactCodex(input: CompactSessionInput): Promise<CompactSessionResult> {
  return new Promise((resolve, reject) => {
    if (input.signal?.aborted) {
      reject(new Error("上下文整理已取消"));
      return;
    }
    const command = process.env.ML_AOS_CODEX_PATH?.trim() || "codex";
    const child = spawn(command, ["app-server", "--stdio"], {
      cwd: input.cwd,
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
      shell: process.platform === "win32",
    });

    let settled = false;
    let stderr = "";
    const lines = createInterface({ input: child.stdout! });

    const send = (payload: unknown) => {
      child.stdin?.write(`${JSON.stringify(payload)}\n`, "utf8");
    };
    const cleanup = () => {
      clearTimeout(timer);
      input.signal?.removeEventListener("abort", onAbort);
    };
    const fail = (error: Error) => {
      if (settled) return;
      settled = true;
      cleanup();
      killProcessTree(child);
      reject(error);
    };
    const succeed = () => {
      if (settled) return;
      settled = true;
      cleanup();
      killProcessTree(child);
      resolve({ sessionId: input.sessionId, compacted: true });
    };
    const onAbort = () => fail(new Error("上下文整理已取消"));
    const timer = setTimeout(
      () => fail(new Error("Codex 上下文整理超时")),
      30 * 60 * 1000,
    );
    input.signal?.addEventListener("abort", onAbort, { once: true });

    lines.on("line", (line) => {
      let message: Record<string, unknown>;
      try {
        message = JSON.parse(line) as Record<string, unknown>;
      } catch {
        return;
      }
      if (isRecord(message.error)) {
        fail(
          new Error(
            typeof message.error.message === "string"
              ? message.error.message
              : "Codex 上下文整理失败",
          ),
        );
        return;
      }
      if (message.id === 1) {
        send({ method: "initialized", params: {} });
        send({
          id: 2,
          method: "thread/resume",
          params: { threadId: input.sessionId },
        });
        return;
      }
      if (message.id === 2) {
        send({
          id: 3,
          method: "thread/compact/start",
          params: { threadId: input.sessionId },
        });
        return;
      }
      if (message.method === "item/completed" && isRecord(message.params)) {
        const item = message.params.item;
        if (isRecord(item) && item.type === "contextCompaction") succeed();
      }
    });
    child.stderr?.on("data", (chunk: Buffer | string) => {
      stderr += chunk.toString();
    });
    child.once("error", (error) => fail(error));
    child.once("close", (code) => {
      if (settled) return;
      fail(
        new Error(stderr.trim() || `Codex app-server 提前退出，状态码 ${code}`),
      );
    });

    send({
      id: 1,
      method: "initialize",
      params: {
        clientInfo: {
          name: "ml_aos",
          title: "ML AOS",
          version: "0.1.0",
        },
      },
    });
  });
}

export async function compactCliSession(
  input: CompactSessionInput,
): Promise<CompactSessionResult> {
  return input.engine === "codex" ? compactCodex(input) : compactClaude(input);
}

export function parseCompactCommand(content: string): {
  isCompact: boolean;
  instructions?: string;
} {
  const trimmed = content.trim();
  if (!trimmed.startsWith("/compact")) {
    return { isCompact: false };
  }
  const rest = trimmed.slice("/compact".length).trim();
  return {
    isCompact: true,
    ...(rest ? { instructions: rest } : {}),
  };
}
