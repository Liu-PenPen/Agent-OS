import { copyFile, mkdir, readdir, stat } from "node:fs/promises";
import { extname, join, relative, resolve } from "node:path";
import { randomUUID } from "node:crypto";

const SKIP = new Set(["node_modules", ".git", "dist", "target"]);
const IMAGE = new Set([".png", ".jpg", ".jpeg", ".webp"]);

async function walk(
  root: string,
  dir: string,
  depth: number,
  found: string[],
): Promise<void> {
  if (depth > 4 || found.length > 40) return;
  let names: string[] = [];
  try {
    names = await readdir(dir);
  } catch {
    return;
  }
  for (const name of names) {
    if (SKIP.has(name)) continue;
    const full = join(dir, name);
    let info;
    try {
      info = await stat(full);
    } catch {
      continue;
    }
    if (info.isDirectory()) {
      await walk(root, full, depth + 1, found);
      continue;
    }
    if (!IMAGE.has(extname(name).toLowerCase())) continue;
    if (Date.now() - info.mtimeMs > 2 * 60 * 60 * 1000) continue;
    const rel = relative(root, full);
    if (rel.startsWith("..")) continue;
    found.push(full);
  }
}

/** Latest screenshot written in the workspace during this run, if any. */
export async function findLatestScreenshot(
  workspacePath: string,
): Promise<string | undefined> {
  const root = resolve(workspacePath);
  const found: string[] = [];
  await walk(root, root, 0, found);
  if (found.length === 0) return undefined;
  const ranked = await Promise.all(
    found.map(async (file) => ({ file, mtime: (await stat(file)).mtimeMs })),
  );
  ranked.sort((a, b) => b.mtime - a.mtime);
  return ranked[0]?.file;
}

export async function copyScreenshot(
  source: string,
  mediaDir: string,
): Promise<string> {
  await mkdir(mediaDir, { recursive: true });
  const name = `${randomUUID()}${extname(source).toLowerCase() || ".png"}`;
  await copyFile(source, join(mediaDir, name));
  return name;
}
