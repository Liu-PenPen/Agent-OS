import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { useShell } from "../lib/shell-context";
import type {
  BoardFailureReason,
  BoardSummary,
  BoardTask,
  BoardTaskStatus,
} from "../components/tickets/board-types";

type StatusFilter = "all" | BoardTaskStatus;

const FILTERS: Array<{ id: StatusFilter; label: string }> = [
  { id: "all", label: "全部" },
  { id: "running", label: "进行中" },
  { id: "completed", label: "已完成" },
  { id: "failed", label: "失败" },
];

const EMPTY_SUMMARY: BoardSummary = {
  running: 0,
  completed: 0,
  failed: 0,
  tokensToday: 0,
};

function statusLabel(status: BoardTaskStatus): string {
  if (status === "running") return "进行中";
  if (status === "completed") return "已完成";
  return "失败";
}

function sourceLabel(source: BoardTask["source"]): string {
  if (source === "gitee") return "Gitee";
  if (source === "pipeline") return "流水线";
  return "直接";
}

function failureLabel(reason?: BoardFailureReason): string {
  if (!reason) return "—";
  if (reason === "cli_crash") return "CLI 崩溃";
  if (reason === "user_reject") return "用户拒绝";
  if (reason === "timeout") return "超时";
  if (reason === "pipeline_blocked") return "流水线阻塞";
  return "未知";
}

function needsGiteeSync(task: BoardTask): boolean {
  return (
    task.status === "completed" &&
    Boolean(task.gitee) &&
    task.gitee?.lastSyncedStateId == null
  );
}

function formatTime(iso?: string): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("zh-CN");
}

function formatTokens(n: number): string {
  return n.toLocaleString("zh-CN");
}

export function TaskBoardPage() {
  const navigate = useNavigate();
  const { selectTopic } = useShell();
  const [filter, setFilter] = useState<StatusFilter>("all");
  const [tasks, setTasks] = useState<BoardTask[]>([]);
  const [summary, setSummary] = useState<BoardSummary>(EMPTY_SUMMARY);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const [nextTasks, nextSummary] = await Promise.all([
        api.boardTasks(filter === "all" ? undefined : filter),
        api.boardSummary(),
      ]);
      setTasks(nextTasks);
      setSummary(nextSummary);
      setError("");
      setSelectedId((prev) => {
        if (prev && nextTasks.some((t) => t.id === prev)) return prev;
        return nextTasks[0]?.id ?? null;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载失败");
    }
  }, [filter]);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => {
      void load();
    }, 5000);
    function onVisibility() {
      if (document.visibilityState === "visible") void load();
    }
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [load]);

  const selected = tasks.find((t) => t.id === selectedId) ?? null;
  const healthOk = summary.failed === 0;

  function openTopic(topicId: string) {
    selectTopic(topicId);
    navigate("/workspace");
  }

  return (
    <div className="page board-page">
      <header className="page-header">
        <div>
          <h1>任务看板</h1>
          <p className="page-lead">
            查看进行中、已完成与失败的任务；如需修改工单状态，前往工单列表操作。
          </p>
        </div>
        <span
          className={`board-health ${healthOk ? "is-ok" : "is-warn"}`}
          title={healthOk ? "无失败任务" : "存在失败任务"}
        >
          {healthOk ? "状态良好" : "需关注"}
        </span>
      </header>

      {error ? <p className="form-error">{error}</p> : null}

      <dl className="board-summary" aria-label="任务摘要">
        <div>
          <dt>进行中</dt>
          <dd>{summary.running}</dd>
        </div>
        <div>
          <dt>已完成</dt>
          <dd>{summary.completed}</dd>
        </div>
        <div>
          <dt>失败</dt>
          <dd>{summary.failed}</dd>
        </div>
        <div>
          <dt>今日 token</dt>
          <dd>{formatTokens(summary.tokensToday)}</dd>
        </div>
      </dl>

      <div className="board-layout">
        <section className="board-list-pane" aria-label="任务列表">
          <div className="board-filters" role="tablist" aria-label="按状态筛选">
            {FILTERS.map((item) => (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={filter === item.id}
                className={filter === item.id ? "active" : undefined}
                onClick={() => setFilter(item.id)}
              >
                {item.label}
              </button>
            ))}
          </div>

          <ul className="entity-list board-task-list">
            {tasks.map((task) => (
              <li key={task.id}>
                <button
                  type="button"
                  className={`entity-row board-task-row ${selectedId === task.id ? "active" : ""}`}
                  onClick={() => setSelectedId(task.id)}
                >
                  <div className="board-task-row-head">
                    <strong className="board-task-title">{task.title}</strong>
                    {needsGiteeSync(task) ? (
                      <span className="board-sync-badge">待改状态</span>
                    ) : null}
                  </div>
                  <span className="muted board-task-meta">
                    {sourceLabel(task.source)}
                    {task.stage ? ` · ${task.stage}` : ""}
                    {task.botId ? ` · ${task.botId}` : ""}
                    {` · ${statusLabel(task.status)}`}
                  </span>
                </button>
              </li>
            ))}
            {tasks.length === 0 ? (
              <li className="muted empty-hint">当前没有任务。</li>
            ) : null}
          </ul>
        </section>

        <aside className="panel-form board-detail" aria-label="任务详情">
          {selected ? (
            <>
              <h2 className="section-title">{selected.title}</h2>
              <dl className="board-detail-fields">
                <div>
                  <dt>状态</dt>
                  <dd>{statusLabel(selected.status)}</dd>
                </div>
                <div>
                  <dt>来源</dt>
                  <dd>{sourceLabel(selected.source)}</dd>
                </div>
                <div>
                  <dt>阶段</dt>
                  <dd>{selected.stage ?? "—"}</dd>
                </div>
                <div>
                  <dt>Bot</dt>
                  <dd>{selected.botId ?? "—"}</dd>
                </div>
                {selected.status === "failed" ? (
                  <div>
                    <dt>失败原因</dt>
                    <dd>{failureLabel(selected.failureReason)}</dd>
                  </div>
                ) : null}
                <div>
                  <dt>Token</dt>
                  <dd>
                    {selected.tokens?.total != null
                      ? formatTokens(selected.tokens.total)
                      : "—"}
                    {selected.tokens?.input != null ||
                    selected.tokens?.output != null
                      ? `（入 ${selected.tokens.input ?? 0} / 出 ${selected.tokens.output ?? 0}）`
                      : null}
                  </dd>
                </div>
                <div>
                  <dt>创建</dt>
                  <dd>{formatTime(selected.createdAt)}</dd>
                </div>
                <div>
                  <dt>更新</dt>
                  <dd>{formatTime(selected.updatedAt)}</dd>
                </div>
                {selected.completedAt ? (
                  <div>
                    <dt>完成</dt>
                    <dd>{formatTime(selected.completedAt)}</dd>
                  </div>
                ) : null}
                {selected.gitee ? (
                  <div>
                    <dt>工单</dt>
                    <dd>
                      <a
                        href={selected.gitee.url}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {selected.gitee.issueIdent}
                      </a>
                      {selected.gitee.lastSyncedStateTitle
                        ? ` · 已同步：${selected.gitee.lastSyncedStateTitle}`
                        : needsGiteeSync(selected)
                          ? " · 待改状态"
                          : null}
                    </dd>
                  </div>
                ) : null}
                {selected.topicId ? (
                  <div>
                    <dt>话题</dt>
                    <dd>
                      <button
                        type="button"
                        className="linkish"
                        onClick={() => openTopic(selected.topicId!)}
                      >
                        打开话题
                      </button>
                      <span className="muted"> · {selected.topicId}</span>
                    </dd>
                  </div>
                ) : null}
                {selected.pipelineId ? (
                  <div>
                    <dt>流水线</dt>
                    <dd className="muted">{selected.pipelineId}</dd>
                  </div>
                ) : null}
              </dl>
              {needsGiteeSync(selected) ? (
                <p className="board-detail-hint muted">
                  请到工单列表对该条目点「改状态」写回 Gitee。
                </p>
              ) : null}
            </>
          ) : (
            <p className="muted">选择左侧任务查看详情。</p>
          )}
        </aside>
      </div>
    </div>
  );
}
