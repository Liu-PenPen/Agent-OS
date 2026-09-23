import { mkdir, readdir, readFile, writeFile, access } from "node:fs/promises";
import { constants } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

/** Bundled default skills shipped with @ml-aos/runtime (agent-os aligned). */
export function bundledSkillsRoot(): string {
  // src/services → ../../skills ; dist/services → ../../skills
  return join(fileURLToPath(new URL("../..", import.meta.url)), "skills");
}

/**
 * Copy missing bundled skills into `<workspace>/.agents/skills/`.
 * Never overwrites an existing SKILL.md (workspace wins).
 */
export async function seedBundledSkills(
  workspaceDir: string,
): Promise<string[]> {
  const root = bundledSkillsRoot();
  if (!(await pathExists(root))) {
    return [];
  }

  const seeded: string[] = [];
  const entries = await readdir(root, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const skillId = entry.name;
    const src = join(root, skillId, "SKILL.md");
    if (!(await pathExists(src))) continue;

    const destDir = join(workspaceDir, ".agents", "skills", skillId);
    const dest = join(destDir, "SKILL.md");
    if (await pathExists(dest)) continue;

    await mkdir(destDir, { recursive: true });
    const body = await readFile(src, "utf-8");
    await writeFile(dest, body, "utf-8");

    // Copy sibling reference files if present (non-destructive).
    const srcDir = dirname(src);
    const siblings = await readdir(srcDir, { withFileTypes: true });
    for (const sib of siblings) {
      if (!sib.isFile() || sib.name === "SKILL.md") continue;
      const sibDest = join(destDir, sib.name);
      if (await pathExists(sibDest)) continue;
      await writeFile(
        sibDest,
        await readFile(join(srcDir, sib.name), "utf-8"),
        "utf-8",
      );
    }

    // Copy references/ folder if present.
    const refSrc = join(srcDir, "references");
    if (await pathExists(refSrc)) {
      const refDest = join(destDir, "references");
      await mkdir(refDest, { recursive: true });
      const refs = await readdir(refSrc, { withFileTypes: true });
      for (const r of refs) {
        if (!r.isFile()) continue;
        const out = join(refDest, r.name);
        if (await pathExists(out)) continue;
        await writeFile(
          out,
          await readFile(join(refSrc, r.name), "utf-8"),
          "utf-8",
        );
      }
    }

    seeded.push(skillId);
  }
  return seeded;
}
