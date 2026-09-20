import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { SettingsService } from "./settings-service.js";
import { JsonStore } from "../store/json-store.js";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

describe("SettingsService", () => {
  let dir: string;
  let service: SettingsService;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "ml-aos-settings-"));
    service = new SettingsService(new JsonStore(dir));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("returns default settings and patches theme", async () => {
    const initial = await service.get();
    expect(initial.theme).toBe("dark");

    const updated = await service.update({ theme: "light" });
    expect(updated.theme).toBe("light");

    const again = await service.get();
    expect(again.theme).toBe("light");
  });
});
