import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import {
  api,
  type AgentScheduleTask,
  type TicketPullPriority,
  type TicketPullTask,
} from "../lib/api";
import { useShell } from "../lib/shell-context";

type ProjectRow = {
  id: string;
  name: string;
  localPath?: string;
  cast: string[];
};

type ScheduleKind = "ticket" | "agent";
type ScheduleStatus = "draft" | "active" | "paused";

const PRIORITY_OPTIONS: Array<{
  id: TicketPullPriority;
  label: string;
  summary: string;
}> = [
  { id: "severe", label: "严重", summary: "自动派发严重任务" },
  { id: "major", label: "主要", summary: "自动派发严重和主要任务" },
  {
    id: "none",
    label: "无优先级",
    summary: "自动派发严重、主要和无优先级任务",
  },
];

const AGENT_PRESETS: Array<{
  id: string;
  label: string;
  role: string;
  prompt: string;
}> = [
  {
    id: "log",
    label: "分析日志",
    role: "developer",
    prompt:
      "分析工作区增量日志。只读，有 warning 或 critical 才写出问题；正常则用一句话说明无异常。",
  },
  {
    id: "review",
    label: "代码审查",
    role: "reviewer",
    prompt: "审查当前工作区的代码变更，给出通过或需要修改的结论。",
  },
];

function statusLabel(status: ScheduleStatus): string {
  if (status === "draft") return "未开始";
  if (status === "active") return "运行中";
  return "已暂停";
}

function prioritySummary(priority: TicketPullPriority): string {
  return (
    PRIORITY_OPTIONS.find((item) => item.id === priority)?.summary ?? priority
  );
}

export function SchedulesPage() {
  const navigate = useNavigate();
  const { selectTopic } = useShell();
  const [kind, setKind] = useState<ScheduleKind>("ticket");
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [workspaces, setWorkspaces] = useState<Array<{ id: string; name: string }>>([]);
  const [bots, setBots] = useState<Array<{ id: string; name: string; role: string; enabled: boolean }>>([]);
  const [ticketRows, setTicketRows] = useState<TicketPullTask[]>([]);
  const [agentRows, setAgentRows] = useState<AgentScheduleTask[]>([]);
  const [projectId, setProjectId] = useState("");
  const [workspaceId, setWorkspaceId] = useState("");
  const [botId, setBotId] = useState("");
  const [prompt, setPrompt] = useState("");
  const [everyHours, setEveryHours] = useState(1);
  const [priority, setPriority] = useState<TicketPullPriority>("major");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");

  const enabledBots = bots.filter((bot) => bot.enabled);
  const selected = projects.find((item) => item.id === projectId) ?? null;
  const projectTaken = ticketRows.some((row) => row.projectId === projectId);
  const notes =
    kind === "ticket"
      ? [
          selected && selected.cast.length === 0
            ? "未配置参与 Bot，将按工单内容派给产品或开发。"
            : "",
          selected && !selected.localPath?.trim()
            ? "该项目未配置本地工作目录，执行时会失败。"
            : "",
          projectTaken ? "该项目已有定时任务。" : "",
        ].filter(Boolean)
      : [];

  const projectName = useMemo(() => {
    const names = new Map(projects.map((item) => [item.id, item.name]));
    return (id: string) => names.get(id) ?? id;
  }, [projects]);
  const workspaceName = useMemo(() => {
    const names = new Map(workspaces.map((item) => [item.id, item.name]));
    return (id: string) => names.get(id) ?? id;
  }, [workspaces]);
  const botName = useMemo(() => {
    const names = new Map(bots.map((item) => [item.id, item.name]));
    return (id: string) => names.get(id) ?? id;
  }, [bots]);

  async function load() {
    const [projectList, tickets, agents, workspaceList, botList] = await Promise.all([
      api.listTicketProjects(),
      api.listTicketPulls(),
      api.listAgentSchedules(),
      api.listWorkspaces(),
      api.listBots(),
    ]);
    setProjects(projectList);
    setTicketRows(tickets);
    setAgentRows(agents);
    setWorkspaces(workspaceList);
    setBots(botList);
    setProjectId((prev) =>
      projectList.some((item) => item.id === prev)
        ? prev
        : (projectList[0]?.id ?? ""),
    );
    setWorkspaceId((prev) =>
      workspaceList.some((item) => item.id === prev)
        ? prev
        : (workspaceList[0]?.id ?? ""),
    );
    setBotId((prev) =>
      botList.some((item) => item.enabled && item.id === prev)
        ? prev
        : (botList.find((item) => item.enabled)?.id ?? ""),
    );
  }

  useEffect(() => {
    void load().catch((err: unknown) => {
      setError(err instanceof Error ? err.message : "加载失败");
    });
  }, []);

  function applyPreset(preset: (typeof AGENT_PRESETS)[number]) {
    setPrompt(preset.prompt);
    const match = enabledBots.find(
      (bot) => bot.role.toLowerCase() === preset.role,
    );
    if (match) {
      setBotId(match.id);
      setError("");
      return;
    }
    setError(
      preset.role === "developer"
        ? "没有已启用的开发工程师"
        : "没有已启用的代码审查",
    );
  }

  async function onAdd(event: FormEvent) {
    event.preventDefault();
    const hours = Math.round(everyHours);
    if (!Number.isInteger(hours) || hours < 1 || hours > 24) {
      setError("间隔须为 1 到 24 小时");
      return;
    }
    if (kind === "ticket" && (!projectId || projectTaken)) return;
    if (kind === "agent" && (!prompt.trim() || !botId || !workspaceId)) {
      setError("请填写任务说明、智能体和工作区");
      return;
    }
    setBusy("add");
    setError("");
    try {
      if (kind === "ticket") {
        await api.createTicketPull({
          projectId,
          everyHours: hours,
          priority,
        });
      } else {
        await api.createAgentSchedule({
          prompt: prompt.trim(),
          botId,
          workspaceId,
          everyHours: hours,
        });
        setPrompt("");
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "添加失败");
    } finally {
      setBusy("");
    }
  }

  async function act(
    id: string,
    action: "start" | "pause" | "resume" | "run" | "remove",
    target: ScheduleKind,
  ) {
    setBusy(`${action}:${id}`);
    setError("");
    try {
      if (target === "ticket") await api.ticketPullAction(id, action);
      else await api.agentScheduleAction(id, action);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "操作失败");
      await load().catch(() => undefined);
    } finally {
      setBusy("");
    }
  }

  function openTopic(topicId: string) {
    selectTopic(topicId);
    navigate("/workspace");
  }

  const empty = ticketRows.length === 0 && agentRows.length === 0;
  const addDisabled =
    busy === "add" ||
    (kind === "ticket" && (!projectId || projectTaken)) ||
    (kind === "agent" && (!prompt.trim() || !botId || !workspaceId));

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <h1>定时任务</h1>
          <p className="page-lead">
            工单到点拉取并交给 CEO。智能体任务指定成员后，按间隔在固定话题里执行。
          </p>
        </div>
      </header>
      {error ? <p className="form-error">{error}</p> : null}
      <div className="schedule-layout">
      <form className="panel-form schedule-form" onSubmit={(event) => void onAdd(event)}>
        <div className="schedule-priority schedule-kind" role="radiogroup" aria-label="任务类别">
          <label className={kind === "ticket" ? "is-selected" : ""}>
            <input
              type="radio"
              name="schedule-kind"
              value="ticket"
              checked={kind === "ticket"}
              onChange={() => setKind("ticket")}
            />
            <span className="schedule-priority-name">工单</span>
            <span className="schedule-priority-summary">到点拉取待办并交给 CEO</span>
          </label>
          <label className={kind === "agent" ? "is-selected" : ""}>
            <input
              type="radio"
              name="schedule-kind"
              value="agent"
              checked={kind === "agent"}
              onChange={() => setKind("agent")}
            />
            <span className="schedule-priority-name">智能体</span>
            <span className="schedule-priority-summary">指定成员按间隔执行</span>
          </label>
        </div>

        {kind === "ticket" ? (
          <>
            <div className="schedule-form-grid">
              <label className="field">
                <span>项目</span>
                <select
                  value={projectId}
                  onChange={(event) => setProjectId(event.target.value)}
                  disabled={projects.length === 0}
                >
                  {projects.length === 0 ? (
                    <option value="">还没有工单项目</option>
                  ) : (
                    projects.map((project) => (
                      <option key={project.id} value={project.id}>
                        {project.name}
                      </option>
                    ))
                  )}
                </select>
              </label>
              <HourField value={everyHours} onChange={setEveryHours} />
            </div>
            <fieldset className="schedule-priority-field">
              <legend>优先级</legend>
              <div className="schedule-priority" role="radiogroup" aria-label="优先级">
                {PRIORITY_OPTIONS.map((option) => (
                  <label
                    key={option.id}
                    className={priority === option.id ? "is-selected" : ""}
                  >
                    <input
                      type="radio"
                      name="pull-priority"
                      value={option.id}
                      checked={priority === option.id}
                      onChange={() => setPriority(option.id)}
                    />
                    <span className="schedule-priority-name">{option.label}</span>
                    <span className="schedule-priority-summary">{option.summary}</span>
                  </label>
                ))}
              </div>
            </fieldset>
          </>
        ) : (
          <>
            <div className="schedule-presets">
              {AGENT_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  className="btn-ghost"
                  onClick={() => applyPreset(preset)}
                >
                  {preset.label}
                </button>
              ))}
            </div>
            <label className="field">
              <span>做什么</span>
              <textarea
                className="schedule-prompt"
                value={prompt}
                maxLength={2000}
                placeholder="例如：分析增量日志"
                onChange={(event) => setPrompt(event.target.value)}
              />
            </label>
            <div className="schedule-form-grid">
              <label className="field">
                <span>谁来做</span>
                <select
                  value={botId}
                  onChange={(event) => setBotId(event.target.value)}
                  disabled={enabledBots.length === 0}
                >
                  {enabledBots.length === 0 ? (
                    <option value="">没有已启用的智能体</option>
                  ) : (
                    enabledBots.map((bot) => (
                      <option key={bot.id} value={bot.id}>
                        {bot.name}
                      </option>
                    ))
                  )}
                </select>
              </label>
              <label className="field">
                <span>工作区</span>
                <select
                  value={workspaceId}
                  onChange={(event) => setWorkspaceId(event.target.value)}
                  disabled={workspaces.length === 0}
                >
                  {workspaces.length === 0 ? (
                    <option value="">还没有工作区</option>
                  ) : (
                    workspaces.map((workspace) => (
                      <option key={workspace.id} value={workspace.id}>
                        {workspace.name}
                      </option>
                    ))
                  )}
                </select>
              </label>
            </div>
            <HourField value={everyHours} onChange={setEveryHours} />
          </>
        )}

        {notes.length > 0 ? (
          <ul className="schedule-notes">
            {notes.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        ) : null}
        <div className="schedule-form-foot">
          <button type="submit" className="btn-primary" disabled={addDisabled}>
            添加
          </button>
        </div>
      </form>

      <aside className="schedule-rail" aria-label="已添加的定时任务">
        <div className="schedule-rail-head">
          <h2>已添加</h2>
          <span>{ticketRows.length + agentRows.length}</span>
        </div>
      {empty ? (
        <p className="muted schedule-empty">添加后会出现在这里。</p>
      ) : (
        <ul className="schedule-list">
          {ticketRows.map((row) => (
            <ScheduleCard
              key={`ticket-${row.id}`}
              kindLabel="工单"
              title={projectName(row.projectId)}
              detail={`每 ${row.everyHours} 小时 · ${prioritySummary(row.priority)}`}
              status={row.status}
              nextRunAt={row.nextRunAt}
              lastRunAt={row.lastRunAt}
              lastResult={row.lastResult}
              note={
                projects.find((item) => item.id === row.projectId)?.cast.length === 0
                  ? "未配置参与 Bot，将按工单内容派给产品或开发。"
                  : undefined
              }
              busy={busy.endsWith(`:${row.id}`)}
              onAct={(action) => void act(row.id, action, "ticket")}
            />
          ))}
          {agentRows.map((row) => (
            <ScheduleCard
              key={`agent-${row.id}`}
              kindLabel="智能体"
              title={row.prompt}
              detail={`${botName(row.botId)} · ${workspaceName(row.workspaceId)} · 每 ${row.everyHours} 小时`}
              status={row.status}
              nextRunAt={row.nextRunAt}
              lastRunAt={row.lastRunAt}
              lastResult={row.lastResult}
              busy={busy.endsWith(`:${row.id}`)}
              onOpenTopic={
                row.topicId ? () => openTopic(row.topicId!) : undefined
              }
              onAct={(action) => void act(row.id, action, "agent")}
            />
          ))}
        </ul>
      )}
      </aside>
      </div>
    </div>
  );
}

function HourField({
  value,
  onChange,
}: {
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="field">
      <span>间隔</span>
      <span className="schedule-every">
        <input
          type="number"
          min={1}
          max={24}
          step={1}
          aria-label="间隔（小时）"
          value={value}
          onChange={(event) => onChange(Number(event.target.value))}
        />
        <span>小时</span>
      </span>
    </label>
  );
}

function ScheduleCard({
  kindLabel,
  title,
  detail,
  status,
  nextRunAt,
  lastRunAt,
  lastResult,
  note,
  busy,
  onOpenTopic,
  onAct,
}: {
  kindLabel: string;
  title: string;
  detail: string;
  status: ScheduleStatus;
  nextRunAt?: string;
  lastRunAt?: string;
  lastResult?: string;
  note?: string;
  busy: boolean;
  onOpenTopic?: () => void;
  onAct: (action: "start" | "pause" | "resume" | "run" | "remove") => void;
}) {
  return (
    <li className={`schedule-card is-${status}`}>
      <div className="schedule-row-head">
        <div>
          <span className="schedule-kind-tag">{kindLabel}</span>
          <strong>{title}</strong>
          <p>{detail}</p>
        </div>
        <span className={`schedule-status is-${status}`}>{statusLabel(status)}</span>
      </div>
      <p className="schedule-when">
        下次{" "}
        {status === "active" && nextRunAt
          ? new Date(nextRunAt).toLocaleString()
          : "无"}
        {lastRunAt ? ` · 上次 ${new Date(lastRunAt).toLocaleString()}` : ""}
      </p>
      {lastResult ? <p className="schedule-result">{lastResult}</p> : null}
      {note ? <p className="schedule-card-note">{note}</p> : null}
      <div className="schedule-actions">
        {status === "draft" ? (
          <button
            type="button"
            className="btn-primary"
            disabled={busy}
            onClick={() => onAct("start")}
          >
            开始
          </button>
        ) : null}
        <button
          type="button"
          className="btn-ghost"
          disabled={busy}
          onClick={() => onAct("run")}
        >
          立即执行
        </button>
        {status === "active" ? (
          <button
            type="button"
            className="btn-ghost"
            disabled={busy}
            onClick={() => onAct("pause")}
          >
            暂停
          </button>
        ) : null}
        {status === "paused" ? (
          <button
            type="button"
            className="btn-ghost"
            disabled={busy}
            onClick={() => onAct("resume")}
          >
            恢复
          </button>
        ) : null}
        {onOpenTopic ? (
          <button type="button" className="btn-ghost" onClick={onOpenTopic}>
            打开话题
          </button>
        ) : null}
        <button
          type="button"
          className="btn-ghost schedule-delete"
          disabled={busy}
          onClick={() => onAct("remove")}
        >
          删除
        </button>
      </div>
    </li>
  );
}
