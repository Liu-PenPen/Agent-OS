import type { BotConfig } from "@ml-aos/shared";

export type BotTone = "ceo" | "dev" | "test" | "review" | "default";

export function botTone(bot: Pick<BotConfig, "name" | "role"> | null | undefined): BotTone {
  const hay = `${bot?.name ?? ""} ${bot?.role ?? ""}`.toLowerCase();
  if (/ceo|orchestrat/.test(hay)) return "ceo";
  if (/dev|code|engineer/.test(hay)) return "dev";
  if (/test|qa/.test(hay)) return "test";
  if (/review|audit|security/.test(hay)) return "review";
  return "default";
}

export function botInitial(bot: Pick<BotConfig, "name" | "role"> | null | undefined): string {
  const name = bot?.name?.trim() || bot?.role?.trim() || "?";
  const letter = name.replace(/^ml[-_\s]*/i, "").charAt(0);
  return (letter || name.charAt(0) || "?").toUpperCase();
}
