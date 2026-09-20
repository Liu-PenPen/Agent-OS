import type { ThemeMode } from "../../lib/theme";

const CYCLE: ThemeMode[] = ["dark", "light", "system"];

function nextMode(mode: ThemeMode): ThemeMode {
  const idx = CYCLE.indexOf(mode);
  return CYCLE[(idx + 1) % CYCLE.length];
}

function label(mode: ThemeMode): string {
  if (mode === "dark") return "Dark";
  if (mode === "light") return "Light";
  return "System";
}

interface TopBarProps {
  theme: ThemeMode;
  onThemeChange: (mode: ThemeMode) => void;
}

export function TopBar({ theme, onThemeChange }: TopBarProps) {
  return (
    <header className="topbar">
      <div className="brand">
        <span className="brand-mark" aria-hidden>
          ML
        </span>
        <span className="brand-name">ML AOS</span>
      </div>
      <div className="topbar-search">
        <input type="search" placeholder="Search topics…" aria-label="Search" />
      </div>
      <div className="topbar-actions">
        <div className="bot-dots" title="Bot status" aria-label="Bot status">
          <span className="dot online" />
          <span className="dot online" />
          <span className="dot idle" />
        </div>
        <button
          type="button"
          className="theme-toggle"
          onClick={() => onThemeChange(nextMode(theme))}
          title={`Theme: ${label(theme)}`}
        >
          Theme · {label(theme)}
        </button>
      </div>
    </header>
  );
}
