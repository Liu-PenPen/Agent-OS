import { useEffect, useState } from "react";
import { api } from "../../lib/api";
import type { TicketItem, TicketPipelineStage, TicketProject } from "./ticket-types";

const STAGE_LABEL: Record<TicketPipelineStage, string> = {
  idle: "尚未派发",
  developing: "开发中",
  testing: "测试中",
  reviewing: "审查中",
  completed: "已完成",
  blocked: "已阻塞",
};

const RAIL: TicketPipelineStage[] = [
  "developing",
  "testing",
  "reviewing",
  "completed",
];

function stageStatus(
  current: TicketPipelineStage | undefined,
  step: TicketPipelineStage,
): "done" | "active" | "pending" {
  if (!current || current === "idle") return "pending";
  if (current === "blocked") {
    return step === "developing" ? "active" : "pending";
  }
  if (current === "completed") return "done";
  const order = RAIL.indexOf(step);
  const cur = RAIL.indexOf(current);
  if (cur < 0) return "pending";
  if (order < cur) return "done";
  if (order === cur) return "active";
  return "pending";
}

type TicketStatusPopoverProps = {
  open: boolean;
  project: TicketProject | null;
  ticket: TicketItem | null;
  onClose: () => void;
};

export function TicketStatusPopover({
  open,
  project,
  ticket,
  onClose,
}: TicketStatusPopoverProps) {
  const [acceptance, setAcceptance] = useState<{
    verdict: string;
    summary: string;
    at: string;
    source: string;
    checks: Array<{ title: string; status: string }>;
  } | null>(null);

  useEffect(() => {
    if (!open || !ticket?.topicId) {
      setAcceptance(null);
      return;
    }
    let cancelled = false;
    void api
      .latestAcceptance(ticket.topicId)
      .then((row) => {
        if (!cancelled) setAcceptance(row);
      })
      .catch(() => {
        if (!cancelled) setAcceptance(null);
      });
    return () => {
      cancelled = true;
    };
  }, [open, ticket?.topicId]);

  if (!open) return null;

  const stage = ticket?.pipelineStage ?? "idle";
  const engine = project?.defaultEngine ?? "claude";
  const path = project?.localPath;

  return (
    <div className="ticket-status-layer" role="dialog" aria-label="工单状态">
      <button
        type="button"
        className="ticket-status-backdrop"
        aria-label="关闭"
        onClick={onClose}
      />
      <div className="ticket-status-sheet">
        <header className="ticket-status-head">
          <div>
            <p className="ticket-kicker">工单状态</p>
            <h3>{ticket?.ident ?? "未选择工单"}</h3>
            <p className="muted">{ticket?.title ?? "在列表中点选一张工单"}</p>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="关闭">
            ×
          </button>
        </header>

        <section className="ticket-status-block">
          <h4>流水线</h4>
          {stage === "idle" ? (
            <p className="ticket-empty-hint">尚未派发。交给 CEO 后将在此跟踪阶段。</p>
          ) : (
            <ol className="ticket-rail">
              {RAIL.map((step, index) => {
                const status = stageStatus(stage, step);
                return (
                  <li key={step} className={`ticket-rail-step is-${status}`}>
                    <span className="ticket-rail-index">{index + 1}</span>
                    <span className="ticket-rail-label">{STAGE_LABEL[step]}</span>
                  </li>
                );
              })}
            </ol>
          )}
          {stage !== "idle" ? (
            <p className="ticket-stage-now">
              当前：<strong>{STAGE_LABEL[stage]}</strong>
            </p>
          ) : null}
        </section>

        <section className="ticket-status-block">
          <h4>运行环境</h4>
          <div className="ticket-env-row">
            <span className="ticket-env-label">引擎</span>
            <span className={`ticket-engine is-${engine}`}>
              {engine === "codex" ? "Codex" : "Claude Code"}
            </span>
          </div>
          <div className="ticket-env-row">
            <span className="ticket-env-label">工作目录</span>
            {path ? (
              <code className="ticket-path mono">{path}</code>
            ) : (
              <span className="ticket-warn">未配置 · 请先打开项目配置</span>
            )}
          </div>
          <div className="ticket-env-row">
            <span className="ticket-env-label">验收 URL</span>
            {project?.testBaseUrl ? (
              <code className="ticket-path mono">{project.testBaseUrl}</code>
            ) : (
              <span className="muted">未配置</span>
            )}
          </div>
        </section>

        <section className="ticket-status-block">
          <h4>最近验收</h4>
          {!ticket?.topicId ? (
            <p className="ticket-empty-hint">派发后可在此查看结构化验收结果。</p>
          ) : !acceptance ? (
            <p className="ticket-empty-hint">尚无 submit_acceptance / 套件结果。</p>
          ) : (
            <div className="ticket-acceptance">
              <p>
                <strong className={`ticket-verdict is-${acceptance.verdict}`}>
                  {acceptance.verdict.toUpperCase()}
                </strong>{" "}
                <span className="muted">{acceptance.source}</span>
              </p>
              <p>{acceptance.summary}</p>
              {acceptance.checks.length > 0 ? (
                <ul className="ticket-check-list">
                  {acceptance.checks.slice(0, 8).map((c, i) => (
                    <li key={`${c.title}-${i}`}>
                      [{c.status}] {c.title}
                    </li>
                  ))}
                </ul>
              ) : null}
              <p className="muted mono">{acceptance.at}</p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
