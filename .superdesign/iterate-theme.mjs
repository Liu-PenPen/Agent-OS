import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const cli = "E:/Nvm/nvm/v22.12.0/node_modules/@superdesign/cli/bin/superdesign.js";
const designSystem = join(root, "design-system.md");
const draftId = "caa116af-d072-4fc7-a7dd-fbbeab2d9f59";

function run(args) {
  const result = spawnSync(process.execPath, [cli, ...args], {
    encoding: "utf8",
    cwd: join(root, ".."),
    maxBuffer: 20 * 1024 * 1024,
  });
  process.stdout.write(result.stdout || "");
  process.stderr.write(result.stderr || "");
  if (result.status) process.exit(result.status);
}

// 1) Replace: emphasize theme controls on App Settings
run([
  "iterate-design-draft",
  "--draft-id",
  draftId,
  "-p",
  "Emphasize Theme as a primary section near the top of App Settings: segmented control Dark / Light / Follow system, with clear preview hint. Keep other sections (default engine, data dir, notifications, about). Add a subtle theme toggle icon in the top bar. Same ML AOS chrome. Persist preference concept visible in UI copy.",
  "--mode",
  "replace",
  "--context-file",
  designSystem,
  "--json",
]);

// 2) Branch: light theme appearance of the same settings page
run([
  "iterate-design-draft",
  "--draft-id",
  draftId,
  "-p",
  "light theme appearance of this App Settings page using the light tokens from the design system",
  "--mode",
  "branch",
  "--context-file",
  designSystem,
  "--json",
]);
