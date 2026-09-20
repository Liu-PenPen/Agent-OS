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
  if (!c) return null;

  const answered = c.status === "answered";

  return (
    <article className="message message-bot clarification-card">
      <div className="message-meta">
        <strong>{botName}</strong>
        {botRole ? <span className="role-badge">{botRole}</span> : null}
        <span className="status-chip status-needs_you">needs you</span>
      </div>
      <p className="clarification-prompt">{c.prompt}</p>
      <div className="clarification-options">
        {c.options.map((opt) => {
          const selected = c.selectedOptionId === opt.id;
          return (
            <button
              key={opt.id}
              type="button"
              className={`option-card ${selected ? "selected" : ""}`}
              disabled={answered}
              onClick={() => onAnswer(c.id, opt.id)}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
      {answered ? (
        <p className="muted">
          Answered
          {c.selectedOptionId
            ? `: ${c.options.find((o) => o.id === c.selectedOptionId)?.label ?? c.selectedOptionId}`
            : ""}
        </p>
      ) : null}
    </article>
  );
}
