const STAGES = ["Developing", "Testing", "Reviewing", "Done"] as const;

export function RightPanel() {
  return (
    <aside className="right-panel">
      <section>
        <h2>Pipeline</h2>
        <ol className="pipeline-stepper">
          {STAGES.map((stage, i) => (
            <li key={stage} className={i === 0 ? "active" : ""}>
              <span className="step-index">{i + 1}</span>
              {stage}
            </li>
          ))}
        </ol>
      </section>
      <section>
        <h2>
          Needs you <span className="badge">1</span>
        </h2>
        <div className="hitl-card">
          <p>Confirm theme default for new installs?</p>
          <div className="hitl-actions">
            <button type="button" className="btn-ghost">
              Dark
            </button>
            <button type="button" className="btn-primary">
              Confirm
            </button>
          </div>
        </div>
      </section>
      <section className="meta">
        <h2>Context</h2>
        <dl>
          <dt>cwd</dt>
          <dd className="mono">E:\Python_Project\ml-aos</dd>
          <dt>engine</dt>
          <dd>mock</dd>
        </dl>
      </section>
    </aside>
  );
}
