import { useState } from "react";
import type { ChatMessage } from "@ml-aos/shared";

type ClarificationCardProps = {
  message: ChatMessage;
  botName: string;
  botRole?: string;
  onAnswer: (clarificationId: string, optionId: string) => void;
};

export function ClarificationCard({
  message,
  botName,
  botRole,
  onAnswer,
}: ClarificationCardProps) {
  const c = message.clarification;
  const answered = c?.status === "answered";
  const [picked, setPicked] = useState<string | null>(
    c?.selectedOptionId ?? null,
  );

  if (!c) return null;

  return (
    <article className="lark-card clarification-card">
      <header className="lark-card-header">
        <strong>需求确认</strong>
        <span>
          1 / 1
          {botName ? ` · ${botName}` : ""}
          {botRole ? ` · ${botRole}` : ""}
        </span>
      </header>
      <div className="lark-card-body">
        <p className="lark-card-lead">{c.prompt}</p>
        <p className="muted">选择最符合预期的一项：</p>
        <div className="lark-options">
          {c.options.map((opt, index) => {
            const selected = answered
              ? c.selectedOptionId === opt.id
              : picked === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                className={`lark-option ${selected ? "selected" : ""}`}
                disabled={answered}
                onClick={() => {
                  setPicked(opt.id);
                  if (!answered) onAnswer(c.id, opt.id);
                }}
              >
                {opt.label}
                {index === 0 ? "（推荐）" : ""}
              </button>
            );
          })}
        </div>
        {answered ? (
          <p className="lark-card-foot">已按你的选择继续。</p>
        ) : (
          <p className="lark-card-foot">
            点选一项即可提交。推荐项为第一项。
          </p>
        )}
      </div>
    </article>
  );
}
