import { useEffect, useState, type ReactNode } from "react";
import type { ChatMessage } from "@ml-aos/shared";

type RunCardProps = {
  message: ChatMessage;
  onAbort?: () => void;
  children: ReactNode;
};

function formatDuration(ms: number): string {
  const totalSeconds = Math.max(1, Math.round(ms / 1000));
  if (totalSeconds < 60) return `${totalSeconds} 秒`;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (seconds === 0) return `${minutes} 分钟`;
  return `${minutes} 分 ${seconds} 秒`;
}

function statusLabel(status: NonNullable<ChatMessage["run"]>["status"]): string {
  if (status === "running") return "执行中";
  if (status === "failed") return "失败";
  if (status === "cancelled") return "已中止";
  return "已完成";
}

function formatCount(value: number): string {
  if (value < 1000) return String(value);
  const compact = value / 1000;
  const digits = compact >= 100 ? 0 : 1;
  return `${compact.toFixed(digits).replace(/\.0$/, "")}k`;
}

function contextLine(
  used: number | undefined,
  windowTokens: number | undefined,
): string | null {
  if (used === undefined) return null;
  if (!windowTokens || used > windowTokens) {
    return `当前上下文约 ${formatCount(used)} tokens`;
  }
  const percentage = Math.round((used / windowTokens) * 100);
  return `当前上下文 ${formatCount(used)} / ${formatCount(windowTokens)}（${percentage}%）`;
}

function growthLine(
  used: number | undefined,
  start: number | undefined,
): string | null {
  if (used === undefined || start === undefined) return null;
  const delta = used - start;
  const change =
    delta >= 0
      ? `新增 ${formatCount(delta)}`
      : `减少 ${formatCount(Math.abs(delta))}`;
  return `本轮开始 ${formatCount(start)} · ${change}`;
}

export function RunCard({ message, onAbort, children }: RunCardProps) {
  const run = message.run;
  const live = Boolean(message.streaming) || run?.status === "running";
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!live) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [live]);

  const started = Date.parse(message.createdAt);
  const finished = run?.finishedAt ? Date.parse(run.finishedAt) : now;
  const elapsed =
    Number.isFinite(started) && (live || run?.finishedAt)
      ? formatDuration(Math.max(0, (live ? now : finished) - started))
      : null;
  const toolCount = run?.toolCount ?? 0;
  const status = live ? "running" : (run?.status ?? "success");
  const engine = run?.engine ?? "智能体";
  const step =
    run?.current ?? (toolCount > 0 ? "正在分析执行结果" : "正在理解任务");
  const tools = run?.tools ?? [];
  const context = contextLine(run?.contextUsed, run?.contextWindow);
  const growth = growthLine(run?.contextUsed, run?.contextStart);
  const visibleTools = tools.slice(-6);

  return (
    <section className={`run-block run-${status}`}>
      <header className="run-status">
        {engine} · {statusLabel(status)}
      </header>
      <div className="run-body">
        {live ? (
          <>
            <p className="run-step">{step}</p>
            <p className="run-metrics">
              {elapsed ?? "不到 1 秒"} · {toolCount} 次工具调用
            </p>
            {context ? <p className="run-usage">{context}</p> : null}
            {growth ? <p className="run-usage">{growth}</p> : null}
          </>
        ) : null}
        {live && visibleTools.length > 0 ? (
          <div className="run-activity">
            <p className="run-activity-title">
              最近完成（{visibleTools.length} / {toolCount || visibleTools.length}）
            </p>
            <ul>
              {visibleTools.map((tool, index) => (
                <li key={`${tool.name}-${index}`}>
                  <span className="run-tool-mark" aria-hidden>
                    ⚙
                  </span>
                  调用 {tool.name}
                  {tool.detail ? ` · ${tool.detail}` : ""}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        {children}
        {!live && (elapsed || toolCount > 0) ? (
          <details className="run-details">
            <summary>执行详情</summary>
            <p>
              {elapsed ? `耗时 ${elapsed}` : "已结束"}
              {` · ${toolCount} 次工具调用`}
            </p>
            {context ? <p>{context}</p> : null}
            {growth ? <p>{growth}</p> : null}
            {tools.length > 0 ? (
              <ul>
                {tools.map((tool, index) => (
                  <li key={`${tool.name}-detail-${index}`}>
                    {tool.name}
                    {tool.detail ? ` · ${tool.detail}` : ""}
                  </li>
                ))}
              </ul>
            ) : null}
          </details>
        ) : null}
        {live && onAbort ? (
          <button type="button" className="run-stop" onClick={onAbort}>
            停止任务
          </button>
        ) : null}
      </div>
    </section>
  );
}
