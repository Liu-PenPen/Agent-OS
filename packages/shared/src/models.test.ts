import { describe, it, expect } from "vitest";
import { AppSettingsSchema } from "./models.js";

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
