import { randomUUID } from "node:crypto";
import type { BotConfig, EngineKind } from "@ml-aos/shared";
import type { JsonStore } from "../store/json-store.js";
import { DEFAULT_TEAM_BOTS } from "../seed/default-bots.js";
import { normalizeSkillIds } from "./skill-paths.js";

export interface CreateBotInput {
  name: string;
  role: string;
  defaultEngine: EngineKind;
  instructions: string;
  enabled: boolean;
  skills?: string[];
}

export type UpdateBotInput = Partial<CreateBotInput>;

const ROLE_DEFAULT_SKILLS: Record<string, string[]> = {
  product: ["grill-me", "product-spec"],
  developer: ["implement-ticket", "log-patrol"],
  tester: ["agent-browser"],
  reviewer: ["code-review-expert"],
};

function withSkills(input: CreateBotInput): Omit<BotConfig, "id"> {
  const roleKey = input.role.trim().toLowerCase();
  const skills = normalizeSkillIds(
    input.skills ?? ROLE_DEFAULT_SKILLS[roleKey] ?? [],
  );
  return {
    name: input.name,
    role: input.role,
    defaultEngine: input.defaultEngine,
    instructions: input.instructions,
    enabled: input.enabled,
    skills,
  };
}

export class BotService {
  constructor(private readonly store: JsonStore) {}

  async list(): Promise<BotConfig[]> {
    const state = await this.store.load();
    return state.bots.map((b) => ({
      ...b,
      skills: normalizeSkillIds(b.skills),
    }));
  }

  async get(id: string): Promise<BotConfig | undefined> {
    const bots = await this.list();
    return bots.find((b) => b.id === id);
  }

  async create(input: CreateBotInput): Promise<BotConfig> {
    const state = await this.store.load();
    const bot: BotConfig = {
      id: randomUUID(),
      ...withSkills(input),
    };
    state.bots.push(bot);
    await this.store.save(state);
    return bot;
  }

  async update(id: string, patch: UpdateBotInput): Promise<BotConfig> {
    const state = await this.store.load();
    const index = state.bots.findIndex((b) => b.id === id);
    if (index === -1) {
      throw new Error(`Bot not found: ${id}`);
    }

    const current = state.bots[index];
    const merged: CreateBotInput = {
      name: patch.name ?? current.name,
      role: patch.role ?? current.role,
      defaultEngine: patch.defaultEngine ?? current.defaultEngine,
      instructions: patch.instructions ?? current.instructions,
      enabled: patch.enabled ?? current.enabled,
      skills:
        patch.skills !== undefined
          ? patch.skills
          : (current.skills ?? []),
    };
    const updated: BotConfig = {
      id: current.id,
      ...withSkills(merged),
    };
    state.bots[index] = updated;
    await this.store.save(state);
    return updated;
  }

  async delete(id: string): Promise<void> {
    const state = await this.store.load();
    const index = state.bots.findIndex((b) => b.id === id);
    if (index === -1) {
      throw new Error(`Bot not found: ${id}`);
    }
    state.bots.splice(index, 1);
    await this.store.save(state);
  }

  /**
   * Replace all bots with the agent-os-aligned default team
   * (CEO / product / developer / tester / reviewer).
   */
  async seedDefaultTeam(): Promise<BotConfig[]> {
    const state = await this.store.load();
    state.bots = DEFAULT_TEAM_BOTS.map((seed) => ({
      id: randomUUID(),
      ...seed,
      skills: normalizeSkillIds(seed.skills),
    }));
    await this.store.save(state);
    return state.bots;
  }

  /** Fill empty skills[] from role defaults (non-destructive). */
  async ensureRoleSkills(): Promise<BotConfig[]> {
    const state = await this.store.load();
    let changed = false;
    for (const bot of state.bots) {
      const existing = normalizeSkillIds(bot.skills);
      if (existing.length > 0) {
        bot.skills = existing;
        continue;
      }
      const fallback = ROLE_DEFAULT_SKILLS[bot.role.toLowerCase()];
      if (!fallback?.length) {
        bot.skills = [];
        continue;
      }
      bot.skills = [...fallback];
      changed = true;
    }
    if (changed) {
      await this.store.save(state);
    }
    return state.bots.map((b) => ({
      ...b,
      skills: normalizeSkillIds(b.skills),
    }));
  }

  /**
   * Ensure agent-os-aligned team is present.
   * Reseeds when pipeline roles are missing, roster is too small, or legacy
   * SmokeBot/Dev-style names are still around.
   */
  async ensurePipelineTeam(): Promise<BotConfig[]> {
    const bots = await this.list();
    const enabled = bots.filter((b) => b.enabled);
    const roles = new Set(enabled.map((b) => b.role.toLowerCase()));
    const needed = ["ceo", "product", "developer", "tester", "reviewer"];
    const names = new Set(enabled.map((b) => b.name.toLowerCase()));
    const legacy =
      names.has("smokebot") ||
      names.has("dev") ||
      (names.has("smoke") && enabled.length < needed.length);

    if (
      !legacy &&
      enabled.length >= needed.length &&
      needed.every((r) => roles.has(r))
    ) {
      return this.ensureRoleSkills();
    }
    return this.seedDefaultTeam();
  }
}
