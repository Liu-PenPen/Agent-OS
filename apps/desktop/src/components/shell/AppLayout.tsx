import type { ReactNode } from "react";
import { TopBar } from "./TopBar";
import { Sidebar } from "./Sidebar";
import { RightPanel } from "./RightPanel";
import type { ThemeMode } from "../../lib/theme";

interface AppLayoutProps {
  theme: ThemeMode;
  onThemeChange: (mode: ThemeMode) => void;
  children: ReactNode;
}

export function AppLayout({ theme, onThemeChange, children }: AppLayoutProps) {
  return (
    <div className="app-shell">
      <TopBar theme={theme} onThemeChange={onThemeChange} />
      <div className="app-body">
        <Sidebar />
        <main className="app-main">{children}</main>
        <RightPanel />
      </div>
    </div>
  );
}
