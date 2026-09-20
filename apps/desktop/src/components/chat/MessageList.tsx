import type { BotConfig, ChatMessage } from "@ml-aos/shared";
import { ClarificationCard } from "./ClarificationCard";

type MessageListProps = {
  messages: ChatMessage[];
  bots: BotConfig[];
  onAnswerClarification: (clarificationId: string, optionId: string) => void;
};

function authorLabel(
  message: ChatMessage,
  bots: BotConfig[],
): { name: string; role?: string } {
  if (message.author === "user") return { name: "You" };
  if (message.author === "system") return { name: "System" };
  const bot = bots.find((b) => b.id === message.botId);
  return { name: bot?.name ?? "Bot", role: bot?.role };
}

export function MessageList({
  messages,
  bots,
  onAnswerClarification,
}: MessageListProps) {
  if (messages.length === 0) {
    return (
      <div className="timeline">
        <p className="muted empty-hint">
          No messages yet. Mention a bot with @ to start a mock stream.
        </p>
      </div>
    );
  }

  return (
    <div className="timeline">
      {messages.map((msg) => {
        const meta = authorLabel(msg, bots);
        const isYou = msg.author === "user";
        if (msg.kind === "clarification" && msg.clarification) {
          return (
            <ClarificationCard
              key={msg.id}
              message={msg}
              botName={meta.name}
              botRole={meta.role}
              onAnswer={onAnswerClarification}
            />
          );
        }
        return (
          <article
            key={msg.id}
            className={`message ${isYou ? "message-you" : "message-bot"}`}
          >
            <div className="message-meta">
              <strong>{meta.name}</strong>
              {meta.role ? <span className="role-badge">{meta.role}</span> : null}
            </div>
            <p>{msg.content || (msg.author === "bot" ? "…" : "")}</p>
          </article>
        );
      })}
    </div>
  );
}
