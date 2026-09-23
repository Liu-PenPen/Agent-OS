import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../../lib/api";
import { useShell } from "../../lib/shell-context";
import { IconActivity, IconSettings, IconTicket } from "../shell/icons";
import { groupTicketsBySprint } from "./ticket-mock";
import { TicketDetailDrawer } from "./TicketDetailDrawer";
import { TicketProjectConfig } from "./TicketProjectConfig";
import { TicketStatePicker } from "./TicketStatePicker";
import { TicketStatusPopover } from "./TicketStatusPopover";
import type { TicketDetail, TicketItem, TicketProject } from "./ticket-types";

type TicketInboxProps = {
  onCollapse: () => void;
};

function toProject(row: Awaited<ReturnType<typeof api.listTicketProjects>>[number]): TicketProject {
  return {
    id: row.id,
    name: row.name,
    programId: row.programId,
    ident: row.ident ?? row.programId,
    localPath: row.localPath,
    defaultEngine: row.defaultEngine,
    cast: row.cast,
    testBaseUrl: row.testBaseUrl,
    testStartCommand: row.testStartCommand,
  };
}

function toTicket(row: Awaited<ReturnType<typeof api.listTicketTodos>>[number]): TicketItem {
  return {
    id: row.id,
    ident: row.ident,
    title: row.title,
    stateTitle: row.stateTitle,
    sprintId: row.sprintId,
    sprintTitle: row.sprintTitle,
    programId: row.programId,
    url: row.url,
    priority: row.priority ?? "未设置",
    priorityRank: row.priorityRank,
    topicId: row.topicId,
    pipelineStage: row.pipelineStage as TicketItem["pipelineStage"],
  };
}

function toDetail(
  row: Awaited<ReturnType<typeof api.getTicketDetail>>,
): TicketDetail {
  return {
    ...toTicket(row),
    description: row.description ?? "",
    authorName: row.authorName ?? "未知",
    planStartedAt: row.planStartedAt,
    deadline: row.deadline,
    imageUrls: row.imageUrls ?? [],
  };
}

export function TicketInbox({ onCollapse }: TicketInboxProps) {
  const {
    workspace,
    setWorkspaceId,
    selectTopic,
    refreshAll,
  } = useShell();

  const [projects, setProjects] = useState<TicketProject[]>([]);
  const [projectId, setProjectId] = useState("");
  const [tickets, setTickets] = useState<TicketItem[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [statusOpen, setStatusOpen] = useState(false);
  const [statePickerOpen, setStatePickerOpen] = useState(false);
  const [statePickerTicket, setStatePickerTicket] = useState<TicketItem | null>(
    null,
  );
  const [configOpen, setConfigOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [detail, setDetail] = useState<TicketDetail | null>(null);
  const [notesByIssueId, setNotesByIssueId] = useState<Record<number, string>>(
    {},
  );
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [todosLoading, setTodosLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [includeAll, setIncludeAll] = useState(false);
  const [giteeOk, setGiteeOk] = useState(true);

  const project = projects.find((p) => p.id === projectId) ?? null;
  const groups = useMemo(() => groupTicketsBySprint(tickets), [tickets]);
  const selected =
    tickets.find((t) => t.id === selectedId) ?? tickets[0] ?? null;

  const loadProjects = useCallback(async () => {
    const status = await api.ticketsStatus();
    setGiteeOk(status.configured);
    const list = (await api.listTicketProjects()).map(toProject);
    setProjects(list);
    setProjectId((prev) =>
      list.some((p) => p.id === prev) ? prev : (list[0]?.id ?? ""),
    );
  }, []);

  const loadTodos = useCallback(
    async (id: string, all: boolean) => {
      if (!id) {
        setTickets([]);
        return;
      }
      const list = (await api.listTicketTodos(id, { all })).map(toTicket);
      setTickets(list);
      setSelectedId((prev) =>
        list.some((t) => t.id === prev) ? prev : (list[0]?.id ?? null),
      );
    },
    [],
  );

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void (async () => {
      try {
        await loadProjects();
        if (!cancelled) setNotice(null);
      } catch (error) {
        if (!cancelled) {
          setNotice(error instanceof Error ? error.message : "加载工单项目失败");
          setProjects([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loadProjects]);

  useEffect(() => {
    if (!projectId) return;
    let cancelled = false;
    setTodosLoading(true);
    void (async () => {
      try {
        await loadTodos(projectId, includeAll);
        if (!cancelled) setNotice(null);
      } catch (error) {
        if (!cancelled) {
          setTickets([]);
          setNotice(error instanceof Error ? error.message : "拉取待办失败");
        }
      } finally {
        if (!cancelled) setTodosLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId, includeAll, loadTodos]);

  async function openDetail(ticket: TicketItem) {
    if (!project) return;
    setSelectedId(ticket.id);
    setDetailOpen(true);
    setDetailLoading(true);
    setDetailError(null);
    setDetail(null);
    setNotice(null);
    try {
      const row = await api.getTicketDetail(project.id, ticket.id);
      setDetail(toDetail(row));
    } catch (error) {
      setDetailError(
        error instanceof Error ? error.message : "拉取工单详情失败",
      );
    } finally {
      setDetailLoading(false);
    }
  }

  async function handleHandOff(ticket: TicketItem) {
    if (!project) return;
    if (!project.localPath?.trim()) {
      setNotice("请先配置该项目的本地工作目录。");
      setConfigOpen(true);
      return;
    }
    setBusy(true);
    setNotice(null);
    const note = notesByIssueId[ticket.id]?.trim() || undefined;
    try {
      const result = await api.dispatchTicket({
        projectId: project.id,
        issueId: ticket.id,
        workspaceId: workspace?.id,
        note,
      });
      await refreshAll();
      await loadTodos(project.id, includeAll);
      selectTopic(result.topicId);
      const workspaces = await api.listWorkspaces();
      const matched = workspaces.find((w) =>
        w.localPath.replace(/\\/g, "/").toLowerCase() ===
        project.localPath!.replace(/\\/g, "/").toLowerCase(),
      );
      if (matched) setWorkspaceId(matched.id);
      setNotesByIssueId((prev) => {
        const next = { ...prev };
        delete next[ticket.id];
        return next;
      });
      setDetailOpen(false);
      setNotice(`已交给 CEO：${ticket.ident}`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "派发失败");
    } finally {
      setBusy(false);
    }
  }

  async function handleSaveProject(next: TicketProject) {
    const saved = toProject(
      await api.updateTicketProject(next.id, {
        localPath: next.localPath,
        defaultEngine: next.defaultEngine,
        cast: next.cast,
        testBaseUrl: next.testBaseUrl,
        testStartCommand: next.testStartCommand,
      }),
    );
    setProjects((prev) => prev.map((p) => (p.id === saved.id ? saved : p)));
    setNotice(`已保存「${saved.name}」配置`);
  }

  return (
    <div className="ticket-inbox">
      <header className="ticket-inbox-header">
        <div className="ticket-inbox-title">
          <IconTicket size={15} />
          <span>工单</span>
        </div>
        <div className="ticket-inbox-tools">
          <button
            type="button"
            className="icon-btn"
            title="刷新项目"
            aria-label="刷新项目"
            disabled={loading || todosLoading}
            onClick={() => {
              setLoading(true);
              setTodosLoading(true);
              void (async () => {
                try {
                  await loadProjects();
                  if (projectId) await loadTodos(projectId, includeAll);
                  setNotice("已从 Gitee 刷新项目列表");
                } catch (error) {
                  setNotice(
                    error instanceof Error ? error.message : "刷新失败",
                  );
                } finally {
                  setLoading(false);
                  setTodosLoading(false);
                }
              })();
            }}
          >
            ↻
          </button>
          <button
            type="button"
            className="icon-btn"
            title="工单状态"
            aria-label="工单状态"
            onClick={() => setStatusOpen(true)}
          >
            <IconActivity size={15} />
          </button>
          <button
            type="button"
            className="icon-btn"
            title="项目配置"
            aria-label="项目配置"
            onClick={() => setConfigOpen(true)}
            disabled={!project}
          >
            <IconSettings size={15} />
          </button>
          <button
            type="button"
            className="icon-btn right-panel-collapse"
            onClick={onCollapse}
            title="折叠右侧面板"
            aria-label="折叠右侧面板"
          >
            ›
          </button>
        </div>
      </header>

      <div className="ticket-project-bar">
        <label className="ticket-project-select">
          <span className="sr-only">工单项目</span>
          <select
            value={projectId}
            disabled={projects.length === 0 || todosLoading}
            onChange={(e) => {
              setProjectId(e.target.value);
              setSelectedId(null);
              setNotice(null);
            }}
          >
            {projects.length === 0 ? (
              <option value="">未配置项目</option>
            ) : (
              projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))
            )}
          </select>
        </label>
        <div className="ticket-project-meta">
          <span className={`ticket-engine is-${project?.defaultEngine ?? "claude"}`}>
            {project?.defaultEngine === "codex" ? "Codex" : "Claude"}
          </span>
          {project?.localPath ? (
            <span className="ticket-path-chip mono" title={project.localPath}>
              {project.localPath.replace(/^.*[\\/]/, "") || project.localPath}
            </span>
          ) : project ? (
            <button
              type="button"
              className="ticket-path-missing"
              onClick={() => setConfigOpen(true)}
              title="为此项目绑定本地工作目录"
            >
              配置本地目录
            </button>
          ) : null}
          <label className="ticket-scope-toggle">
            <input
              type="checkbox"
              checked={includeAll}
              onChange={(e) => setIncludeAll(e.target.checked)}
            />
            <span>含非待办</span>
          </label>
        </div>
      </div>

      {notice ? (
        <p className="ticket-notice" role="status">
          {notice}
        </p>
      ) : null}
      {!giteeOk && !notice ? (
        <p className="ticket-notice" role="status">
          未检测到 Gitee 环境变量。请在项目根 `.env` 配置 MI_CLAW_GITEE_TOKEN 等。
        </p>
      ) : null}

      <div className="ticket-inbox-scroll">
        {loading || todosLoading ? (
          <div className="ticket-loading" role="status" aria-live="polite">
            <span className="ticket-loading-spinner" aria-hidden />
            <p>{loading ? "加载项目列表…" : "正在拉取工单…"}</p>
          </div>
        ) : groups.length === 0 ? (
          <p className="ticket-empty-hint">
            {projects.length === 0
              ? "未拉到 Gitee 项目。请检查 .env 凭证，或点刷新；也可放一份可选白名单 config/gitee-projects.json。"
              : "当前项目没有待办工单。"}
          </p>
        ) : (
          groups.map((group, groupIndex) => (
            <section
              key={group.sprintTitle}
              className="ticket-sprint"
              style={{ animationDelay: `${groupIndex * 60}ms` }}
            >
              <header className="ticket-sprint-head">
                <span className="ticket-sprint-rail" aria-hidden />
                <h4>{group.sprintTitle}</h4>
                <span className="ticket-sprint-count">{group.tickets.length}</span>
              </header>
              <ul className="ticket-card-list">
                {group.tickets.map((ticket, index) => {
                  const active = selected?.id === ticket.id;
                  return (
                    <li
                      key={ticket.id}
                      className={
                        active ? "ticket-card is-active" : "ticket-card"
                      }
                      style={{ animationDelay: `${80 + index * 45}ms` }}
                    >
                      <button
                        type="button"
                        className="ticket-card-main"
                        onClick={() => void openDetail(ticket)}
                      >
                        <div className="ticket-card-top">
                          <span className="ticket-ident mono">{ticket.ident}</span>
                          <span
                            className={`ticket-priority-badge is-rank-${Math.min(3, Math.floor((ticket.priorityRank ?? 40) / 10))}`}
                          >
                            {ticket.priority}
                          </span>
                          {ticket.pipelineStage &&
                          ticket.pipelineStage !== "idle" ? (
                            <span className="ticket-live-chip">进行中</span>
                          ) : null}
                        </div>
                        <p className="ticket-card-title">{ticket.title}</p>
                      </button>
                      <div className="ticket-card-actions">
                        <button
                          type="button"
                          className="ticket-handoff"
                          disabled={busy}
                          onClick={() => void handleHandOff(ticket)}
                        >
                          交给 CEO
                        </button>
                        <button
                          type="button"
                          className="ticket-change-state"
                          disabled={busy}
                          onClick={() => {
                            setSelectedId(ticket.id);
                            setStatePickerTicket(ticket);
                            setStatePickerOpen(true);
                            setNotice(null);
                          }}
                        >
                          改状态
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))
        )}
      </div>

      <TicketDetailDrawer
        open={detailOpen}
        loading={detailLoading}
        error={detailError}
        detail={detail}
        note={detail ? (notesByIssueId[detail.id] ?? "") : ""}
        onNoteChange={(value) => {
          if (!detail) return;
          setNotesByIssueId((prev) => ({ ...prev, [detail.id]: value }));
        }}
        onClose={() => {
          if (detail) {
            setNotesByIssueId((prev) => {
              const next = { ...prev };
              delete next[detail.id];
              return next;
            });
          }
          setDetailOpen(false);
        }}
      />
      <TicketStatusPopover
        open={statusOpen}
        project={project}
        ticket={selected}
        onClose={() => setStatusOpen(false)}
      />
      <TicketStatePicker
        open={statePickerOpen}
        projectId={project?.id ?? null}
        ticket={statePickerTicket}
        onClose={() => {
          setStatePickerOpen(false);
          setStatePickerTicket(null);
        }}
        onApplied={(stateTitle) => {
          setNotice(`已同步：${stateTitle}`);
          if (project) {
            void loadTodos(project.id, includeAll).catch((error) => {
              setNotice(
                error instanceof Error ? error.message : "刷新工单失败",
              );
            });
          }
        }}
      />
      <TicketProjectConfig
        open={configOpen}
        project={project}
        onClose={() => setConfigOpen(false)}
        onSave={(next) => void handleSaveProject(next)}
      />
    </div>
  );
}
