import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import type { Workspace } from "@ml-aos/shared";
import { api } from "../lib/api";
import { pickFolder } from "../lib/tauri";

export function WorkspaceFormPage() {
  const { id } = useParams<{ id: string }>();
  const isNew = !id || id === "new";
  const navigate = useNavigate();

  const [name, setName] = useState("");
  const [localPath, setLocalPath] = useState("");
  const [gitUrl, setGitUrl] = useState("");
  const [workspaceId, setWorkspaceId] = useState<string | null>(
    isNew ? null : id,
  );
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(!isNew);

  useEffect(() => {
    if (isNew) return;
    let cancelled = false;
    setLoading(true);
    api
      .listWorkspaces()
      .then((list) => {
        if (cancelled) return;
        const ws = list.find((w) => w.id === id);
        if (!ws) {
          setStatus("Workspace not found");
          return;
        }
        applyWorkspace(ws);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setStatus(err instanceof Error ? err.message : "Failed to load");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id, isNew]);

  function applyWorkspace(ws: Workspace) {
    setWorkspaceId(ws.id);
    setName(ws.name);
    setLocalPath(ws.localPath);
    setGitUrl(ws.gitUrl ?? "");
  }

  async function handleBrowse() {
    const path = await pickFolder();
    if (path) setLocalPath(path);
  }

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setStatus(null);
    try {
      const payload = {
        name: name.trim(),
        localPath: localPath.trim(),
        gitUrl: gitUrl.trim() || undefined,
      };
      const ws = workspaceId
        ? await api.updateWorkspace(workspaceId, payload)
        : await api.createWorkspace(payload);
      applyWorkspace(ws);
      setStatus("Saved");
      if (isNew) {
        navigate(`/workspaces/${ws.id}`, { replace: true });
      }
    } catch (err: unknown) {
      setStatus(err instanceof Error ? err.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  async function handleClone() {
    if (!workspaceId) {
      setStatus("Save the workspace before cloning");
      return;
    }
    setBusy(true);
    setStatus(null);
    try {
      const ws = await api.cloneWorkspace(workspaceId);
      applyWorkspace(ws);
      setStatus("Clone started / completed");
    } catch (err: unknown) {
      setStatus(err instanceof Error ? err.message : "Clone failed");
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="page">
        <p className="muted">Loading workspace…</p>
      </div>
    );
  }

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <p className="muted">Workspace</p>
          <h1>{isNew ? "Create Workspace" : "Edit Workspace"}</h1>
          <p className="page-lead">
            Bind a local directory to a Git repository for agent collaboration.
          </p>
        </div>
        <Link className="btn-ghost" to="/">
          Back home
        </Link>
      </header>

      <form className="panel-form" onSubmit={handleSave}>
        <label className="field">
          <span>Workspace Name</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. backend-api-refactor"
            required
          />
        </label>

        <label className="field">
          <span>Local Project Path</span>
          <div className="field-row">
            <input
              value={localPath}
              onChange={(e) => setLocalPath(e.target.value)}
              placeholder="/Users/username/projects/repo"
              required
              className="mono"
            />
            <button type="button" className="btn-ghost" onClick={handleBrowse}>
              Browse
            </button>
          </div>
          <span className="field-hint">
            Agents operate in this directory. Prefer an absolute path.
          </span>
        </label>

        <label className="field">
          <span>Git URL (optional)</span>
          <input
            value={gitUrl}
            onChange={(e) => setGitUrl(e.target.value)}
            placeholder="https://github.com/org/repo.git"
            className="mono"
          />
          <span className="field-hint">
            Enables clone into an empty local path when provided.
          </span>
        </label>

        {status ? <p className="form-status">{status}</p> : null}

        <div className="form-actions">
          <button
            type="button"
            className="btn-ghost"
            disabled={busy || !workspaceId || !gitUrl.trim()}
            onClick={handleClone}
          >
            Clone
          </button>
          <button type="submit" className="btn-primary" disabled={busy}>
            {busy ? "Saving…" : "Save"}
          </button>
        </div>
      </form>
    </div>
  );
}
