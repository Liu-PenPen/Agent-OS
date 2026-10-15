import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  mcpConfigDataDir,
  resolveMcpServerInvocation,
} from "./mcp-invocation.js";

/** Claude --mcp-config path. The file is rewritten for the current server path. */
export function claudeMcpArgs(): string[] {
  try {
    const invocation = resolveMcpServerInvocation();
    const config = {
      mcpServers: {
        agent_os: {
          type: "stdio",
          command: invocation.command,
          args: invocation.args,
        },
      },
    };
    const configDir = mcpConfigDataDir();
    mkdirSync(configDir, { recursive: true });
    const configPath = join(configDir, "claude-mcp-agent-os.json");
    writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
    return ["--mcp-config", configPath];
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Claude MCP 工具未挂上：${message}`);
    return [];
  }
}
