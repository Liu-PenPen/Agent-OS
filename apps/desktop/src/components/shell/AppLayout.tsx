import { Outlet } from "react-router-dom";
import { TopBar } from "./TopBar";
import { Sidebar } from "./Sidebar";
import { RightPanel } from "./RightPanel";
import { ShellProvider } from "../../lib/shell-context";
import type { ThemeMode } from "../../lib/theme";
import type { AppOutletContext } from "../../lib/app-context";

interface AppLayoutProps {
  theme: ThemeMode;
  onThemeChange: (mode: ThemeMode) => void;
}

export function AppLayout({ theme, onThemeChange }: AppLayoutProps) {
  const context: AppOutletContext = { theme, onThemeChange };

  return (
    <ShellProvider>
      <div className="app-shell">
        <TopBar theme={theme} onThemeChange={onThemeChange} />
        <div className="app-body">
          <Sidebar />
          <main className="app-main">
            <Outlet context={context} />
          </main>
          <RightPanel />
        </div>
      </div>
    </ShellProvider>
  );
}
