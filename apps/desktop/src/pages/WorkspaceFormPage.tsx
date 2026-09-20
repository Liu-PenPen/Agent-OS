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
          setStatus("未找到工作区");
          return;
        }
        applyWorkspace(ws);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setStatus(err instanceof Error ? err.message : "加载失败");
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
      setStatus("已保存");
      if (isNew) {
        navigate(`/workspaces/${ws.id}`, { replace: true });
      }
    } catch (err: unknown) {
      setStatus(err instanceof Error ? err.message : "保存失败");
    } finally {
      setBusy(false);
    }
  }

  async function handleClone() {
    if (!workspaceId) {
      setStatus("请先保存工作区再克隆");
      return;
    }
    setBusy(true);
    setStatus(null);
    try {
      const ws = await api.cloneWorkspace(workspaceId);
      applyWorkspace(ws);
      setStatus("克隆已开始 / 已完成");
    } catch (err: unknown) {
      setStatus(err instanceof Error ? err.message : "克隆失败");
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="page">
        <p className="muted">正在加载工作区…</p>
      </div>
    );
  }

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <p className="muted">工作区</p>
          <h1>{isNew ? "新建工作区" : "编辑工作区"}</h1>
          <p className="page-lead">
            将本地目录与 Git 仓库绑定，供智能体协作使用。
          </p>
        </div>
        <Link className="btn-ghost" to="/">
          返回首页
        </Link>
      </header>

      <form className="panel-form" onSubmit={handleSave}>
        <label className="field">
          <span>工作区名称</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="例如：backend-api-refactor"
            required
          />
        </label>

        <label className="field">
          <span>本地项目路径</span>
          <div className="field-row">
            <input
              value={localPath}
              onChange={(e) => setLocalPath(e.target.value)}
              placeholder="E:\\projects\\repo"
              required
              className="mono"
            />
            <button type="button" className="btn-ghost" onClick={handleBrowse}>
              浏览
            </button>
          </div>
          <span className="field-hint">
            智能体将在该目录中操作，建议使用绝对路径。
          </span>
        </label>

        <label className="field">
          <span>Git 地址（可选）</span>
          <input
            value={gitUrl}
            onChange={(e) => setGitUrl(e.target.value)}
            placeholder="https://github.com/org/repo.git"
            className="mono"
          />
          <span className="field-hint">
            填写后可在空本地目录执行克隆。
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
            克隆
          </button>
          <button type="submit" className="btn-primary" disabled={busy}>
            {busy ? "保存中…" : "保存"}
          </button>
        </div>
      </form>
    </div>
  );
}
