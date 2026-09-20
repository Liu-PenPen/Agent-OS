const MOCK_TOPICS = [
  {
    id: "1",
    title: "Desktop shell + theme",
    preview: "Wire TopBar theme toggle…",
    status: "running" as const,
  },
  {
    id: "2",
    title: "Runtime settings API",
    preview: "GET/PATCH /api/settings",
    status: "needs_you" as const,
  },
  {
    id: "3",
    title: "Pipeline mock advance",
    preview: "Developing → Testing",
    status: "idle" as const,
  },
];

function statusLabel(status: (typeof MOCK_TOPICS)[number]["status"]): string {
  if (status === "running") return "running";
  if (status === "needs_you") return "needs you";
  return "idle";
}

export function Sidebar() {
  return (
    <aside className="sidebar">
      <div className="workspace-switcher">
        <span className="muted">Workspace</span>
        <strong>ml-aos</strong>
      </div>
      <div className="sidebar-toolbar">
        <input type="search" placeholder="Filter topics" aria-label="Filter topics" />
        <button type="button" className="btn-primary">
          New Topic
        </button>
      </div>
      <ul className="topic-list">
        {MOCK_TOPICS.map((topic) => (
          <li key={topic.id} className="topic-row">
            <div className="topic-title">{topic.title}</div>
            <div className="topic-preview muted">{topic.preview}</div>
            <span className={`status-chip status-${topic.status}`}>
              {statusLabel(topic.status)}
            </span>
          </li>
        ))}
      </ul>
    </aside>
  );
}
