import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { ChatMessage } from "@ml-aos/shared";
import { api } from "../lib/api";
import { IconAlert } from "../components/shell/icons";

export function ClarificationQueuePage() {
  const [items, setItems] = useState<ChatMessage[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
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
        setPicked(null);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setStatus(err instanceof Error ? err.message : "加载失败");
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
      setPicked(null);
      setStatus("已答复");
    } catch (err: unknown) {
      setStatus(err instanceof Error ? err.message : "答复失败");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <p className="muted">队列</p>
          <h1>待确认事项</h1>
          <p className="page-lead">等待人工答复的智能体澄清请求。</p>
        </div>
        <Link className="btn-ghost" to="/">
          返回首页
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
                  className={`entity-row queue-row ${selectedId === c.id ? "active" : ""}`}
                  onClick={() => {
                    setSelectedId(c.id);
                    setPicked(null);
                  }}
                >
                  <strong>{c.prompt.slice(0, 72) || "澄清请求"}</strong>
                  <span className="muted">
                    {new Date(msg.createdAt).toLocaleString("zh-CN")}
                  </span>
                </button>
              </li>
            );
          })}
          {items.length === 0 ? (
            <li className="muted empty-hint">暂无待确认项</li>
          ) : null}
        </ul>

        <div className="panel-form queue-detail">
          {selected?.clarification ? (
            <>
              <header className="clarification-head">
                <IconAlert />
                <div>
                  <h2 className="section-title">需要澄清</h2>
                  <p className="muted">选择策略后确认。</p>
                </div>
              </header>
              <p className="queue-prompt">{selected.clarification.prompt}</p>
              <div className="option-stack">
                {selected.clarification.options.map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    className={`option-card ${picked === opt.id ? "selected" : ""}`}
                    disabled={busy}
                    onClick={() => setPicked(opt.id)}
                  >
                    <span className="radio-dot" aria-hidden />
                    {opt.label}
                  </button>
                ))}
              </div>
              <div className="form-actions">
                <button
                  type="button"
                  className="btn-confirm"
                  disabled={busy || !picked}
                  onClick={() => {
                    if (picked) void answer(picked);
                  }}
                >
                  确认策略
                </button>
              </div>
            </>
          ) : (
            <p className="muted">请选择一条澄清请求进行答复。</p>
          )}
          {status ? <p className="form-status">{status}</p> : null}
        </div>
      </div>
    </div>
  );
}
