/**
 * Resolve how to spawn the agent_os MCP stdio server.
 * Dev: node + tsx + app-tools-server.ts
 * Packaged: node + app-tools-server.js next to the runtime bundle
 */
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);

export type McpServerInvocation = {
  command: string;
  args: string[];
};

function bundledServerPath(): string | undefined {
  const here = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    join(here, "app-tools-server.js"),
    join(process.cwd(), "app-tools-server.js"),
  ];
  return candidates.find((path) => existsSync(path));
}

export function resolveMcpServerInvocation(): McpServerInvocation {
  const bundled = bundledServerPath();
  if (bundled) {
    return { command: process.execPath, args: [bundled] };
  }

  const serverTs = fileURLToPath(new URL("./app-tools-server.ts", import.meta.url));
  if (!existsSync(serverTs)) {
    throw new Error(
      `agent_os MCP 入口不存在：未找到打包产物 app-tools-server.js，也没有源码 ${serverTs}`,
    );
  }
  // tsx 不导出 ./dist/cli.mjs，resolve 那个路径会抛错，MCP 参数会被吞掉。
  const tsxCli = require.resolve("tsx/cli");
  return { command: process.execPath, args: [tsxCli, serverTs] };
}

/** Prefer ML_AOS_DATA_DIR so packaged installs do not write under resources/. */
export function mcpConfigDataDir(): string {
  return process.env.ML_AOS_DATA_DIR?.trim() || join(process.cwd(), "data");
}
