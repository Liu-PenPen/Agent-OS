import { Link, useNavigate } from "react-router-dom";
import type { PipelineStage } from "@ml-aos/shared";
import { useShell } from "../../lib/shell-context";

const STAGES = [
  { key: "developing" as const, label: "Developing" },
  { key: "testing" as const, label: "Testing" },
  { key: "reviewing" as const, label: "Reviewing" },
  { key: "completed" as const, label: "Done" },
];

function stageIndex(stage: PipelineStage | undefined): number {
  if (!stage) return -1;
  return STAGES.findIndex((s) => s.key === stage);
}

export function RightPanel() {
  const navigate = useNavigate();
  const {
    workspace,
    selectedTopic,
    pipeline,
    pendingCount,
    pendingPreview,
    dispatchTopic,
  } = useShell();

  const pipelineId = pipeline?.id ?? selectedTopic?.pipelineTaskId;
  const activeStage = pipeline?.stage ?? selectedTopic?.pipelineStage;
  const activeIndex = stageIndex(activeStage);

  return (
    <aside className="right-panel">
      <section>
        <h2>
          {pipelineId ? (
            <button
              type="button"
              className="linkish"
              onClick={() => navigate(`/pipelines/${pipelineId}`)}
            >
              Pipeline
            </button>
          ) : (
            "Pipeline"
          )}
        </h2>
        <ol className="pipeline-stepper">
          {STAGES.map((stage, i) => {
            const stepStatus = pipeline?.stages.find(
              (s) => s.stage === stage.key,
            )?.status;
            const isActive =
              activeIndex === i ||
              stepStatus === "running" ||
              (activeStage === "completed" && stage.key === "completed");
            return (
              <li
                key={stage.key}
                className={isActive ? "active" : ""}
                role={pipelineId ? "button" : undefined}
                tabIndex={pipelineId ? 0 : undefined}
                onClick={() => {
                  if (pipelineId) navigate(`/pipelines/${pipelineId}`);
                }}
                onKeyDown={(e) => {
                  if (!pipelineId) return;
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    navigate(`/pipelines/${pipelineId}`);
                  }
                }}
              >
                <span className="step-index">{i + 1}</span>
                {stage.label}
                {stepStatus ? (
                  <span className="muted step-status">{stepStatus}</span>
                ) : null}
              </li>
            );
          })}
        </ol>
        {!pipelineId && selectedTopic ? (
          <button
            type="button"
            className="btn-primary"
            style={{ marginTop: 10, width: "100%" }}
            onClick={() => void dispatchTopic(selectedTopic.title)}
          >
            Dispatch pipeline
          </button>
        ) : null}
      </section>
      <section>
        <h2>
          <Link to="/queue">
            Needs you{" "}
            {pendingCount > 0 ? (
              <span className="badge">{pendingCount}</span>
            ) : null}
          </Link>
        </h2>
        {pendingPreview?.clarification ? (
          <div className="hitl-card">
            <p>{pendingPreview.clarification.prompt}</p>
            <div className="hitl-actions">
              <Link className="btn-ghost" to="/queue">
                Open queue
              </Link>
              <Link className="btn-primary" to="/queue">
                Answer
              </Link>
            </div>
          </div>
        ) : (
          <p className="muted">No pending clarifications</p>
        )}
      </section>
      <section className="meta">
        <h2>Context</h2>
        <dl>
          <dt>cwd</dt>
          <dd className="mono">{workspace?.localPath ?? "—"}</dd>
          <dt>git</dt>
          <dd className="mono">{workspace?.gitUrl ?? "—"}</dd>
          <dt>engine</dt>
          <dd>mock</dd>
          <dt>stage</dt>
          <dd>{activeStage ?? "idle"}</dd>
        </dl>
      </section>
    </aside>
  );
}
