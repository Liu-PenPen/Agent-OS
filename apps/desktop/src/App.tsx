import { useEffect, useState } from "react";
import { AppLayout } from "./components/shell/AppLayout";
import { HomePage } from "./pages/HomePage";
import { api } from "./lib/api";
import { applyTheme, type ThemeMode } from "./lib/theme";
import "./styles/tokens.css";
import "./styles/shell.css";

export default function App() {
  const [theme, setTheme] = useState<ThemeMode>("dark");

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
    <AppLayout theme={theme} onThemeChange={handleThemeChange}>
      <HomePage />
    </AppLayout>
  );
}
