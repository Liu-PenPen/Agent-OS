import { useMemo, useState } from "react";
import { Link, NavLink } from "react-router-dom";
import type { Topic } from "@ml-aos/shared";
import { useShell } from "../../lib/shell-context";
import { IconChevronDown, IconGrid, IconPlus } from "./icons";

function topicStatus(
  topic: Topic,
  hasPending: boolean,
): "running" | "needs_you" | "idle" {
  if (hasPending) return "needs_you";
  if (
    topic.pipelineStage === "developing" ||
    topic.pipelineStage === "testing" ||
    topic.pipelineStage === "reviewing"
  ) {
    return "running";
  }
  return "idle";
}

function statusLabel(status: "running" | "needs_you" | "idle"): string {
  if (status === "running") return "进行中";
  if (status === "needs_you") return "待确认";
  return "空闲";
}

function previewText(topic: Topic, hasPending: boolean): string {
  if (hasPending) return "需要你确认…";
  if (topic.pipelineStage === "developing") return "智能体正在开发…";
  if (topic.pipelineStage === "testing") return "正在运行测试…";
  if (topic.pipelineStage === "reviewing") return "正在审查…";
  if (topic.pipelineStage === "completed") return "流水线已完成。";
  if (topic.pipelineStage === "blocked") return "流水线已阻塞。";
  return "等待输入。";
}

export function Sidebar() {
  const {
    workspaces,
    workspace,
    setWorkspaceId,
    topics,
    selectedTopicId,
    selectTopic,
    createTopic,
    topicPendingIds,
    pendingCount,
  } = useShell();
  const [filter, setFilter] = useState("");
  const [creating, setCreating] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return topics;
    return topics.filter((t) => t.title.toLowerCase().includes(q));
  }, [topics, filter]);

  async function handleNewTopic() {
    setCreating(true);
    try {
      await createTopic("新话题");
    } finally {
      setCreating(false);
    }
  }

  return (
    <aside className="sidebar">
      <div className="sidebar-top">
        <div className="workspace-menu">
          <button
            type="button"
            className="workspace-switcher-btn"
            aria-expanded={menuOpen}
            aria-haspopup="listbox"
            aria-label="工作区"
            onClick={() => setMenuOpen((v) => !v)}
          >
            <span className="workspace-switcher-label">
              <IconGrid />
              <span className="truncate">
                {workspace?.name ?? "暂无工作区"}
              </span>
            </span>
            <IconChevronDown />
          </button>
          {menuOpen ? (
            <div className="workspace-dropdown" role="listbox">
              {workspaces.map((w) => (
                <button
                  key={w.id}
                  type="button"
                  role="option"
                  aria-selected={w.id === workspace?.id}
                  className={w.id === workspace?.id ? "active" : ""}
                  onClick={() => {
                    setWorkspaceId(w.id);
                    setMenuOpen(false);
                  }}
                >
                  {w.name}
                </button>
              ))}
              {workspaces.length === 0 ? (
                <p className="muted empty-hint">暂无工作区</p>
              ) : null}
              <div className="workspace-dropdown-links">
                <Link to="/workspaces/new" onClick={() => setMenuOpen(false)}>
                  新建工作区
                </Link>
                {workspace ? (
                  <Link
                    to={`/workspaces/${workspace.id}`}
                    onClick={() => setMenuOpen(false)}
                  >
                    编辑工作区
                  </Link>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>

        <div className="sidebar-section-head">
          <span>话题</span>
          <button
            type="button"
            className="section-action"
            disabled={!workspace || creating}
            onClick={() => void handleNewTopic()}
          >
            <IconPlus />
            {creating ? "…" : "新建"}
          </button>
        </div>

        <div className="sidebar-filter">
          <input
            type="search"
            placeholder="筛选话题"
            aria-label="筛选话题"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
        </div>
      </div>

      <ul className="topic-list">
        {filtered.map((topic) => {
          const status = topicStatus(topic, topicPendingIds.has(topic.id));
          return (
            <li key={topic.id}>
              <button
                type="button"
                className={`topic-row ${selectedTopicId === topic.id ? "active" : ""}`}
                onClick={() => selectTopic(topic.id)}
              >
                <div className="topic-row-head">
                  <span className="topic-title">{topic.title}</span>
                  <span className={`status-chip status-${status}`}>
                    {statusLabel(status)}
                  </span>
                </div>
                <p className="topic-preview">
                  {previewText(topic, topicPendingIds.has(topic.id))}
                </p>
              </button>
            </li>
          );
        })}
        {filtered.length === 0 ? (
          <li className="muted empty-hint">暂无话题</li>
        ) : null}
      </ul>

      <nav className="sidebar-nav" aria-label="应用导航">
        <NavLink to="/" end>
          工作台
        </NavLink>
        <NavLink to="/queue">
          待确认
          {pendingCount > 0 ? <span className="badge">{pendingCount}</span> : null}
        </NavLink>
        <NavLink to="/bots">智能体</NavLink>
        <NavLink to="/settings">设置</NavLink>
      </nav>

      <div className="sidebar-footer">
        <span>引擎 V4.2</span>
        <span className="engine-ok">● 均衡</span>
      </div>
    </aside>
  );
}
