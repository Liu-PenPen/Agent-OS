import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { SkillBinding } from "@ml-aos/shared";
import { parseSkillToken } from "./skill-catalog.js";

const SKILL_NAME_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;

export function normalizeSkillIds(
  skills: Array<string | SkillBinding> | undefined,
): string[] {
  if (!skills?.length) return [];
  const out: string[] = [];
  for (const raw of skills) {
    const id =
      typeof raw === "string"
        ? raw.trim().toLowerCase()
        : raw.id.trim().toLowerCase();
    if (!id || !SKILL_NAME_RE.test(id)) continue;
    if (!out.includes(id)) out.push(id);
  }
  return out;
}

/** Resolve SKILL.md from the user skill library. Workspace copies are ignored. */
export function resolveUserSkillPath(
  homeDir: string,
  skillId: string,
): string | undefined {
  const id = skillId.trim().toLowerCase();
  if (!id || !SKILL_NAME_RE.test(id)) return undefined;
  const candidates = [
    join(homeDir, ".agents", "skills", id, "SKILL.md"),
    join(homeDir, ".claude", "skills", id, "SKILL.md"),
    join(homeDir, ".codex", "skills", id, "SKILL.md"),
  ];
  return candidates.find((p) => existsSync(p));
}

export function skillEditorToken(skill: string | SkillBinding): string {
  if (typeof skill === "string") return skill.trim();
  if (skill.source.includes("@")) return skill.source;
  return skill.id;
}

export type MissingSkill = {
  botName: string;
  botRole: string;
  skillId: string;
};

export function findMissingSkills(
  bots: Array<{
    name: string;
    role: string;
    enabled: boolean;
    skills?: Array<string | SkillBinding>;
  }>,
  homeDir = homedir(),
): MissingSkill[] {
  const missing: MissingSkill[] = [];
  for (const bot of bots) {
    if (!bot.enabled) continue;
    for (const skill of bot.skills ?? []) {
      const parsed = parseSkillToken(
        typeof skill === "string" ? skill : skill.id,
      );
      const skillId = parsed?.id ?? (typeof skill === "string" ? skill : skill.id);
      if (!parsed || !resolveUserSkillPath(homeDir, parsed.id)) {
        missing.push({
          botName: bot.name,
          botRole: bot.role,
          skillId,
        });
      }
    }
  }
  return missing;
}
