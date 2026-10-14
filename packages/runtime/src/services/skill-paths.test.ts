import { describe, it, expect } from "vitest";
import { mkdtemp, mkdir, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  findMissingSkills,
  normalizeSkillIds,
  resolveUserSkillPath,
} from "./skill-paths.js";
import { seedBundledSkills, bundledSkillsRoot } from "./skill-seed.js";
import { existsSync } from "node:fs";

describe("skill-paths", () => {
  it("normalizes and dedupes skill ids", () => {
    expect(
      normalizeSkillIds(["Grill-Me", "grill-me", " !!bad ", "ok", "Has Space"]),
    ).toEqual(["grill-me", "ok"]);
  });

  it("resolves the user skill library and ignores a workspace copy", async () => {
    const home = await mkdtemp(join(tmpdir(), "ml-aos-skill-"));
    const workspace = await mkdtemp(join(tmpdir(), "ml-aos-ws-"));
    const skillDir = join(home, ".agents", "skills", "grill-me");
    await mkdir(skillDir, { recursive: true });
    await writeFile(join(skillDir, "SKILL.md"), "# grill\n", "utf-8");
    await mkdir(join(workspace, ".agents", "skills", "grill-me"), {
      recursive: true,
    });
    await writeFile(
      join(workspace, ".agents", "skills", "grill-me", "SKILL.md"),
      "# workspace\n",
      "utf-8",
    );
    expect(resolveUserSkillPath(home, "grill-me")).toBe(
      join(skillDir, "SKILL.md"),
    );
    expect(resolveUserSkillPath(workspace, "only-in-name")).toBeUndefined();
  });

  it("reports missing skills per bot", async () => {
    const home = await mkdtemp(join(tmpdir(), "ml-aos-miss-"));
    const skillId = "zz-missing-skill-for-test";
    const missing = findMissingSkills(
      [
        {
          name: "产品",
          role: "product",
          enabled: true,
          skills: [skillId],
        },
      ],
      home,
    );
    expect(missing).toEqual([
      { botName: "产品", botRole: "product", skillId },
    ]);
  });
});

describe("skill-seed", () => {
  it("copies bundled skills into workspace without overwrite", async () => {
    expect(existsSync(bundledSkillsRoot())).toBe(true);
    const dir = await mkdtemp(join(tmpdir(), "ml-aos-seed-"));
    const seeded = await seedBundledSkills(dir);
    expect(seeded.length).toBeGreaterThan(0);
    expect(seeded).toContain("grill-me");
    const path = join(dir, ".agents", "skills", "grill-me", "SKILL.md");
    const first = await readFile(path, "utf-8");
    await writeFile(path, "custom\n", "utf-8");
    const again = await seedBundledSkills(dir);
    expect(again).not.toContain("grill-me");
    expect(await readFile(path, "utf-8")).toBe("custom\n");
    expect(first).toContain("Grill Me");
  });
});
