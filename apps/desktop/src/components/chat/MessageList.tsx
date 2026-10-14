import type { BotConfig, ChatMessage } from "@ml-aos/shared";
import { BotAvatar } from "../BotAvatar";
import { botTone } from "../../lib/bot-style";
import { ClarificationCard } from "./ClarificationCard";
import { DispatchCard } from "./LarkCard";
import { MarkdownBody } from "./MarkdownBody";
import { RunCard } from "./RunCard";
import { AppToolCard, type ControlDecision } from "./AppToolCard";

type MessageListProps = {
  messages: ChatMessage[];
  bots: BotConfig[];
  onAnswerClarification: (clarificationId: string, optionId: string) => void;
  onDecideControl: (topicId: string, decision: ControlDecision) => void;
  onAbort?: () => void;
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

function MentionText({ content }: { content: string }) {
  const parts = content.split(/(@我)/g);
  return (
    <p className="mention-line">
      {parts.map((part, index) =>
        part === "@我" ? (
          <span key={index} className="mention">
            @我
          </span>
        ) : (
          <span key={index}>{part}</span>
        ),
      )}
    </p>
  );
}
function handoffCard(
  content: string,
): { from: string; to: string; objective: string; footer: string } | null {
  const toProduct = content.match(/已自动交给\s*(.+?)\s*澄清/);
  if (toProduct) {
    return {
      from: "CEO助理",
      to: toProduct[1] ?? "产品经理",
      objective: "澄清需求并形成可验收的产品方案",
      footer: "完成后，结果会自动交回 CEO助理，并在方案写好后进入开发。",
    };
  }
  if (content.includes("已自动启动开发流水线")) {
    return {
      from: "产品经理",
      to: "开发工程师",
      objective: "按已确认规格实现，并进入测试与审查",
      footer: "开发、测试、审查会按流水线自动交接。",
    };
  }
  return null;
}

function BotBody({
  message,
}: {
  message: ChatMessage;
}) {
  if (!message.content && message.streaming) return null;
  return (
    <MarkdownBody content={message.content} streaming={Boolean(message.streaming)} />
  );
}

export function MessageList({
  messages,
  bots,
  onAnswerClarification,
  onDecideControl,
  onAbort,
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
        if (msg.kind === "app-tool" && msg.appTool) {
          return (
            <article key={msg.id} className="msg msg-card">
              <AppToolCard
                message={msg}
                onDecide={(decision) => onDecideControl(msg.topicId, decision)}
              />
            </article>
          );
        }
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
        if (msg.author === "system") {
          if (msg.content.startsWith("▶")) return null;
          const structured = msg.dispatch;
          const card = structured
            ? {
                from: structured.fromName,
                to: structured.toName,
                objective: structured.objective,
                project: structured.project,
                reportTo: structured.reportToName,
                instruction: structured.instruction,
                expectedOutput: structured.expectedOutput,
              }
            : handoffCard(msg.content);
          if (card) {
            return (
              <article key={msg.id} className="msg msg-card">
                <DispatchCard {...card} />
                <span className="msg-time">{formatTime(msg.createdAt)}</span>
              </article>
            );
          }
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
            <BotAvatar
              bot={meta.bot ?? { name: meta.name, role: meta.role ?? "" }}
              large
              hidden
            />
            <div className="msg-col">
              <div className="msg-meta">
                <strong>{meta.name}</strong>
                {meta.role ? (
                  <span className={`role-pill tone-${botTone(meta.bot)}`}>
                    {meta.role}
                  </span>
                ) : null}
                <span className="msg-time">{formatTime(msg.createdAt)}</span>
              </div>
              <div className="msg-body">
                {msg.kind === "mention" ? (
                  <MentionText content={msg.content} />
                ) : msg.author === "bot" ? (
                  <RunCard message={msg} onAbort={onAbort}>
                    <BotBody message={msg} />
                  </RunCard>
                ) : (
                  msg.content
                )}
              </div>
            </div>
          </article>
        );
      })}
    </div>
  );
}
