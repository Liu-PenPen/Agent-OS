import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import type { BotConfig, EngineKind } from "@ml-aos/shared";
import { api } from "../lib/api";

const ENGINES: EngineKind[] = ["mock", "claude", "codex"];

const EMPTY_DRAFT = {
  name: "",
  role: "",
  defaultEngine: "mock" as EngineKind,
  instructions: "",
  enabled: true,
};

export function BotSettingsPage() {
  const [bots, setBots] = useState<BotConfig[]>([]);
  const [selectedId, setSelectedId] = useState<string | "new" | null>(null);
  const [draft, setDraft] = useState(EMPTY_DRAFT);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    const list = await api.listBots();
    setBots(list);
    return list;
  }, []);

  useEffect(() => {
    let cancelled = false;
    refresh()
      .then((list) => {
        if (cancelled) return;
        if (list[0]) {
          setSelectedId(list[0].id);
          setDraft({
            name: list[0].name,
            role: list[0].role,
            defaultEngine: list[0].defaultEngine,
            instructions: list[0].instructions,
            enabled: list[0].enabled,
          });
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setStatus(err instanceof Error ? err.message : "加载智能体失败");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [refresh]);

  function selectBot(bot: BotConfig) {
    setSelectedId(bot.id);
    setDraft({
      name: bot.name,
      role: bot.role,
      defaultEngine: bot.defaultEngine,
      instructions: bot.instructions,
      enabled: bot.enabled,
    });
    setStatus(null);
  }

  function startCreate() {
    setSelectedId("new");
    setDraft(EMPTY_DRAFT);
    setStatus(null);
  }

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setStatus(null);
    try {
      const payload = {
        name: draft.name.trim(),
        role: draft.role.trim(),
        defaultEngine: draft.defaultEngine,
        instructions: draft.instructions,
        enabled: draft.enabled,
      };
      const bot =
        selectedId && selectedId !== "new"
          ? await api.updateBot(selectedId, payload)
          : await api.createBot(payload);
      const list = await refresh();
      const next = list.find((b) => b.id === bot.id) ?? bot;
      selectBot(next);
      setStatus("已保存");
    } catch (err: unknown) {
      setStatus(err instanceof Error ? err.message : "保存失败");
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    if (!selectedId || selectedId === "new") return;
    if (!window.confirm("确定删除该智能体？")) return;
    setBusy(true);
    setStatus(null);
    try {
      await api.deleteBot(selectedId);
      const list = await refresh();
      if (list[0]) {
        selectBot(list[0]);
      } else {
        startCreate();
      }
      setStatus("已删除");
    } catch (err: unknown) {
      setStatus(err instanceof Error ? err.message : "删除失败");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <p className="muted">智能体</p>
          <h1>智能体配置</h1>
          <p className="page-lead">为每个智能体定义角色、引擎与指令。</p>
        </div>
        <div className="form-actions">
          <button type="button" className="btn-primary" onClick={startCreate}>
            + 新增智能体配置
          </button>
          <Link className="btn-ghost" to="/">
            返回工作台
          </Link>
        </div>
      </header>

      <div className="split-pane">
        <ul className="entity-list">
          {bots.map((bot) => (
            <li key={bot.id}>
              <button
                type="button"
                className={`entity-row ${selectedId === bot.id ? "active" : ""}`}
                onClick={() => selectBot(bot)}
              >
                <strong>{bot.name}</strong>
                <span className="muted">
                  {bot.role} · {bot.defaultEngine}
                  {!bot.enabled ? " · 已关闭" : ""}
                </span>
              </button>
            </li>
          ))}
          {bots.length === 0 ? (
            <li className="muted empty-hint">暂无智能体</li>
          ) : null}
        </ul>

        <form className="panel-form" onSubmit={handleSave}>
          <label className="field">
            <span>名称</span>
            <input
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              required
            />
          </label>
          <label className="field">
            <span>角色</span>
            <input
              value={draft.role}
              onChange={(e) => setDraft({ ...draft, role: e.target.value })}
              placeholder="例如：developer、tester、reviewer"
              required
            />
            <span className="field-hint muted">
              真实流水线按角色匹配阶段负责人：
              <code>developer</code>（开发）/ <code>tester</code>（测试）/{" "}
              <code>reviewer</code>（审查）。请各配置至少一名已启用的同名角色智能体。
            </span>
          </label>
          <label className="field">
            <span>默认引擎</span>
            <select
              value={draft.defaultEngine}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  defaultEngine: e.target.value as EngineKind,
                })
              }
            >
              {ENGINES.map((engine) => (
                <option key={engine} value={engine}>
                  {engine}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>系统指令</span>
            <textarea
              rows={8}
              value={draft.instructions}
              onChange={(e) =>
                setDraft({ ...draft, instructions: e.target.value })
              }
              placeholder="角色提示词与行为约束…"
            />
          </label>
          <label className="field checkbox-field">
            <input
              type="checkbox"
              checked={draft.enabled}
              onChange={(e) =>
                setDraft({ ...draft, enabled: e.target.checked })
              }
            />
            <span>已启用</span>
          </label>

          {status ? <p className="form-status">{status}</p> : null}

          <div className="form-actions">
            {selectedId && selectedId !== "new" ? (
              <button
                type="button"
                className="btn-ghost danger"
                disabled={busy}
                onClick={handleDelete}
              >
                删除智能体
              </button>
            ) : null}
            <button type="submit" className="btn-primary" disabled={busy}>
              {busy ? "保存中…" : "保存更改"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
