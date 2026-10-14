import { Link } from "react-router-dom";
import { useShell } from "../../lib/shell-context";
import { BotAvatar } from "../BotAvatar";
import type { ThemeMode } from "../../lib/theme";

const CYCLE: ThemeMode[] = ["warm", "light", "dark", "system"];

function nextMode(mode: ThemeMode): ThemeMode {
  const idx = CYCLE.indexOf(mode);
  return CYCLE[(idx + 1) % CYCLE.length];
}

function label(mode: ThemeMode): string {
  if (mode === "warm") return "暖色";
  if (mode === "dark") return "深色";
  if (mode === "light") return "浅色";
  return "跟随系统";
}

interface TopBarProps {
  theme: ThemeMode;
  onThemeChange: (mode: ThemeMode) => void;
  showPanelToggle?: boolean;
}

export function TopBar({ theme, onThemeChange, showPanelToggle = false }: TopBarProps) {
  const { bots, enabledBots, rightPanelCollapsed, toggleRightPanel } =
    useShell();
  const online = enabledBots.length;
  const shown = (enabledBots.length > 0 ? enabledBots : bots).slice(0, 4);

  return (
    <header className="topbar">
      <div className="topbar-left">
        <Link to="/" className="brand" style={{ textDecoration: "none", color: "inherit" }} title="返回封面首页">
          <img className="brand-logo" src="/logo.png" alt="" />
          <span className="brand-name">MLAOS</span>
          <span className="brand-divider" aria-hidden />
          <span className="brand-slogan">智能体操作系统</span>
        </Link>
      </div>

      <div className="topbar-actions">
        <div className="agent-status" title="智能体状态" aria-label="智能体状态">
          <div className="agent-stack">
            {shown.map((bot) => (
              <BotAvatar
                key={bot.id}
                bot={bot}
                status={bot.enabled ? "online" : "idle"}
                title={bot.name}
              />
            ))}
            {shown.length === 0 ? (
              <>
                <BotAvatar bot={{ name: "CEO助理", role: "ceo" }} status="online" />
                <BotAvatar bot={{ name: "开发工程师", role: "developer" }} status="online" />
                <BotAvatar bot={{ name: "测试工程师", role: "tester" }} status="idle" />
              </>
            ) : null}
          </div>
          <span className="agent-count">{online} 个智能体在线</span>
        </div>

        {showPanelToggle ? (
          <button
            type="button"
            className="icon-btn"
            onClick={toggleRightPanel}
            title={rightPanelCollapsed ? "展开工单" : "折叠工单"}
            aria-label={rightPanelCollapsed ? "展开工单" : "折叠工单"}
            aria-pressed={!rightPanelCollapsed}
          >
            {rightPanelCollapsed ? "◧" : "◨"}
          </button>
        ) : null}

        <button
          type="button"
          className="icon-btn"
          onClick={() => onThemeChange(nextMode(theme))}
          title={`主题：${label(theme)}`}
          aria-label={`主题 ${label(theme)}`}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden>
            <circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" strokeWidth="1.8" />
            <path d="M12 4a8 8 0 0 0 0 16z" fill="currentColor" />
          </svg>
        </button>

      </div>
    </header>
  );
}
