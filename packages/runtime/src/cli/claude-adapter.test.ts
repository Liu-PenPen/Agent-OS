import { describe, it, expect, vi } from "vitest";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import type { ChildProcess } from "node:child_process";
import {
  ClaudeCliAdapter,
  parseClaudeStdoutLine,
  promptInputForPlatform,
  resolveClaudeCommand,
  type SpawnFn,
} from "./claude-adapter.js";
import {
  CLAUDE_MISSING_MESSAGE,
  CliEngineUnavailableError,
} from "./errors.js";

function fakeChild(options: {
  lines?: string[];
  enoent?: boolean;
  exitCode?: number;
  stderr?: string;
}): ChildProcess {
  const stdout = new PassThrough();
  const stderr = new PassThrough();
  const stdin = {
    end: vi.fn(),
  };
  const child = new EventEmitter() as ChildProcess & EventEmitter;
  Object.assign(child, {
    stdout,
    stderr,
    stdin,
    pid: 4242,
    kill: vi.fn(),
  });

  queueMicrotask(() => {
    if (options.enoent) {
      const err = new Error("spawn claude ENOENT") as NodeJS.ErrnoException;
      err.code = "ENOENT";
      child.emit("error", err);
      return;
    }
    if (options.stderr) {
      stderr.write(options.stderr);
    }
    for (const line of options.lines ?? []) {
      stdout.write(`${line}\n`);
    }
    stdout.end();
    stderr.end();
    child.emit("close", options.exitCode ?? 0);
  });

  return child;
}

describe("parseClaudeStdoutLine", () => {
  it("maps a partial tool start before the tool finishes", () => {
    const line = JSON.stringify({
      type: "stream_event",
      event: {
        type: "content_block_start",
        content_block: { type: "tool_use", name: "Glob", input: {} },
      },
    });
    expect(parseClaudeStdoutLine(line)).toEqual([
      { type: "tool", name: "Glob", input: {} },
    ]);
  });

  it("maps assistant text blocks to text_delta", () => {
    const line = JSON.stringify({
      type: "assistant",
      message: {
        content: [{ type: "text", text: "Hello" }],
      },
    });
    expect(parseClaudeStdoutLine(line)).toEqual([
      { type: "text_delta", text: "Hello" },
    ]);
  });

  it("maps result to text_delta + done", () => {
    const line = JSON.stringify({
      type: "result",
      result: "Done",
      session_id: "sess-1",
    });
    expect(parseClaudeStdoutLine(line)).toEqual([
      { type: "text_delta", text: "Done" },
      { type: "done", sessionId: "sess-1" },
    ]);
  });

  it("maps assistant usage to a usage event", () => {
    const line = JSON.stringify({
      type: "assistant",
      message: {
        usage: {
          input_tokens: 27000,
          output_tokens: 500,
          cache_read_input_tokens: 300,
        },
        content: [{ type: "tool_use", name: "Read", input: { file_path: "a.ts" } }],
      },
    });
    expect(parseClaudeStdoutLine(line)).toEqual([
      { type: "usage", usedTokens: 27800 },
      { type: "tool", name: "Read", input: { file_path: "a.ts" } },
    ]);
  });

  it("maps result model usage including the context window", () => {
    const line = JSON.stringify({
      type: "result",
      result: "Done",
      session_id: "sess-1",
      usage: { input_tokens: 1000, output_tokens: 200 },
      modelUsage: { "claude-sonnet": { contextWindow: 200000 } },
    });
    expect(parseClaudeStdoutLine(line)).toEqual([
      { type: "usage", usedTokens: 1200, contextWindowTokens: 200000 },
      { type: "text_delta", text: "Done" },
      { type: "done", sessionId: "sess-1" },
    ]);
  });

  it("treats non-JSON as text_delta", () => {
    expect(parseClaudeStdoutLine("plain")).toEqual([
      { type: "text_delta", text: "plain\n" },
    ]);
  });
});

describe("promptInputForPlatform", () => {
  it("uses stdin on Windows and argument elsewhere", () => {
    expect(promptInputForPlatform("win32")).toBe("stdin");
    expect(promptInputForPlatform("linux")).toBe("argument");
  });
});

describe("resolveClaudeCommand", () => {
  it("uses ML_AOS_CLAUDE_PATH when set", () => {
    expect(
      resolveClaudeCommand(
        { ML_AOS_CLAUDE_PATH: "D:\\tools\\claude.exe" },
        "win32",
        "C:\\node\\node.exe",
      ),
    ).toBe("D:\\tools\\claude.exe");
  });

  it("returns claude on non-Windows", () => {
    expect(resolveClaudeCommand({}, "linux", "/usr/bin/node")).toBe("claude");
  });
});

describe("ClaudeCliAdapter", () => {
  it("streams text_delta from mocked spawn stdout (no real network)", async () => {
    const spawnFn: SpawnFn = vi.fn((_cmd, _args, _opts) =>
      fakeChild({
        lines: [
          JSON.stringify({
            type: "assistant",
            message: { content: [{ type: "text", text: "Hi " }] },
          }),
          JSON.stringify({
            type: "assistant",
            message: { content: [{ type: "text", text: "there" }] },
          }),
          JSON.stringify({
            type: "result",
            result: "",
            session_id: "abc",
          }),
        ],
      }),
    );

    const adapter = new ClaudeCliAdapter(
      spawnFn,
      "C:\\fake\\claude.exe",
      "linux",
    );
    const chunks: string[] = [];
    let sessionId: string | undefined;

    for await (const ev of adapter.run({
      prompt: "hello",
      cwd: process.cwd(),
    })) {
      if (ev.type === "text_delta") chunks.push(ev.text);
      if (ev.type === "done") sessionId = ev.sessionId;
    }

    expect(spawnFn).toHaveBeenCalled();
    const [cmd, args, opts] = (spawnFn as ReturnType<typeof vi.fn>).mock
      .calls[0];
    expect(cmd).toBe("C:\\fake\\claude.exe");
    expect(args).toContain("-p");
    expect(args).toContain("hello");
    expect(opts.shell).toBe(false);
    expect(chunks.join("")).toBe("Hi there");
    expect(sessionId).toBe("abc");
  });

  it("on Windows uses shell and passes prompt via stdin", async () => {
    const spawnFn: SpawnFn = vi.fn((_cmd, _args, _opts) =>
      fakeChild({
        lines: [
          JSON.stringify({
            type: "result",
            result: "ok",
            session_id: "w",
          }),
        ],
      }),
    );
    const adapter = new ClaudeCliAdapter(spawnFn, "claude", "win32");
    for await (const _ of adapter.run({
      prompt: "你好",
      cwd: process.cwd(),
    })) {
      // drain
    }
    const [, args, opts] = (spawnFn as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(opts.shell).toBe(true);
    expect(args).toContain("-p");
    expect(args).not.toContain("你好");
    const child = (spawnFn as ReturnType<typeof vi.fn>).mock.results[0]
      .value as ChildProcess & { stdin: { end: ReturnType<typeof vi.fn> } };
    expect(child.stdin.end).toHaveBeenCalledWith("你好", "utf8");
  });

  it("throws when workspace cwd is missing", async () => {
    const spawnFn: SpawnFn = vi.fn(() => fakeChild({}));
    const adapter = new ClaudeCliAdapter(spawnFn, "claude", "linux");
    await expect(async () => {
      for await (const _ of adapter.run({
        prompt: "x",
        cwd: "E:/tmp/definitely-missing-ml-aos-cwd",
      })) {
        // drain
      }
    }).rejects.toThrow(/工作区目录不存在/);
    expect(spawnFn).not.toHaveBeenCalled();
  });

  it("throws CliEngineUnavailableError when claude binary is missing", async () => {
    const spawnFn: SpawnFn = vi.fn(() => fakeChild({ enoent: true }));
    const adapter = new ClaudeCliAdapter(spawnFn, "missing-claude", "linux");

    let caught: unknown;
    try {
      for await (const _ of adapter.run({
        prompt: "x",
        cwd: process.cwd(),
      })) {
        // drain
      }
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(CliEngineUnavailableError);
    expect((caught as Error).message).toBe(CLAUDE_MISSING_MESSAGE);
    expect((caught as CliEngineUnavailableError).status).toBe(503);
  });
});
