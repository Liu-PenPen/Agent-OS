import { Link } from "react-router-dom";
import { useShell } from "../../lib/shell-context";
import { TicketInbox } from "../tickets/TicketInbox";
import { IconMessage } from "./icons";

export function RightPanel() {
  const {
    pendingCount,
    pendingPreview,
    rightPanelCollapsed,
    toggleRightPanel,
  } = useShell();

  if (rightPanelCollapsed) {
    return (
      <aside className="right-panel is-collapsed" aria-label="右侧面板已折叠">
        <button
          type="button"
          className="right-panel-expand"
          onClick={toggleRightPanel}
          title="展开右侧面板"
          aria-label="展开右侧面板"
        >
          ‹
        </button>
      </aside>
    );
  }

  return (
    <aside className="right-panel" aria-label="工单">
      <TicketInbox onCollapse={toggleRightPanel} />

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
                : pendingPreview?.appTool?.title ||
                    pendingPreview?.appTool?.summary ||
                    pendingPreview?.content
                  ? (
                      pendingPreview.appTool?.title ||
                      pendingPreview.appTool?.summary ||
                      pendingPreview.content
                    ).slice(0, 48) + "…"
                  : "需要策略确认时会显示在这里"}
            </span>
          </span>
        </Link>
      </div>
    </aside>
  );
}
