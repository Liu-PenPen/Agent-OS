import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import type { BotConfig, PipelineTask } from "@ml-aos/shared";
import { api } from "../lib/api";

const STAGE_LABEL: Record<string, string> = {
  idle: "空闲",
  developing: "开发中",
  testing: "测试中",
  reviewing: "审查中",
  completed: "已完成",
  blocked: "已阻塞",
};

const STATUS_LABEL: Record<string, string> = {
  pending: "待开始",
  running: "进行中",
  done: "已完成",
  failed: "失败",
};

function stageLabel(stage: string): string {
  return STAGE_LABEL[stage] ?? stage;
}

function statusLabel(status: string): string {
  return STATUS_LABEL[status] ?? status;
}

export function PipelineDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [task, setTask] = useState<PipelineTask | null>(null);
  const [bots, setBots] = useState<BotConfig[]>([]);
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    setStatus(null);
    Promise.all([api.getPipeline(id), api.listBots()])
      .then(([t, botList]) => {
        if (!cancelled) {
          setTask(t);
          setBots(botList);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setTask(null);
          setStatus(err instanceof Error ? err.message : "加载失败");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  function botName(botId: string | undefined): string | undefined {
    if (!botId) return undefined;
    return bots.find((b) => b.id === botId)?.name ?? botId;
  }

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <p className="muted">流水线</p>
          <h1>{task?.title ?? "流水线详情"}</h1>
          <p className="page-lead mono">
            {id ? `ID: ${id}` : "缺少流水线 ID"}
            {task ? ` · ${stageLabel(task.stage)}` : ""}
          </p>
          <p className="muted">
            阶段由 CEO 通过 dispatch_task 协作推进，不再提供手动启动/推进。
          </p>
        </div>
        <div className="form-actions">
          <Link className="btn-ghost" to="/">
            返回首页
          </Link>
        </div>
      </header>

      {task ? (
        <ol className="pipeline-detail-list">
          {task.stages.map((step) => {
            const assignee = botName(step.botId);
            return (
              <li
                key={step.stage}
                className={`pipeline-detail-step status-${step.status} ${
                  step.stage === task.stage ? "current" : ""
                }`}
              >
                <div className="pipeline-detail-head">
                  <strong>{stageLabel(step.stage)}</strong>
                  <span className="status-chip">{statusLabel(step.status)}</span>
                </div>
                {assignee ? <p className="muted">负责人：{assignee}</p> : null}
                {step.detail ? (
                  <p className="pipeline-stage-detail">{step.detail}</p>
                ) : (
                  <p className="muted">暂无阶段详情</p>
                )}
                {step.at ? (
                  <p className="muted mono">
                    {new Date(step.at).toLocaleString("zh-CN")}
                  </p>
                ) : null}
              </li>
            );
          })}
        </ol>
      ) : (
        <p className="muted">
          {status ?? "尚未加载流水线。请 @CEO 助理并用 dispatch_task 协作。"}
        </p>
      )}

      {status && task ? <p className="form-status">{status}</p> : null}
    </div>
  );
}
