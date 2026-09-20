import { Link } from "react-router-dom";
import { useShell } from "../../lib/shell-context";
import { botInitial, botTone } from "../../lib/bot-style";
import type { ThemeMode } from "../../lib/theme";
import { IconSearch, IconSettings } from "./icons";

const CYCLE: ThemeMode[] = ["dark", "light", "system"];

function nextMode(mode: ThemeMode): ThemeMode {
  const idx = CYCLE.indexOf(mode);
  return CYCLE[(idx + 1) % CYCLE.length];
}

function label(mode: ThemeMode): string {
  if (mode === "dark") return "深色";
  if (mode === "light") return "浅色";
  return "跟随系统";
}

interface TopBarProps {
  theme: ThemeMode;
  onThemeChange: (mode: ThemeMode) => void;
}

export function TopBar({ theme, onThemeChange }: TopBarProps) {
  const { bots, enabledBots } = useShell();
  const online = enabledBots.length;
  const shown = (enabledBots.length > 0 ? enabledBots : bots).slice(0, 4);

  return (
    <header className="topbar">
      <div className="topbar-left">
        <div className="brand">
          <span className="brand-mark" aria-hidden>
            ML
          </span>
          <span className="brand-name">ML AOS</span>
        </div>
        <div className="topbar-search">
          <IconSearch className="topbar-search-icon" />
          <input
            type="search"
            placeholder="搜索工作区…"
            aria-label="搜索工作区"
          />
        </div>
      </div>

      <div className="topbar-actions">
        <div className="agent-status" title="智能体状态" aria-label="智能体状态">
          <div className="agent-stack">
            {shown.map((bot) => (
              <span
                key={bot.id}
                className={`agent-avatar tone-${botTone(bot)} ${bot.enabled ? "online" : "idle"}`}
                title={bot.name}
              >
                {botInitial(bot)}
              </span>
            ))}
            {shown.length === 0 ? (
              <>
                <span className="agent-avatar tone-ceo online" />
                <span className="agent-avatar tone-dev online" />
                <span className="agent-avatar tone-test idle" />
              </>
            ) : null}
          </div>
          <span className="agent-count">{online} 个智能体在线</span>
        </div>

        <button
          type="button"
          className="icon-btn"
          onClick={() => onThemeChange(nextMode(theme))}
          title={`主题：${label(theme)}`}
          aria-label={`主题 ${label(theme)}`}
        >
          {theme === "light" ? "☀" : theme === "dark" ? "☾" : "◐"}
        </button>

        <Link
          to="/settings"
          className="icon-btn"
          aria-label="设置"
          title="设置"
        >
          <IconSettings />
        </Link>
      </div>
    </header>
  );
}
