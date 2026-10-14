import { describe, it, expect } from "vitest";
import type { BotConfig } from "@ml-aos/shared";
import { STAGE_ROLES, resolveStageBotIds } from "./pipeline-bots.js";

function bot(partial: Partial<BotConfig> & Pick<BotConfig, "id" | "role">): BotConfig {
  return {
    name: partial.name ?? partial.id,
    defaultEngine: "claude",
    instructions: "",
    enabled: true,
    ...partial,
  };
}

describe("STAGE_ROLES", () => {
  it("maps pipeline stages to bot roles", () => {
    expect(STAGE_ROLES.developing).toBe("developer");
    expect(STAGE_ROLES.testing).toBe("tester");
    expect(STAGE_ROLES.reviewing).toBe("reviewer");
  });
});

describe("resolveStageBotIds", () => {
  it("maps enabled bots by role (case-insensitive)", () => {
    const bots = [
      bot({ id: "dev-1", role: "Developer" }),
      bot({ id: "test-1", role: "TESTER" }),
      bot({ id: "rev-1", role: "reviewer" }),
      bot({ id: "dev-disabled", role: "developer", enabled: false }),
    ];

    expect(resolveStageBotIds(bots)).toEqual({
      developing: "dev-1",
      testing: "test-1",
      reviewing: "rev-1",
    });
  });

  it("leaves stage undefined when no enabled bot matches role", () => {
    const bots = [bot({ id: "dev-1", role: "developer" })];

    expect(resolveStageBotIds(bots)).toEqual({
      developing: "dev-1",
      testing: undefined,
      reviewing: undefined,
    });
  });

  it("respects assigneeBotIds override", () => {
    const bots = [
      bot({ id: "dev-1", role: "developer" }),
      bot({ id: "test-1", role: "tester" }),
      bot({ id: "rev-1", role: "reviewer" }),
    ];

    expect(
      resolveStageBotIds(bots, ["override-dev", "override-test", "override-rev"]),
    ).toEqual({
      developing: "override-dev",
      testing: "override-test",
      reviewing: "override-rev",
    });
  });

  it("picks the first enabled bot when multiple match a role", () => {
    const bots = [
      bot({ id: "dev-1", role: "developer" }),
      bot({ id: "dev-2", role: "developer" }),
    ];

    expect(resolveStageBotIds(bots).developing).toBe("dev-1");
  });
});
