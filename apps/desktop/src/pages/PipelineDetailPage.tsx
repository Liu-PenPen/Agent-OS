import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import type { PipelineTask } from "@ml-aos/shared";
import { api } from "../lib/api";

function stageLabel(stage: string): string {
  return stage.charAt(0).toUpperCase() + stage.slice(1);
}

export function PipelineDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [task, setTask] = useState<PipelineTask | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    setStatus(null);
    api
      .getPipeline(id)
      .then((t) => {
        if (!cancelled) setTask(t);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setTask(null);
          setStatus(err instanceof Error ? err.message : "Failed to load");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  async function handleAdvance() {
    if (!id) return;
    setBusy(true);
    setStatus(null);
    try {
      const next = await api.advancePipeline(id);
      setTask(next);
      setStatus("Advanced");
    } catch (err: unknown) {
      setStatus(err instanceof Error ? err.message : "Advance failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <p className="muted">Pipeline</p>
          <h1>{task?.title ?? "Pipeline detail"}</h1>
          <p className="page-lead mono">
            {id ? `ID: ${id}` : "Missing pipeline id"}
            {task ? ` · ${stageLabel(task.stage)}` : ""}
          </p>
        </div>
        <div className="form-actions">
          <button
            type="button"
            className="btn-primary"
            disabled={busy || !task || task.stage === "completed"}
            onClick={handleAdvance}
          >
            Advance
          </button>
          <Link className="btn-ghost" to="/">
            Back home
          </Link>
        </div>
      </header>

      {task ? (
        <ol className="pipeline-detail-list">
          {task.stages.map((step) => (
            <li
              key={step.stage}
              className={`pipeline-detail-step status-${step.status} ${
                step.stage === task.stage ? "current" : ""
              }`}
            >
              <div className="pipeline-detail-head">
                <strong>{stageLabel(step.stage)}</strong>
                <span className="status-chip">{step.status}</span>
              </div>
              {step.detail ? <p>{step.detail}</p> : null}
              {step.at ? (
                <p className="muted mono">{new Date(step.at).toLocaleString()}</p>
              ) : null}
            </li>
          ))}
        </ol>
      ) : (
        <p className="muted">
          {status ?? "No pipeline loaded. Dispatch from a topic first."}
        </p>
      )}

      {status && task ? <p className="form-status">{status}</p> : null}
    </div>
  );
}
