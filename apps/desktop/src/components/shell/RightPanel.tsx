import { Link, useNavigate } from "react-router-dom";
import type { PipelineStage } from "@ml-aos/shared";
import { useShell } from "../../lib/shell-context";
import {
  IconCheck,
  IconCode,
  IconFlask,
  IconMessage,
  IconShield,
} from "./icons";

const STAGES = [
  {
    key: "developing" as const,
    label: "开发中",
    detail: "智能体正在实现变更…",
    Icon: IconCode,
  },
  {
    key: "testing" as const,
    label: "测试中",
    detail: "等待代码完成",
    Icon: IconFlask,
  },
  {
    key: "reviewing" as const,
    label: "审查与 PR",
    detail: "等待最终构建",
    Icon: IconShield,
  },
  {
    key: "completed" as const,
    label: "完成",
    detail: "流水线已结束",
    Icon: IconCheck,
  },
];

const STAGE_SHORT: Record<string, string> = {
  idle: "空闲",
  developing: "开发中",
  testing: "测试中",
  reviewing: "审查中",
  completed: "已完成",
  blocked: "已阻塞",
};

function stepStatusLabel(status: string): string {
  if (status === "pending") return "待开始";
  if (status === "running") return "进行中";
  if (status === "done") return "已完成";
  if (status === "failed") return "失败";
  return status;
}

function stageIndex(stage: PipelineStage | undefined): number {
  if (!stage || stage === "idle" || stage === "blocked") return -1;
  return STAGES.findIndex((s) => s.key === stage);
}

export function RightPanel() {
  const navigate = useNavigate();
  const {
    workspace,
    selectedTopic,
    bots,
    pipeline,
    pendingCount,
    pendingPreview,
    dispatchTopic,
  } = useShell();

  const pipelineId = pipeline?.id ?? selectedTopic?.pipelineTaskId;
  const activeStage = pipeline?.stage ?? selectedTopic?.pipelineStage;
  const activeIndex = stageIndex(activeStage);
  const isBlocked = activeStage === "blocked";
  const synced =
    !isBlocked &&
    (activeStage === "developing" ||
      activeStage === "testing" ||
      activeStage === "reviewing");

  function botName(botId: string | undefined): string | undefined {
    if (!botId) return undefined;
    return bots.find((b) => b.id === botId)?.name ?? botId;
  }

  return (
    <aside className="right-panel">
      <button
        type="button"
        className="pipeline-header"
        onClick={() => {
          if (pipelineId) navigate(`/pipelines/${pipelineId}`);
        }}
      >
        <span>流水线状态</span>
        {isBlocked ? (
          <span className="pipeline-blocked-badge">Blocked</span>
        ) : (
          <span className={`sync-pill ${synced ? "live" : ""}`}>
            <span className="sync-dot" />
            {synced ? "同步中" : activeStage === "completed" ? "已完成" : "空闲"}
          </span>
        )}
      </button>

      <div className="right-panel-scroll">
        <section className="pipeline-section">
          <ol className="pipeline-stepper">
            {STAGES.map((stage, i) => {
              const stageEntry = pipeline?.stages.find(
                (s) => s.stage === stage.key,
              );
              const stepStatus = stageEntry?.status;
              const assignee = botName(stageEntry?.botId);
              const done =
                stepStatus === "done" ||
                (activeIndex > i && activeIndex >= 0) ||
                (activeStage === "completed" && i < STAGES.length);
              const isActive =
                !done &&
                (activeIndex === i ||
                  stepStatus === "running" ||
                  (activeStage === "completed" && stage.key === "completed") ||
                  (isBlocked && stepStatus === "failed"));
              const Icon = stage.Icon;
              const detailLine =
                stageEntry?.detail ??
                (stepStatus
                  ? stepStatusLabel(stepStatus)
                  : isActive
                    ? stage.detail
                    : done
                      ? "已完成"
                      : stage.detail);
              return (
                <li
                  key={stage.key}
                  className={[
                    done ? "done" : "",
                    isActive ? "active" : "",
                    !done && !isActive ? "pending" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
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
                  <div className="step-rail">
                    <span className="step-index">
                      {done ? <IconCheck /> : <Icon />}
                    </span>
                    {i < STAGES.length - 1 ? <span className="step-line" /> : null}
                  </div>
                  <div className="step-body">
                    <h5>
                      {stage.label}
                      {isActive && assignee ? (
                        <span className="step-assignee">{assignee}</span>
                      ) : null}
                    </h5>
                    <p>{detailLine}</p>
                  </div>
                </li>
              );
            })}
          </ol>
          {!pipelineId && selectedTopic ? (
            <button
              type="button"
              className="btn-primary dispatch-btn"
              onClick={() => void dispatchTopic(selectedTopic.title)}
            >
              启动流水线
            </button>
          ) : null}
        </section>

        <div className="env-section-label">工作环境</div>
        <section className="env-section">
          <div className="env-field">
            <label>当前工作目录</label>
            <div className="cwd-box mono">{workspace?.localPath ?? "—"}</div>
          </div>
          <div className="env-field">
            <label>引擎配置</label>
            <div className="env-tags">
              <span className="engine-tag">mock</span>
              <span className="muted">
                阶段：{STAGE_SHORT[activeStage ?? "idle"] ?? activeStage ?? "空闲"}
              </span>
            </div>
          </div>
          {workspace?.gitUrl ? (
            <div className="env-field">
              <label>Git</label>
              <div className="cwd-box mono">{workspace.gitUrl}</div>
            </div>
          ) : null}
        </section>
      </div>

      <div className="right-panel-footer">
        <Link to="/queue" className="hitl-banner">
          <span className="hitl-icon">
            <IconMessage />
          </span>
          <span>
            <strong>
              {pendingCount > 0
                ? `${pendingCount} 项待人工确认`
                : "暂无待确认项"}
            </strong>
            <span className="hitl-sub">
              {pendingPreview?.clarification?.prompt
                ? pendingPreview.clarification.prompt.slice(0, 48) +
                  (pendingPreview.clarification.prompt.length > 48 ? "…" : "")
                : "需要策略确认时会显示在这里"}
            </span>
          </span>
        </Link>
      </div>
    </aside>
  );
}
