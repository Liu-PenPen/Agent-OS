import type { ChatMessage } from "@ml-aos/shared";
import { ChoiceCard } from "./ChoiceCard";
import { api } from "../../lib/api";

export type ControlDecision = {
  token: string;
  action: "clarification" | "spec" | "approval" | "visual";
  answer?: string;
  decision?: "approved" | "rejected" | "false_positive" | "confirmed";
};

export function AppToolCard({
  message,
  onDecide,
}: {
  message: ChatMessage;
  onDecide: (decision: ControlDecision) => void;
}) {
  const tool = message.appTool;
  if (!tool) return null;
  const locked = tool.status !== "pending";

  if (tool.tool === "clarification") {
    const questions = (tool.questions ?? []).map((question) => ({
      id: question.id,
      prompt: question.prompt,
      options: question.options.map((option) => ({
        id: option.id,
        label: option.label,
        recommended: Boolean(option.recommended),
      })),
    }));
    if (questions.length === 0) {
      return (
        <section className="lark-card">
          <header className="lark-card-header">
            <strong>{tool.title || "需求确认"}</strong>
            <span>无法渲染选项</span>
          </header>
          <div className="lark-card-body">
            <p className="muted">确认卡缺少结构化选项，请让产品经理重新调用 request_clarification。</p>
          </div>
        </section>
      );
    }
    return (
      <ChoiceCard
        questions={questions}
        title={tool.title || "需求确认"}
        subtitle="点选后会在同一会话里继续"
        disabled={locked}
        onSubmit={(answer) =>
          onDecide({ token: tool.token, action: "clarification", answer })
        }
      />
    );
  }

  return (
    <section className="lark-card">
      <header className="lark-card-header">
        <strong>
          {tool.tool === "spec"
            ? "方案确认"
            : tool.tool === "approval"
              ? "高危操作审批"
              : tool.tool === "acceptance"
                ? "验收结果"
                : "视觉验收"}
        </strong>
        <span>
          {tool.tool === "acceptance"
            ? "已记录"
            : locked
              ? "已处理"
              : "待你确认"}
        </span>
      </header>
      <div className="lark-card-body">
        {tool.title ? <p className="lark-card-lead">{tool.title}</p> : null}
        {tool.summary ? <p>{tool.summary}</p> : null}
        {tool.detail && tool.tool !== "visual" ? (
          <p className="muted" style={{ whiteSpace: "pre-wrap" }}>
            {tool.detail}
          </p>
        ) : null}
        {tool.impact ? <p className="muted">影响：{tool.impact}</p> : null}
        {tool.rollback ? <p className="muted">回滚：{tool.rollback}</p> : null}
        {tool.specPath ? <p className="muted">规格：{tool.specPath}</p> : null}
        {tool.ticketsPath ? <p className="muted">任务：{tool.ticketsPath}</p> : null}
        {tool.documentUrl ? <p className="muted">{tool.documentUrl}</p> : null}
        {tool.imageUrl ? (
          <img
            className="visual-shot"
            alt="失败截图"
            src={`${api.baseUrl}${tool.imageUrl}`}
          />
        ) : null}
        <div className="lark-options">
          {tool.tool === "spec" ? (
            <>
              <button
                type="button"
                className="lark-option lark-option-primary"
                disabled={locked}
                onClick={() =>
                  onDecide({
                    token: tool.token,
                    action: "spec",
                    decision: "approved",
                  })
                }
              >
                确认方案
              </button>
              <button
                type="button"
                className="lark-option"
                disabled={locked}
                onClick={() =>
                  onDecide({
                    token: tool.token,
                    action: "spec",
                    decision: "rejected",
                  })
                }
              >
                退回修改
              </button>
            </>
          ) : null}
          {tool.tool === "approval" ? (
            <>
              <button
                type="button"
                className="lark-option lark-option-primary"
                disabled={locked}
                onClick={() =>
                  onDecide({
                    token: tool.token,
                    action: "approval",
                    decision: "approved",
                  })
                }
              >
                通过并继续
              </button>
              <button
                type="button"
                className="lark-option"
                disabled={locked}
                onClick={() =>
                  onDecide({
                    token: tool.token,
                    action: "approval",
                    decision: "rejected",
                  })
                }
              >
                拒绝
              </button>
            </>
          ) : null}
          {tool.tool === "visual" ? (
            <>
              <button
                type="button"
                className="lark-option"
                disabled={locked}
                onClick={() =>
                  onDecide({
                    token: tool.token,
                    action: "visual",
                    decision: "false_positive",
                  })
                }
              >
                误判放行
              </button>
              <button
                type="button"
                className="lark-option lark-option-primary"
                disabled={locked}
                onClick={() =>
                  onDecide({
                    token: tool.token,
                    action: "visual",
                    decision: "confirmed",
                  })
                }
              >
                确认是缺陷
              </button>
            </>
          ) : null}
        </div>
      </div>
    </section>
  );
}
