import { randomUUID } from "node:crypto";
import type { BotConfig, EngineKind } from "@ml-aos/shared";
import type { JsonStore } from "../store/json-store.js";

export interface CreateBotInput {
  name: string;
  role: string;
  defaultEngine: EngineKind;
  instructions: string;
  enabled: boolean;
}

export type UpdateBotInput = Partial<CreateBotInput>;

export class BotService {
  constructor(private readonly store: JsonStore) {}

  async list(): Promise<BotConfig[]> {
    const state = await this.store.load();
    return state.bots;
  }

  async get(id: string): Promise<BotConfig | undefined> {
    const state = await this.store.load();
    return state.bots.find((b) => b.id === id);
  }

  async create(input: CreateBotInput): Promise<BotConfig> {
    const state = await this.store.load();
    const bot: BotConfig = {
      id: randomUUID(),
      ...input,
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

    const updated: BotConfig = {
      ...state.bots[index],
      ...patch,
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
}
