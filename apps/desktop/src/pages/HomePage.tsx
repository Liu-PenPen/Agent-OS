const MOCK_MESSAGES = [
  {
    id: "m1",
    author: "you",
    name: "You",
    body: "Build the desktop shell with theme tokens and a three-pane home layout.",
  },
  {
    id: "m2",
    author: "bot",
    name: "Leader",
    role: "CEO",
    body: "Dispatching desktop shell + theme. TopBar will cycle dark / light / system and persist via PATCH /api/settings.",
  },
  {
    id: "m3",
    author: "bot",
    name: "Dev",
    role: "Developer",
    body: "Scaffolding Vite + React + Tauri. UI available via pnpm --filter @ml-aos/desktop dev.",
  },
];

export function HomePage() {
  return (
    <div className="home-center">
      <header className="topic-header">
        <h1>Desktop shell + theme</h1>
        <p className="muted">ml-aos · mock engine</p>
      </header>
      <div className="timeline">
        {MOCK_MESSAGES.map((msg) => (
          <article
            key={msg.id}
            className={`message ${msg.author === "you" ? "message-you" : "message-bot"}`}
          >
            <div className="message-meta">
              <strong>{msg.name}</strong>
              {msg.role ? <span className="role-badge">{msg.role}</span> : null}
            </div>
            <p>{msg.body}</p>
          </article>
        ))}
      </div>
      <footer className="composer">
        <textarea
          rows={3}
          placeholder="Message agents… use @ to mention"
          aria-label="Composer"
        />
        <div className="composer-actions">
          <button type="button" className="btn-ghost">
            Abort
          </button>
          <button type="button" className="btn-primary">
            Send
          </button>
        </div>
      </footer>
    </div>
  );
}
