import { useEffect, useState } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AppLayout } from "./components/shell/AppLayout";
import { LandingPage } from "./pages/LandingPage";
import { HomePage } from "./pages/HomePage";
import { WorkspaceFormPage } from "./pages/WorkspaceFormPage";
import { BotSettingsPage } from "./pages/BotSettingsPage";
import { AppSettingsPage } from "./pages/AppSettingsPage";
import { ClarificationQueuePage } from "./pages/ClarificationQueuePage";
import { SchedulesPage } from "./pages/SchedulesPage";
import { TaskBoardPage } from "./pages/TaskBoardPage";
import { PipelineDetailPage } from "./pages/PipelineDetailPage";
import { ShellProvider } from "./lib/shell-context";
import { api } from "./lib/api";
import { applyTheme, type ThemeMode } from "./lib/theme";
import "./styles/tokens.css";
import "./styles/shell.css";
import "./styles/pages.css";
import "./styles/tickets.css";

export default function App() {
  const [theme, setTheme] = useState<ThemeMode>("warm");

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  useEffect(() => {
    let cancelled = false;
    api
      .getSettings()
      .then((settings) => {
        if (!cancelled) setTheme(settings.theme);
      })
      .catch(() => {
        // Runtime may be offline during UI-only work.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleThemeChange(mode: ThemeMode) {
    setTheme(mode);
    applyTheme(mode);
    try {
      await api.setTheme(mode);
    } catch {
      // Persist best-effort; UI already updated.
    }
  }

  return (
    <BrowserRouter>
      <ShellProvider>
        <Routes>
          {/* 1. 独立封面首页展示界面 */}
          <Route
            path="/"
            element={<LandingPage />}
          />

          {/* 2. 工作区与工作台界面 */}
          <Route element={<AppLayout theme={theme} onThemeChange={handleThemeChange} />}>
            <Route path="workspace" element={<HomePage />} />
            <Route path="workspaces/new" element={<WorkspaceFormPage />} />
            <Route path="workspaces/:id" element={<WorkspaceFormPage />} />
            <Route path="bots" element={<BotSettingsPage />} />
            <Route path="settings" element={<AppSettingsPage />} />
            <Route path="queue" element={<ClarificationQueuePage />} />
            <Route path="board" element={<TaskBoardPage />} />
            <Route path="schedules" element={<SchedulesPage />} />
            <Route path="pipelines/:id" element={<PipelineDetailPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </ShellProvider>
    </BrowserRouter>
  );
}
