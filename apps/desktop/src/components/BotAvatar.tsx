import { botInitial, botPortrait, botTone } from "../lib/bot-style";

type BotLike = { name: string; role: string };

type BotAvatarProps = {
  bot?: BotLike | null;
  large?: boolean;
  status?: "online" | "idle";
  title?: string;
  hidden?: boolean;
};

export function BotAvatar({ bot, large, status, title, hidden }: BotAvatarProps) {
  const src = botPortrait(bot);
  return (
    <span
      className={[
        "agent-avatar",
        `tone-${botTone(bot)}`,
        large ? "lg" : "",
        status ?? "",
      ]
        .filter(Boolean)
        .join(" ")}
      title={title}
      aria-hidden={hidden || undefined}
    >
      {src ? <img src={src} alt="" /> : botInitial(bot)}
    </span>
  );
}
