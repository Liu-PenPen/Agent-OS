import { useState } from "react";
import {
  formatChoiceAnswers,
  type ChoiceQuestion,
} from "@ml-aos/shared";

type ChoiceCardProps = {
  questions: ChoiceQuestion[];
  title: string;
  subtitle?: string;
  disabled?: boolean;
  onSubmit: (answer: string) => void;
};

export function ChoiceCard({
  questions,
  title,
  subtitle,
  disabled,
  onSubmit,
}: ChoiceCardProps) {
  const [index, setIndex] = useState(0);
  const [picks, setPicks] = useState<Record<string, string>>({});
  const [custom, setCustom] = useState("");
  const [sent, setSent] = useState(false);
  const current: ChoiceQuestion | undefined = questions[index];

  if (!current || questions.length === 0) return null;

  function choose(optionId: string) {
    if (!current || sent || disabled) return;
    const next = { ...picks, [current.id]: optionId };
    setPicks(next);
    setCustom("");
    if (index < questions.length - 1) {
      setIndex(index + 1);
      return;
    }
    finish(next);
  }

  function finish(next: Record<string, string>) {
    setSent(true);
    onSubmit(formatChoiceAnswers(questions, next));
  }

  function decideCurrent() {
    if (!current) return;
    const recommended =
      current.options.find((o) => o.recommended) ?? current.options[0];
    if (!recommended) return;
    choose(recommended.id);
  }

  function useRecommended() {
    const next = { ...picks };
    for (const q of questions.slice(index)) {
      const recommended =
        q.options.find((o) => o.recommended) ?? q.options[0];
      if (recommended) next[q.id] = recommended.id;
    }
    setPicks(next);
    finish(next);
  }

  function submitCustom() {
    const text = custom.trim();
    if (!text || !current || sent || disabled) return;
    const next = { ...picks, [current.id]: `custom:${text}` };
    const lines = questions.map((q, i) => {
      if (q.id === current.id) return `${i + 1}. ${q.prompt}：${text}`;
      const opt = q.options.find((o) => o.id === next[q.id]);
      return `${i + 1}. ${q.prompt}：${opt?.label ?? "未选"}`;
    });
    setSent(true);
    onSubmit(lines.join("\n"));
  }

  return (
    <section className="lark-card choice-card">
      <header className="lark-card-header">
        <strong>{title}</strong>
        <span>
          {index + 1} / {questions.length}
          {subtitle ? ` · ${subtitle}` : ""}
        </span>
      </header>
      <div className="lark-card-body">
        <p className="lark-card-lead">
          <strong>{current.prompt}</strong>
        </p>
        <p className="muted">选择最符合预期的一项：</p>
        <div className="lark-options">
          {current.options.map((opt, optionIndex) => {
            const markRecommended =
              opt.recommended ||
              (!current.options.some((item) => item.recommended) &&
                optionIndex === 0);
            return (
              <button
                key={opt.id}
                type="button"
                className="lark-option"
                disabled={sent || disabled}
                onClick={() => choose(opt.id)}
              >
                {opt.label}
                {markRecommended && !opt.label.includes("推荐")
                  ? "（推荐）"
                  : ""}
              </button>
            );
          })}
          <button
            type="button"
            className="lark-option"
            disabled={sent || disabled}
            onClick={decideCurrent}
          >
            这题交给智能体
          </button>
        </div>
        <label className="choice-custom">
          <span>都不合适？在这里写下你的答案</span>
          <textarea
            rows={2}
            maxLength={500}
            value={custom}
            disabled={sent || disabled}
            onChange={(e) => setCustom(e.target.value)}
          />
          <span className="choice-count">{custom.length}/500</span>
          <button
            type="button"
            className="lark-option"
            disabled={sent || disabled || !custom.trim()}
            onClick={submitCustom}
          >
            提交自定义答案
          </button>
        </label>
        {questions.length > 1 ? (
          <>
            <p className="lark-card-foot">
              未回答前流程会暂停。不想逐题选择时，可按推荐方案继续。
            </p>
            <button
              type="button"
              className="lark-option lark-option-primary"
              disabled={sent || disabled}
              onClick={useRecommended}
            >
              {sent ? "已提交" : "按推荐方案继续"}
            </button>
          </>
        ) : null}
      </div>
    </section>
  );
}
