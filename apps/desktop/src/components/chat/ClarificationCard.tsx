import { useState } from "react";
import type { ChatMessage } from "@ml-aos/shared";
import { IconAlert } from "../shell/icons";

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
    <article className="clarification-card">
      <header className="clarification-head">
        <IconAlert />
        <div>
          <h4>需要人工确认</h4>
          <p className="muted">
            由 {botName} 发起
            {botRole ? ` · ${botRole}` : ""}
          </p>
        </div>
      </header>
      <p className="clarification-prompt">{c.prompt}</p>
      <div className="clarification-options">
        {c.options.map((opt) => {
          const selected = answered
            ? c.selectedOptionId === opt.id
            : picked === opt.id;
          return (
            <button
              key={opt.id}
              type="button"
              className={`option-card ${selected ? "selected" : ""}`}
              disabled={answered}
              onClick={() => setPicked(opt.id)}
            >
              <span className="radio-dot" aria-hidden />
              {opt.label}
            </button>
          );
        })}
      </div>
      {answered ? (
        <p className="muted">
          已答复
          {c.selectedOptionId
            ? `：${c.options.find((o) => o.id === c.selectedOptionId)?.label ?? c.selectedOptionId}`
            : ""}
        </p>
      ) : (
        <div className="clarification-actions">
          <button
            type="button"
            className="btn-confirm"
            disabled={!picked}
            onClick={() => {
              if (picked) onAnswer(c.id, picked);
            }}
          >
            确认策略
          </button>
        </div>
      )}
    </article>
  );
}
