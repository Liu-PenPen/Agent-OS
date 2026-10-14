import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import type { Topic } from "@ml-aos/shared";
import { useShell } from "../../lib/shell-context";
import { IconChevronDown, IconGrid, IconPlus, IconTrash } from "./icons";

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

function confirmCopy(topic: Topic, hasPending: boolean): string {
  const running =
    hasPending ||
    topic.pipelineStage === "developing" ||
    topic.pipelineStage === "testing" ||
    topic.pipelineStage === "reviewing";
  if (running) {
    return "将停止当前流水线，并删除这个话题的消息。不能撤销。";
  }
  return "将删除这个话题的消息。不能撤销。";
}

function TopicListItem({
  topic,
  active,
  hasPending,
  onSelect,
  onDelete,
}: {
  topic: Topic;
  active: boolean;
  hasPending: boolean;
  onSelect: () => void;
  onDelete: () => Promise<boolean>;
}) {
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const status = topicStatus(topic, hasPending);

  useEffect(() => {
    if (confirming) cancelRef.current?.focus();
  }, [confirming]);

  async function commit() {
    setDeleting(true);
    const ok = await onDelete();
    if (!ok) setDeleting(false);
  }

  return (
    <li className={confirming ? "topic-item confirming" : "topic-item"}>
      <div className={`topic-row ${active ? "active" : ""}`}>
        <button type="button" className="topic-select" onClick={onSelect}>
          <div className="topic-row-head">
            <span className="topic-title">{topic.title}</span>
            <span className={`status-chip status-${status}`}>
              {statusLabel(status)}
            </span>
          </div>
          <p className="topic-preview">
            {previewText(topic, hasPending)}
          </p>
        </button>
        <button
          type="button"
          className="topic-delete"
          aria-label={`删除话题 ${topic.title}`}
          aria-expanded={confirming}
          disabled={deleting}
          onClick={() => setConfirming((open) => !open)}
        >
          <IconTrash />
        </button>
      </div>
      {confirming ? (
        <div
          className="topic-confirm"
          role="group"
          aria-label={`确认删除 ${topic.title}`}
          onKeyDown={(event) => {
            if (event.key === "Escape" && !deleting) setConfirming(false);
          }}
        >
          <p>{confirmCopy(topic, hasPending)}</p>
          <div className="topic-confirm-actions">
            <button
              ref={cancelRef}
              type="button"
              disabled={deleting}
              onClick={() => setConfirming(false)}
            >
              取消
            </button>
            <button
              type="button"
              className="danger"
              disabled={deleting}
              onClick={() => void commit()}
            >
              {deleting ? "删除中" : "删除"}
            </button>
          </div>
        </div>
      ) : null}
    </li>
  );
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
    deleteTopic,
    topicPendingIds,
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
        {filtered.map((topic) => (
          <TopicListItem
            key={topic.id}
            topic={topic}
            active={selectedTopicId === topic.id}
            hasPending={topicPendingIds.has(topic.id)}
            onSelect={() => selectTopic(topic.id)}
            onDelete={() => deleteTopic(topic.id)}
          />
        ))}
        {filtered.length === 0 ? (
          <li className="muted empty-hint">暂无话题</li>
        ) : null}
      </ul>

      <div className="sidebar-footer">
        <span>引擎 V4.2</span>
        <span className="engine-ok">● 均衡</span>
      </div>
    </aside>
  );
}
