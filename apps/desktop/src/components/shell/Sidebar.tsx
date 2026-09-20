import { useMemo, useState } from "react";
import { NavLink } from "react-router-dom";
import type { Topic } from "@ml-aos/shared";
import { useShell } from "../../lib/shell-context";

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
  if (status === "running") return "running";
  if (status === "needs_you") return "needs you";
  return "idle";
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
  } = useShell();
  const [filter, setFilter] = useState("");
  const [creating, setCreating] = useState(false);

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return topics;
    return topics.filter((t) => t.title.toLowerCase().includes(q));
  }, [topics, filter]);

  async function handleNewTopic() {
    setCreating(true);
    try {
      await createTopic("New topic");
    } finally {
      setCreating(false);
    }
  }

  return (
    <aside className="sidebar">
      <div className="workspace-switcher">
        <span className="muted">Workspace</span>
        {workspaces.length > 0 ? (
          <select
            aria-label="Workspace"
            value={workspace?.id ?? ""}
            onChange={(e) => setWorkspaceId(e.target.value)}
          >
            {workspaces.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </select>
        ) : (
          <strong>None</strong>
        )}
      </div>
      <nav className="side-nav" aria-label="Settings">
        <NavLink to="/workspaces/new">New workspace</NavLink>
        {workspace ? (
          <NavLink to={`/workspaces/${workspace.id}`}>Edit workspace</NavLink>
        ) : null}
        <NavLink to="/bots">Bots</NavLink>
        <NavLink to="/queue">Queue</NavLink>
        <NavLink to="/settings">Settings</NavLink>
      </nav>
      <div className="sidebar-toolbar">
        <input
          type="search"
          placeholder="Filter topics"
          aria-label="Filter topics"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
        <div className="sidebar-toolbar-row">
          <NavLink to="/" className="btn-primary nav-btn">
            Home
          </NavLink>
          <button
            type="button"
            className="btn-ghost nav-btn"
            disabled={!workspace || creating}
            onClick={() => void handleNewTopic()}
          >
            {creating ? "…" : "New topic"}
          </button>
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
                <div className="topic-title">{topic.title}</div>
                <div className="topic-preview muted">{topic.pipelineStage}</div>
                <span className={`status-chip status-${status}`}>
                  {statusLabel(status)}
                </span>
              </button>
            </li>
          );
        })}
        {filtered.length === 0 ? (
          <li className="muted empty-hint">No topics yet</li>
        ) : null}
      </ul>
    </aside>
  );
}
