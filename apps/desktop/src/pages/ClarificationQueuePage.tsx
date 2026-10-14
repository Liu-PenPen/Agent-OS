import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { ChatMessage } from "@ml-aos/shared";
import { api } from "../lib/api";
import { useShell } from "../lib/shell-context";
import { IconAlert } from "../components/shell/icons";
import { AppToolCard, type ControlDecision } from "../components/chat/AppToolCard";

function queueTitle(message: ChatMessage): string {
  if (message.clarification?.prompt) {
    return message.clarification.prompt.slice(0, 72) || "澄清请求";
  }
  if (message.appTool) {
    return (
      message.appTool.title ||
      message.appTool.summary ||
      message.content ||
      "待确认"
    ).slice(0, 72);
  }
  return "待确认";
}

function queueKey(message: ChatMessage): string {
  return message.clarification?.id ?? message.appTool?.token ?? message.id;
}

export function ClarificationQueuePage() {
  const { refreshPending } = useShell();
  const [items, setItems] = useState<ChatMessage[]>([]);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    const list = await api.listClarifications("pending");
    setItems(list);
    // Sync sidebar badge + right-panel toast (shell keeps its own pending cache).
    await refreshPending();
    return list;
  }, [refreshPending]);

  useEffect(() => {
    let cancelled = false;
    refresh()
      .then((list) => {
        if (cancelled) return;
        setSelectedKey(list[0] ? queueKey(list[0]) : null);
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

  const selected = items.find((m) => queueKey(m) === selectedKey);

  async function answerLegacy(optionId: string) {
    const clarificationId = selected?.clarification?.id;
    if (!clarificationId) return;
    setBusy(true);
    setStatus(null);
    try {
      await api.answerClarification(clarificationId, optionId);
      const list = await refresh();
      setSelectedKey(list[0] ? queueKey(list[0]) : null);
      setPicked(null);
      setStatus("已答复");
    } catch (err: unknown) {
      setStatus(err instanceof Error ? err.message : "答复失败");
    } finally {
      setBusy(false);
    }
  }

  async function answerControl(decision: ControlDecision) {
    if (!selected?.topicId) return;
    setBusy(true);
    setStatus(null);
    try {
      await api.answerControl(selected.topicId, decision);
      const list = await refresh();
      setSelectedKey(list[0] ? queueKey(list[0]) : null);
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
          <p className="page-lead">等待人工答复的澄清、方案确认与审批。</p>
        </div>
      </header>

      <div className="split-pane">
        <ul className="entity-list">
          {items.map((msg) => {
            const key = queueKey(msg);
            return (
              <li key={key}>
                <button
                  type="button"
                  className={`entity-row queue-row ${selectedKey === key ? "active" : ""}`}
                  onClick={() => {
                    setSelectedKey(key);
                    setPicked(null);
                  }}
                >
                  <strong>{queueTitle(msg)}</strong>
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
          {selected?.appTool ? (
            <>
              <AppToolCard message={selected} onDecide={(d) => void answerControl(d)} />
              {selected.topicId ? (
                <p className="muted">
                  所属话题：
                  <Link to={`/?topic=${selected.topicId}`}>{selected.topicId}</Link>
                </p>
              ) : null}
            </>
          ) : selected?.clarification ? (
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
                    if (picked) void answerLegacy(picked);
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
