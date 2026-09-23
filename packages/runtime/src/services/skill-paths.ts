import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const SKILL_NAME_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;

export function normalizeSkillIds(skills: string[] | undefined): string[] {
  if (!skills?.length) return [];
  const out: string[] = [];
  for (const raw of skills) {
    const id = raw.trim().toLowerCase();
    if (!id || !SKILL_NAME_RE.test(id)) continue;
    if (!out.includes(id)) out.push(id);
  }
  return out;
}

/** Resolve SKILL.md path for a skill under a workspace (agent-os order). */
export function resolveSkillPath(
  workspaceDir: string,
  skillId: string,
): string | undefined {
  const candidates = [
    join(workspaceDir, ".agents", "skills", skillId, "SKILL.md"),
    join(workspaceDir, ".claude", "skills", skillId, "SKILL.md"),
    join(homedir(), ".agents", "skills", skillId, "SKILL.md"),
    join(homedir(), ".claude", "skills", skillId, "SKILL.md"),
    join(homedir(), ".codex", "skills", skillId, "SKILL.md"),
  ];
  return candidates.find((p) => existsSync(p));
}

export type MissingSkill = {
  botName: string;
  botRole: string;
  skillId: string;
};

export function findMissingSkills(
  bots: Array<{ name: string; role: string; enabled: boolean; skills?: string[] }>,
  workspaceDir: string,
): MissingSkill[] {
  const missing: MissingSkill[] = [];
  for (const bot of bots) {
    if (!bot.enabled) continue;
    for (const skillId of normalizeSkillIds(bot.skills)) {
      if (!resolveSkillPath(workspaceDir, skillId)) {
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
