import { randomUUID } from "node:crypto";
import type { BotConfig, EngineKind } from "@ml-aos/shared";
import type { JsonStore } from "../store/json-store.js";
import { DEFAULT_TEAM_BOTS } from "../seed/default-bots.js";
import { skillEditorToken } from "./skill-paths.js";
import { SkillLibrary } from "./skill-install.js";

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
  product: ["grill-me", "to-spec"],
  developer: ["to-tickets"],
  tester: ["agent-browser"],
  reviewer: ["code-review-expert"],
};

export class BotService {
  constructor(
    private readonly store: JsonStore,
    private readonly skills = new SkillLibrary({ install: false }),
  ) {}

  async list(): Promise<BotConfig[]> {
    const state = await this.store.load();
    return state.bots.map((b) => ({
      ...b,
      skills: this.skills.refresh(b.skills),
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
      name: input.name,
      role: input.role,
      defaultEngine: input.defaultEngine,
      instructions: input.instructions,
      enabled: input.enabled,
      skills: await this.skills.ensure(input.skills ?? []),
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
    const skillTokens =
      patch.skills !== undefined
        ? patch.skills
        : (current.skills ?? []).map(skillEditorToken);
    const updated: BotConfig = {
      id: current.id,
      name: patch.name ?? current.name,
      role: patch.role ?? current.role,
      defaultEngine: patch.defaultEngine ?? current.defaultEngine,
      instructions: patch.instructions ?? current.instructions,
      enabled: patch.enabled ?? current.enabled,
      skills: await this.skills.ensure(skillTokens),
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
    state.bots = [];
    for (const seed of DEFAULT_TEAM_BOTS) {
      state.bots.push({
        id: randomUUID(),
        ...seed,
        skills: await this.skills.ensure(seed.skills),
      });
    }
    await this.store.save(state);
    return state.bots;
  }

  /** Fill empty skills[] from role defaults (non-destructive). */
  async ensureRoleSkills(): Promise<BotConfig[]> {
    const state = await this.store.load();
    let changed = false;
    for (const bot of state.bots) {
      const existing = bot.skills ?? [];
      const tokens =
        existing.length > 0
          ? existing.map(skillEditorToken)
          : (ROLE_DEFAULT_SKILLS[bot.role.toLowerCase()] ?? []);
      const next = await this.skills.ensure(tokens);
      if (JSON.stringify(next) !== JSON.stringify(existing)) {
        changed = true;
      }
      bot.skills = next;
    }
    if (changed) {
      await this.store.save(state);
    }
    return state.bots.map((b) => ({
      ...b,
      skills: this.skills.refresh(b.skills),
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
