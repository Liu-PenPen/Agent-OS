import type { BotConfig } from "@ml-aos/shared";

export const STAGE_ROLES: Record<"developing" | "testing" | "reviewing", string> =
  {
    developing: "developer",
    testing: "tester",
    reviewing: "reviewer",
  };

export type StageBotIds = {
  developing?: string;
  testing?: string;
  reviewing?: string;
};

export function resolveStageBotIds(
  bots: BotConfig[],
  assigneeBotIds?: string[],
): StageBotIds {
  if (assigneeBotIds) {
    return {
      developing: assigneeBotIds[0],
      testing: assigneeBotIds[1],
      reviewing: assigneeBotIds[2],
    };
  }

  const findEnabledByRole = (role: string): string | undefined => {
    const needle = role.toLowerCase();
    return bots.find(
      (b) => b.enabled && b.role.toLowerCase() === needle,
    )?.id;
  };

  return {
    developing: findEnabledByRole(STAGE_ROLES.developing),
    testing: findEnabledByRole(STAGE_ROLES.testing),
    reviewing: findEnabledByRole(STAGE_ROLES.reviewing),
  };
}
