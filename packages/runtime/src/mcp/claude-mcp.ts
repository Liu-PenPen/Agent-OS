import { mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);

function serverInvocation(): { command: string; args: string[] } {
  const server = fileURLToPath(new URL("./app-tools-server.ts", import.meta.url));
  // tsx 不导出 ./dist/cli.mjs，resolve 那个路径会抛错，MCP 参数会被吞掉。
  const tsxCli = require.resolve("tsx/cli");
  return { command: process.execPath, args: [tsxCli, server] };
}

/** Claude --mcp-config path. The file is rewritten for the current server path. */
export function claudeMcpArgs(): string[] {
  try {
    const invocation = serverInvocation();
    const config = {
      mcpServers: {
        agent_os: {
          type: "stdio",
          command: invocation.command,
          args: invocation.args,
        },
      },
    };
    const configDir = join(process.cwd(), "data");
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
