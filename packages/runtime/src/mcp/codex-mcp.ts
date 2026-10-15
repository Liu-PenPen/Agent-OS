import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  mcpConfigDataDir,
  resolveMcpServerInvocation,
} from "./mcp-invocation.js";

/**
 * Codex MCP injection. Pass args as TOML sequence entries — do not JSON.stringify
 * the whole args array (Windows shell eats nested quotes).
 * Aligns with agent-os `codexAppToolArgs`.
 */
export function codexAppToolArgs(): string[] {
  try {
    const invocation = resolveMcpServerInvocation();
    const args: string[] = [
      "-c",
      `mcp_servers.agent_os.command=${JSON.stringify(invocation.command)}`,
    ];
    for (let i = 0; i < invocation.args.length; i++) {
      args.push(
        "-c",
        `mcp_servers.agent_os.args[${i}]=${JSON.stringify(invocation.args[i])}`,
      );
    }
    args.push(
      "-c",
      "mcp_servers.agent_os.startup_timeout_sec=60",
      "-c",
      'mcp_servers.agent_os.default_tools_approval_mode="auto"',
    );
    return args;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Codex MCP 工具未挂上：${message}`);
    return [];
  }
}

/** Keep a readable copy of the MCP server path for debugging (optional). */
export function writeCodexMcpDebugConfig(): string | undefined {
  try {
    const invocation = resolveMcpServerInvocation();
    const configDir = mcpConfigDataDir();
    mkdirSync(configDir, { recursive: true });
    const configPath = join(configDir, "codex-mcp-agent-os-debug.json");
    writeFileSync(
      configPath,
      `${JSON.stringify({ command: invocation.command, args: invocation.args }, null, 2)}\n`,
      "utf8",
    );
    return configPath;
  } catch {
    return undefined;
  }
}
