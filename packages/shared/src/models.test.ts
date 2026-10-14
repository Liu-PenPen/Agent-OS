import { describe, it, expect } from "vitest";
import {
  AppSettingsSchema,
  BotConfigSchema,
  UserSchema,
  StoredUserSchema,
} from "./models.js";

describe("AppSettingsSchema", () => {
  it("defaults theme to dark when parsing partial", () => {
    const parsed = AppSettingsSchema.parse({
      theme: "dark",
      defaultEngine: "mock",
      dataDir: "C:/tmp/ml-aos",
      notifications: true,
    });
    expect(parsed.theme).toBe("dark");
  });
});

describe("BotConfigSchema", () => {
  it("loads a legacy skill id as a binding", () => {
    const bot = BotConfigSchema.parse({
      id: "b1",
      name: "产品",
      role: "product",
      defaultEngine: "claude",
      instructions: "",
      enabled: true,
      skills: ["grill-me"],
    });
    expect(bot.skills?.[0]).toMatchObject({
      id: "grill-me",
      source: "grill-me",
      status: "failed",
    });
  });
});

describe("UserSchema", () => {
  it("parses valid user and stored user", () => {
    const user = {
      id: "u1",
      username: "alice",
      email: "alice@example.com",
      createdAt: new Date().toISOString(),
    };
    expect(UserSchema.parse(user).username).toBe("alice");

    const storedUser = {
      ...user,
      passwordHash: "hash123",
      salt: "salt123",
    };
    expect(StoredUserSchema.parse(storedUser).passwordHash).toBe("hash123");
  });
});
