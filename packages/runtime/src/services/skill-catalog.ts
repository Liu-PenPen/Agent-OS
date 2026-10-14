const SKILL_NAME_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;

/**
 * Public install coordinates (`npx skills add <source> -g -y`).
 * Pipeline skills without a coordinate are installed from the app bundle
 * into the user skill library.
 */
export const UPSTREAM_SKILLS: Record<string, string> = {
  "grill-me": "mattpocock/skills@grill-me",
  "agent-browser": "vercel-labs/agent-browser@agent-browser",
};

export interface ParsedSkillToken {
  id: string;
  source: string;
}

/** Accept a skill id or `owner/repo@skill`. */
export function parseSkillToken(raw: string): ParsedSkillToken | undefined {
  const text = raw.trim();
  if (!text || /\s/.test(text)) return undefined;

  const at = text.lastIndexOf("@");
  if (at > 0) {
    const repo = text.slice(0, at);
    const id = text.slice(at + 1).trim().toLowerCase();
    if (!repo.includes("/") || repo.includes("@")) return undefined;
    if (!SKILL_NAME_RE.test(id)) return undefined;
    return { id, source: `${repo}@${id}` };
  }

  const id = text.toLowerCase();
  if (!SKILL_NAME_RE.test(id)) return undefined;
  return { id, source: UPSTREAM_SKILLS[id] ?? id };
}
