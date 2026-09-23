import { useEffect, useState } from "react";
import { api } from "../../lib/api";
import type { TicketIssueState } from "./board-types";
import type { TicketItem } from "./ticket-types";

type TicketStatePickerProps = {
  open: boolean;
  projectId: string | null;
  ticket: TicketItem | null;
  onClose: () => void;
  onApplied: (stateTitle: string) => void;
};

export function TicketStatePicker({
  open,
  projectId,
  ticket,
  onClose,
  onApplied,
}: TicketStatePickerProps) {
  const [states, setStates] = useState<TicketIssueState[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);

  useEffect(() => {
    if (!open || !projectId || !ticket) {
      setStates([]);
      setSelectedId(null);
      setError(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    setSelectedId(null);
    void api
      .listTicketIssueStates(projectId, ticket.id)
      .then((list) => {
        if (cancelled) return;
        setStates(list);
        const match = list.find((s) => s.title === ticket.stateTitle);
        setSelectedId(match?.id ?? list[0]?.id ?? null);
      })
      .catch((err) => {
        if (!cancelled) {
          setStates([]);
          setError(err instanceof Error ? err.message : "加载状态失败");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, projectId, ticket?.id, ticket?.stateTitle]);

  if (!open) return null;

  async function handleConfirm() {
    if (!projectId || !ticket || selectedId == null) return;
    setSaving(true);
    setError(null);
    try {
      const result = await api.updateTicketIssueState(
        projectId,
        ticket.id,
        selectedId,
      );
      onApplied(result.stateTitle);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "更新状态失败");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="ticket-status-layer" role="dialog" aria-label="改状态">
      <button
        type="button"
        className="ticket-status-backdrop"
        aria-label="关闭"
        onClick={onClose}
      />
      <div className="ticket-status-sheet ticket-state-sheet">
        <header className="ticket-status-head">
          <div>
            <p className="ticket-kicker">改状态</p>
            <h3>{ticket?.ident ?? "未选择工单"}</h3>
            <p className="muted">{ticket?.title ?? ""}</p>
          </div>
          <button
            type="button"
            className="icon-btn"
            onClick={onClose}
            aria-label="关闭"
          >
            ×
          </button>
        </header>

        <section className="ticket-status-block">
          {loading ? (
            <div className="ticket-loading" role="status" aria-live="polite">
              <span className="ticket-loading-spinner" aria-hidden />
              <p>加载可用状态…</p>
            </div>
          ) : error && states.length === 0 ? (
            <p className="ticket-state-error" role="alert">
              {error}
            </p>
          ) : states.length === 0 ? (
            <p className="ticket-empty-hint">暂无可用状态。</p>
          ) : (
            <ul className="ticket-state-list" role="radiogroup" aria-label="目标状态">
              {states.map((state) => {
                const checked = selectedId === state.id;
                return (
                  <li key={state.id}>
                    <label
                      className={
                        checked
                          ? "ticket-state-option is-selected"
                          : "ticket-state-option"
                      }
                    >
                      <input
                        type="radio"
                        name="ticket-issue-state"
                        value={state.id}
                        checked={checked}
                        onChange={() => setSelectedId(state.id)}
                      />
                      <span>{state.title}</span>
                    </label>
                  </li>
                );
              })}
            </ul>
          )}
          {error && states.length > 0 ? (
            <p className="ticket-state-error" role="alert">
              {error}
            </p>
          ) : null}
        </section>

        <div className="ticket-config-actions">
          <button type="button" className="btn-ghost" onClick={onClose}>
            取消
          </button>
          <button
            type="button"
            className="btn-primary"
            disabled={loading || saving || selectedId == null || states.length === 0}
            onClick={() => void handleConfirm()}
          >
            {saving ? "同步中…" : "确认"}
          </button>
        </div>
      </div>
    </div>
  );
}
