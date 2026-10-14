import type { ReactNode } from "react";

type LarkCardProps = {
  title: string;
  subtitle?: string;
  children: ReactNode;
};

export function LarkCard({ title, subtitle, children }: LarkCardProps) {
  return (
    <section className="lark-card">
      <header className="lark-card-header">
        <strong>{title}</strong>
        {subtitle ? <span>{subtitle}</span> : null}
      </header>
      <div className="lark-card-body">{children}</div>
    </section>
  );
}

export function DispatchCard({
  from,
  to,
  objective,
  project,
  reportTo,
  instruction,
  expectedOutput,
  footer,
}: {
  from: string;
  to: string;
  objective: string;
  project?: string;
  reportTo?: string;
  instruction?: string;
  expectedOutput?: string;
  footer?: string;
}) {
  return (
    <LarkCard title="协作任务已派发" subtitle={`${from} → ${to}`}>
      <p className="lark-card-lead">
        <strong>
          {to}，请接手：{objective}
        </strong>
      </p>
      <div className="lark-card-meta">
        <div>
          <span>项目</span>
          <strong>{project || "当前工作区"}</strong>
        </div>
        <div>
          <span>结果交给</span>
          <strong>{reportTo || from}</strong>
        </div>
      </div>
      {expectedOutput ? (
        <p className="lark-card-foot">期望产出：{expectedOutput}</p>
      ) : footer ? (
        <p className="lark-card-foot">{footer}</p>
      ) : null}
      {instruction ? (
        <details className="run-details">
          <summary>查看任务说明</summary>
          <p>{instruction}</p>
        </details>
      ) : null}
    </LarkCard>
  );
}
