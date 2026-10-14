import type { ReactNode } from "react";
import { NavLink } from "react-router-dom";
import { useShell } from "../../lib/shell-context";

type IconProps = { size?: number };

function Glyph({ tone, children }: { tone: string; children: ReactNode }) {
  return (
    <span className={`rail-glyph tone-${tone}`} aria-hidden>
      {children}
    </span>
  );
}

function IconDesk({ size = 22 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path
        fillRule="evenodd"
        d="M12 3.4 4.1 10.1c-.3.25-.5.6-.5 1V20.2c0 .9.7 1.6 1.6 1.6h13.6c.9 0 1.6-.7 1.6-1.6V11.1c0-.4-.2-.75-.5-1L12 3.4zm-1.7 12.4h3.4v6H10.3v-6z"
      />
    </svg>
  );
}

function IconInbox({ size = 22 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24">
      <path
        fill="currentColor"
        d="M5.2 6.2h13.6c.9 0 1.6.7 1.6 1.6v8.4c0 .9-.7 1.6-1.6 1.6H5.2c-.9 0-1.6-.7-1.6-1.6V7.8c0-.9.7-1.6 1.6-1.6z"
      />
      <path
        d="M4.4 8.1 12 13.2l7.6-5.1"
        fill="none"
        stroke="var(--rail-cut)"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <circle cx="17.6" cy="16.6" r="3.15" fill="var(--rail-mark)" />
      <path
        d="M16.3 16.6 17.3 17.6 19.1 15.6"
        fill="none"
        stroke="#fff"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconBoard({ size = 22 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <rect x="2.8" y="5" width="4.6" height="14" rx="1.15" />
      <rect x="9.7" y="5" width="4.6" height="14" rx="1.15" />
      <rect x="16.6" y="5" width="4.6" height="14" rx="1.15" />
    </svg>
  );
}

function IconClock({ size = 22 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path
        fillRule="evenodd"
        d="M12 4.6a7.4 7.4 0 1 0 0 14.8 7.4 7.4 0 0 0 0-14.8zm0 2.35a5.05 5.05 0 1 1 0 10.1 5.05 5.05 0 0 1 0-10.1z"
      />
      <path d="M11.05 8.15h1.9V12l2.35 1.45-.95 1.5-3.3-2.05V8.15z" />
      <path d="M16.15 2.7 19.5 3.85 17.15 6.35z" />
    </svg>
  );
}

function IconBots({ size = 22 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <circle cx="12" cy="4.3" r="1.25" />
      <path d="M11.15 5.5h1.7V7.4h-1.7z" />
      <path
        fillRule="evenodd"
        d="M5.4 8.2h13.2c1.3 0 2.3 1 2.3 2.3v6.6c0 1.3-1 2.3-2.3 2.3H5.4c-1.3 0-2.3-1-2.3-2.3v-6.6c0-1.3 1-2.3 2.3-2.3zm3.5 3.5a1.35 1.35 0 1 0 0 2.7 1.35 1.35 0 0 0 0-2.7zm6.2 0a1.35 1.35 0 1 0 0 2.7 1.35 1.35 0 0 0 0-2.7zM9.2 16.2h5.6v1.35H9.2z"
      />
    </svg>
  );
}

function IconGear({ size = 22 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path
        fillRule="evenodd"
        d="M10.1 2.7h3.8l.55 2.15a7.4 7.4 0 0 1 1.85.78l2.05-1.05 1.9 3.25-1.55 1.55c.12.62.12 1.25 0 1.86l1.55 1.55-1.9 3.25-2.05-1.05a7.4 7.4 0 0 1-1.85.78l-.55 2.15h-3.8l-.55-2.15a7.4 7.4 0 0 1-1.85-.78l-2.05 1.05-1.9-3.25 1.55-1.55a7.6 7.6 0 0 1 0-1.86L3.75 7.83l1.9-3.25 2.05 1.05a7.4 7.4 0 0 1 1.85-.78L10.1 2.7zM12 9.15a2.85 2.85 0 1 0 0 5.7 2.85 2.85 0 0 0 0-5.7z"
      />
    </svg>
  );
}

const ITEMS = [
  { to: "/workspace", label: "工作台", icon: IconDesk, tone: "desk", end: true },
  { to: "/queue", label: "待确认", icon: IconInbox, tone: "inbox", end: false },
  { to: "/board", label: "任务看板", icon: IconBoard, tone: "board", end: false },
  { to: "/schedules", label: "定时调度", icon: IconClock, tone: "clock", end: false },
  { to: "/bots", label: "智能体", icon: IconBots, tone: "bots", end: false },
  { to: "/settings", label: "设置", icon: IconGear, tone: "gear", end: false },
] as const;

export function AppRail() {
  const { pendingCount } = useShell();

  return (
    <nav className="app-rail" aria-label="产品导航">
      {ITEMS.map((item) => {
        const Icon = item.icon;
        return (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            title={item.label}
            className={({ isActive }) => (isActive ? "active" : undefined)}
          >
            <Glyph tone={item.tone}>
              <Icon />
              {item.to === "/queue" && pendingCount > 0 ? (
                <span className="rail-badge">{pendingCount > 9 ? "9+" : pendingCount}</span>
              ) : null}
            </Glyph>
            {item.label}
          </NavLink>
        );
      })}
    </nav>
  );
}
