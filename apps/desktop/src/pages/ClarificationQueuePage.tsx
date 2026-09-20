import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { ChatMessage } from "@ml-aos/shared";
import { api } from "../lib/api";

export function ClarificationQueuePage() {
  const [items, setItems] = useState<ChatMessage[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    const list = await api.listClarifications("pending");
    setItems(list);
    return list;
  }, []);

  useEffect(() => {
    let cancelled = false;
    refresh()
      .then((list) => {
        if (cancelled) return;
        const first = list[0]?.clarification?.id ?? null;
        setSelectedId(first);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setStatus(err instanceof Error ? err.message : "Failed to load");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [refresh]);

  const selected = items.find((m) => m.clarification?.id === selectedId);

  async function answer(optionId: string) {
    if (!selectedId) return;
    setBusy(true);
    setStatus(null);
    try {
      await api.answerClarification(selectedId, optionId);
      const list = await refresh();
      setSelectedId(list[0]?.clarification?.id ?? null);
      setStatus("Answered");
    } catch (err: unknown) {
      setStatus(err instanceof Error ? err.message : "Answer failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <p className="muted">Queue</p>
          <h1>Pending Confirmations</h1>
          <p className="page-lead">
            Human-in-the-loop clarifications waiting for an answer.
          </p>
        </div>
        <Link className="btn-ghost" to="/">
          Back home
        </Link>
      </header>

      <div className="split-pane">
        <ul className="entity-list">
          {items.map((msg) => {
            const c = msg.clarification;
            if (!c) return null;
            return (
              <li key={c.id}>
                <button
                  type="button"
                  className={`entity-row ${selectedId === c.id ? "active" : ""}`}
                  onClick={() => setSelectedId(c.id)}
                >
                  <strong>{c.prompt.slice(0, 72) || "Clarification"}</strong>
                  <span className="muted">
                    {new Date(msg.createdAt).toLocaleString()}
                  </span>
                </button>
              </li>
            );
          })}
          {items.length === 0 ? (
            <li className="muted empty-hint">No pending clarifications</li>
          ) : null}
        </ul>

        <div className="panel-form">
          {selected?.clarification ? (
            <>
              <h2 className="section-title">Clarification Required</h2>
              <p className="queue-prompt">{selected.clarification.prompt}</p>
              <div className="option-stack">
                {selected.clarification.options.map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    className="option-card"
                    disabled={busy}
                    onClick={() => answer(opt.id)}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </>
          ) : (
            <p className="muted">Select a clarification to answer.</p>
          )}
          {status ? <p className="form-status">{status}</p> : null}
        </div>
      </div>
    </div>
  );
}
