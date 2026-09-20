import { Link, useNavigate } from "react-router-dom";

const STAGES = ["Developing", "Testing", "Reviewing", "Done"] as const;

/** Placeholder until Task 8 wires live topic.pipelineTaskId */
const DEMO_PIPELINE_ID = "demo";

export function RightPanel() {
  const navigate = useNavigate();

  return (
    <aside className="right-panel">
      <section>
        <h2>
          <button
            type="button"
            className="linkish"
            onClick={() => navigate(`/pipelines/${DEMO_PIPELINE_ID}`)}
          >
            Pipeline
          </button>
        </h2>
        <ol className="pipeline-stepper">
          {STAGES.map((stage, i) => (
            <li
              key={stage}
              className={i === 0 ? "active" : ""}
              role="button"
              tabIndex={0}
              onClick={() => navigate(`/pipelines/${DEMO_PIPELINE_ID}`)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  navigate(`/pipelines/${DEMO_PIPELINE_ID}`);
                }
              }}
            >
              <span className="step-index">{i + 1}</span>
              {stage}
            </li>
          ))}
        </ol>
      </section>
      <section>
        <h2>
          <Link to="/queue">
            Needs you <span className="badge">1</span>
          </Link>
        </h2>
        <div className="hitl-card">
          <p>Confirm theme default for new installs?</p>
          <div className="hitl-actions">
            <Link className="btn-ghost" to="/queue">
              Open queue
            </Link>
            <Link className="btn-primary" to="/queue">
              Answer
            </Link>
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
