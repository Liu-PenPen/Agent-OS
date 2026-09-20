import type { AppSettings, ThemeMode, EngineKind } from "@ml-aos/shared";
import type { JsonStore } from "../store/json-store.js";

export type UpdateSettingsInput = Partial<{
  theme: ThemeMode;
  defaultEngine: EngineKind;
  dataDir: string;
  notifications: boolean;
}>;

export class SettingsService {
  constructor(private readonly store: JsonStore) {}

  async get(): Promise<AppSettings> {
    const state = await this.store.load();
    return state.settings;
  }

  async update(patch: UpdateSettingsInput): Promise<AppSettings> {
    const state = await this.store.load();
    state.settings = {
      ...state.settings,
      ...patch,
    };
    await this.store.save(state);
    return state.settings;
  }
}
