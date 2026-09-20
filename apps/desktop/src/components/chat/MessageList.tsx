import type { BotConfig, ChatMessage } from "@ml-aos/shared";
import { botInitial, botTone } from "../../lib/bot-style";
import { ClarificationCard } from "./ClarificationCard";

type MessageListProps = {
  messages: ChatMessage[];
  bots: BotConfig[];
  onAnswerClarification: (clarificationId: string, optionId: string) => void;
};

function authorLabel(
  message: ChatMessage,
  bots: BotConfig[],
): { name: string; role?: string; bot?: BotConfig } {
  if (message.author === "user") return { name: "我" };
  if (message.author === "system") return { name: "系统" };
  const bot = bots.find((b) => b.id === message.botId);
  return { name: bot?.name ?? "智能体", role: bot?.role, bot };
}

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString("zh-CN", {
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
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
          暂无消息。使用 @ 提及智能体即可开始模拟对话。
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
        if (isYou) {
          return (
            <article key={msg.id} className="msg msg-you">
              <div className="msg-bubble">{msg.content}</div>
              <span className="msg-time">我 · {formatTime(msg.createdAt)}</span>
            </article>
          );
        }
        return (
          <article key={msg.id} className="msg msg-bot">
            <span
              className={`agent-avatar lg tone-${botTone(meta.bot)}`}
              aria-hidden
            >
              {botInitial(meta.bot ?? { name: meta.name, role: meta.role ?? "" })}
            </span>
            <div className="msg-col">
              <div className="msg-meta">
                <strong>{meta.name}</strong>
                {meta.role ? (
                  <span className={`role-pill tone-${botTone(meta.bot)}`}>
                    {meta.role}
                  </span>
                ) : null}
              </div>
              <div className="msg-body">
                {msg.content || (msg.author === "bot" ? "…" : "")}
              </div>
              <span className="msg-time">{formatTime(msg.createdAt)}</span>
            </div>
          </article>
        );
      })}
    </div>
  );
}
