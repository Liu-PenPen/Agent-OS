import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = dirname(fileURLToPath(import.meta.url));
const pages = JSON.parse(
  readFileSync(join(root, "tmp", "flow-pages.json"), "utf8"),
);
const pagesJson = JSON.stringify(pages);
const cli = "E:/Nvm/nvm/v22.12.0/node_modules/@superdesign/cli/bin/superdesign.js";

console.log("pages:", pages.length, "json length:", pagesJson.length);

const result = spawnSync(
  process.execPath,
  [
    cli,
    "execute-flow-pages",
    "--draft-id",
    "4d00e536-fcbd-4eb0-a9f5-a372c9bcbeb5",
    "--pages",
    pagesJson,
    "--context-file",
    join(root, "design-system.md"),
    "--context",
    "Product ML AOS phase-1 screens: Clarification Queue, Pipeline Detail, App Settings. Inherit home workbench visual system. No Feishu.",
    "--json",
  ],
  {
    encoding: "utf8",
    cwd: join(root, ".."),
    maxBuffer: 20 * 1024 * 1024,
  },
);

process.stdout.write(result.stdout || "");
process.stderr.write(result.stderr || "");
process.exit(result.status ?? 1);
