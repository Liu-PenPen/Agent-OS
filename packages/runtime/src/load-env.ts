import { readFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";

/** Walk up until pnpm-workspace.yaml (ml-aos repo root). */
export function findWorkspaceRoot(cwd = process.cwd()): string {
  let dir = resolve(cwd);
  for (;;) {
    if (existsSync(resolve(dir, "pnpm-workspace.yaml"))) return dir;
    const parent = dirname(dir);
    if (parent === dir) return resolve(cwd);
    dir = parent;
  }
}

function applyEnvFile(path: string): void {
  const text = readFileSync(path, "utf8");
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}

/**
 * Load `.env` from workspace root (and cwd if different).
 * Sidecar starts runtime with cwd=packages/runtime; credentials live at repo root.
 * Does not override keys already present in process.env.
 */
export function loadDotEnv(cwd = process.cwd()): void {
  const root = findWorkspaceRoot(cwd);
  const candidates = [resolve(root, ".env"), resolve(cwd, ".env")];
  const seen = new Set<string>();
  for (const path of candidates) {
    if (seen.has(path) || !existsSync(path)) continue;
    seen.add(path);
    applyEnvFile(path);
  }
}
