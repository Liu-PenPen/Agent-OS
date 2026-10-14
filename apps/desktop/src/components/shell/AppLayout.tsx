import { Outlet, useLocation } from "react-router-dom";
import { TopBar } from "./TopBar";
import { AppRail } from "./AppRail";
import { Sidebar } from "./Sidebar";
import { RightPanel } from "./RightPanel";
import { useShell } from "../../lib/shell-context";
import type { ThemeMode } from "../../lib/theme";
import type { AppOutletContext } from "../../lib/app-context";

interface AppLayoutProps {
  theme: ThemeMode;
  onThemeChange: (mode: ThemeMode) => void;
}

export function AppLayout({ theme, onThemeChange }: AppLayoutProps) {
  const { rightPanelCollapsed } = useShell();
  const { pathname } = useLocation();
  const workspaceMode = pathname === "/workspace";
  const context: AppOutletContext = { theme, onThemeChange };
  const shellClass = [
    "app-shell",
    workspaceMode ? "" : "page-mode",
    workspaceMode && rightPanelCollapsed ? "right-collapsed" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={shellClass}>
      <TopBar
        theme={theme}
        onThemeChange={onThemeChange}
        showPanelToggle={workspaceMode}
      />
      <div className="app-body">
        <AppRail />
        {workspaceMode ? <Sidebar /> : null}
        <main className="app-main">
          <Outlet context={context} />
        </main>
        {workspaceMode ? <RightPanel /> : null}
      </div>
    </div>
  );
}
