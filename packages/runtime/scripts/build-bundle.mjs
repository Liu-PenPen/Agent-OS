/**
 * Bundle the Node runtime into a single ESM file for desktop installers.
 */
import { build } from "esbuild";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outfile = join(root, "dist", "index.js");

await rm(join(root, "dist"), { recursive: true, force: true });
await mkdir(join(root, "dist"), { recursive: true });

await build({
  entryPoints: [join(root, "src", "index.ts")],
  outfile,
  bundle: true,
  platform: "node",
  target: "node22",
  format: "esm",
  sourcemap: false,
  logLevel: "info",
  // Workspace package resolves via package exports → TypeScript sources.
  alias: {
    "@ml-aos/shared": join(root, "..", "shared", "src", "index.ts"),
  },
  // Keep optional/heavy tooling external; installer users run agent-browser CLI separately.
  external: ["@playwright/test", "playwright", "playwright-core"],
  banner: {
    js: [
      "import { createRequire as __mlCreateRequire } from 'node:module';",
      "import { fileURLToPath as __mlFileURLToPath } from 'node:url';",
      "import { dirname as __mlDirname } from 'node:path';",
      "const require = __mlCreateRequire(import.meta.url);",
      "const __filename = __mlFileURLToPath(import.meta.url);",
      "const __dirname = __mlDirname(__filename);",
    ].join(""),
  },
});

await writeFile(
  join(root, "dist", "package.json"),
  `${JSON.stringify({ type: "module", private: true, name: "@ml-aos/runtime-bundle" }, null, 2)}\n`,
);

console.log(`runtime bundle -> ${outfile}`);
