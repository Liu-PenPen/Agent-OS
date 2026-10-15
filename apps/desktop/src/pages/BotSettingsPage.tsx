import { useCallback, useEffect, useState, type FormEvent } from "react";
import type { BotConfig, EngineKind, SkillBinding } from "@ml-aos/shared";
import { api } from "../lib/api";

const ENGINES: EngineKind[] = ["claude", "codex"];

function skillViews(
  skills: Array<string | SkillBinding> | undefined,
): Array<{ key: string; ready: boolean; text: string }> {
  return (skills ?? []).map((skill, index) => {
    if (typeof skill === "string") {
      return {
        key: `${skill}-${index}`,
        ready: false,
        text: `${skill} 尚未返回安装状态`,
      };
    }
    const id = skill.id || "未命名";
    if (skill.status === "ready") {
      return {
        key: `${id}-${skill.source}-${index}`,
        ready: true,
        text: `${id} 已安装${skill.localPath ? ` · ${skill.localPath}` : ""}`,
      };
    }
    return {
      key: `${id}-${skill.source}-${index}`,
      ready: false,
      text: `${id} 未就绪${skill.error ? `：${skill.error}` : ""}`,
    };
  });
}

function SkillStatusList({
  skills,
}: {
  skills?: Array<string | SkillBinding>;
}) {
  const views = skillViews(skills);
  if (views.length === 0) return null;
  return (
    <ul className="skill-status">
      {views.map((skill) => (
        <li key={skill.key} className={skill.ready ? "ready" : "failed"}>
          {skill.text}
        </li>
      ))}
    </ul>
  );
}

const EMPTY_DRAFT = {
  name: "",
  role: "",
  defaultEngine: "claude" as EngineKind,
  instructions: "",
  skills: "",
  enabled: true,
};

function skillsToInput(value: string): string[] {
  return value
    .split(/[,，\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function skillToken(skill: string | SkillBinding): string {
  if (typeof skill === "string") return skill;
  return skill.source.includes("@") ? skill.source : skill.id;
}

function skillsFromBot(bot: BotConfig): string {
  return (bot.skills ?? []).map(skillToken).join(", ");
}

function skillsPlaceholder(role: string): string {
  switch (role.trim().toLowerCase()) {
    case "product":
      return "例如：grill-me, to-spec";
    case "developer":
      return "例如：to-tickets";
    case "tester":
      return "例如：agent-browser";
    case "reviewer":
      return "例如：code-review-expert";
    default:
      return "例如：grill-me, to-spec 或 owner/repo@to-tickets";
  }
}

export function BotSettingsPage() {
  const [bots, setBots] = useState<BotConfig[]>([]);
  const [selectedId, setSelectedId] = useState<string | "new" | null>(null);
  const [draft, setDraft] = useState(EMPTY_DRAFT);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<"delete" | "reset" | null>(null);

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
            skills: skillsFromBot(list[0]),
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
      skills: skillsFromBot(bot),
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
        skills: skillsToInput(draft.skills),
        enabled: draft.enabled,
      };
      const bot =
        selectedId && selectedId !== "new"
          ? await api.updateBot(selectedId, payload)
          : await api.createBot(payload);
      const list = await refresh();
      const next = list.find((b) => b.id === bot.id) ?? bot;
      selectBot(next);
      const failed = (next.skills ?? []).filter(
        (skill) => skill.status === "failed",
      );
      setStatus(
        failed.length > 0
          ? `已保存。未就绪：${failed
              .map((skill) => `${skill.id} ${skill.error ?? ""}`.trim())
              .join("；")}`
          : "已保存",
      );
    } catch (err: unknown) {
      setStatus(err instanceof Error ? err.message : "保存失败");
    } finally {
      setBusy(false);
    }
  }

  function askDelete() {
    if (!selectedId || selectedId === "new") return;
    setConfirm("delete");
  }

  async function handleDelete() {
    if (!selectedId || selectedId === "new") return;
    setConfirm(null);
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

  async function handleSeedTeam() {
    setConfirm(null);
    setBusy(true);
    setStatus(null);
    try {
      const list = await api.seedBotTeam();
      setBots(list);
      if (list[0]) selectBot(list[0]);
      setStatus(`已重置为 ${list.length} 个默认智能体`);
    } catch (err: unknown) {
      setStatus(err instanceof Error ? err.message : "重置失败");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <h1>智能体配置</h1>
        </div>
        <div className="form-actions">
          <button type="button" className="btn-primary" onClick={startCreate}>
            + 新增智能体配置
          </button>
          <button
            type="button"
            className="btn-ghost"
            disabled={busy}
            onClick={() => setConfirm("reset")}
          >
            重置配置
          </button>
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
                  {(bot.skills?.length ?? 0) > 0
                    ? ` · ${bot.skills!.length} skills`
                    : ""}
                  {skillViews(bot.skills).some((skill) => !skill.ready)
                    ? " · 有 Skill 未就绪"
                    : ""}
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
                  {engine === "codex" ? "Codex" : "Claude Code"}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Skills</span>
            <input
              value={draft.skills}
              onChange={(e) => setDraft({ ...draft, skills: e.target.value })}
              placeholder={skillsPlaceholder(draft.role)}
            />
            <span className="field-hint muted">
              逗号或空格分隔。角色默认提示：产品{" "}
              <code>grill-me, to-spec</code>；开发{" "}
              <code>to-tickets</code>
              。保存时安装到本机用户技能库
              <code>~/.agents/skills</code>
              。已安装的同名 Skill 会直接绑定。新 Skill 填写{" "}
              <code>owner/repo@skill</code>
              。未就绪的 Skill 不会参加任务。
            </span>
            {selectedId && selectedId !== "new" ? (
              <SkillStatusList
                skills={bots.find((bot) => bot.id === selectedId)?.skills}
              />
            ) : null}
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
                onClick={askDelete}
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
      {confirm ? (
        <div className="confirm-layer" role="dialog" aria-modal="true">
          <button
            type="button"
            className="confirm-backdrop"
            aria-label="关闭"
            onClick={() => setConfirm(null)}
          />
          <div className="confirm-card">
            <h2>{confirm === "delete" ? "删除智能体" : "重置配置"}</h2>
            <p>
              {confirm === "delete"
                ? `删除「${draft.name.trim() || "未命名"}」后不能恢复。`
                : "重置当前智能体配置，使用默认智能体。你新增或改过的智能体都会被替换。"}
            </p>
            <div className="form-actions">
              <button
                type="button"
                className="btn-ghost"
                disabled={busy}
                onClick={() => setConfirm(null)}
              >
                取消
              </button>
              <button
                type="button"
                className={confirm === "delete" ? "btn-ghost danger" : "btn-primary"}
                disabled={busy}
                onClick={() =>
                  void (confirm === "delete" ? handleDelete() : handleSeedTeam())
                }
              >
                {confirm === "delete" ? "删除" : "重置"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
