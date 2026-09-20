import { useEffect, useState } from "react";
import { Link, useOutletContext } from "react-router-dom";
import type { AppSettings, EngineKind } from "@ml-aos/shared";
import { api } from "../lib/api";
import type { ThemeMode } from "../lib/theme";
import { pickFolder } from "../lib/tauri";
import type { AppOutletContext } from "../lib/app-context";

const THEMES: ThemeMode[] = ["dark", "light", "system"];
const ENGINES: EngineKind[] = ["mock", "claude", "codex"];

export function AppSettingsPage() {
  const { theme, onThemeChange } = useOutletContext<AppOutletContext>();
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api
      .getSettings()
      .then((s) => {
        if (!cancelled) setSettings(s);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setStatus(err instanceof Error ? err.message : "Failed to load");
          setSettings({
            theme,
            defaultEngine: "mock",
            dataDir: "",
            notifications: true,
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [theme]);

  async function persist(patch: Partial<AppSettings>) {
    if (!settings) return;
    setBusy(true);
    setStatus(null);
    const next = { ...settings, ...patch };
    setSettings(next);
    try {
      const saved = await api.patchSettings(patch);
      setSettings(saved);
      setStatus("Saved");
    } catch (err: unknown) {
      setStatus(err instanceof Error ? err.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  function handleTheme(mode: ThemeMode) {
    onThemeChange(mode);
    setSettings((prev) => (prev ? { ...prev, theme: mode } : prev));
    setStatus("Theme updated");
  }

  async function handleBrowseDataDir() {
    const path = await pickFolder();
    if (path) await persist({ dataDir: path });
  }

  if (!settings) {
    return (
      <div className="page">
        <p className="muted">Loading settings…</p>
      </div>
    );
  }

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <p className="muted">Settings</p>
          <h1>App Preferences</h1>
          <p className="page-lead">
            Global settings and developer environment configuration.
          </p>
        </div>
        <Link className="btn-ghost" to="/">
          Back home
        </Link>
      </header>

      <section className="panel-form">
        <h2 className="section-title">Appearance</h2>
        <p className="field-hint">Governing theme for the workbench.</p>
        <div
          className="segmented"
          role="group"
          aria-label="Theme"
        >
          {THEMES.map((mode) => (
            <button
              key={mode}
              type="button"
              className={theme === mode ? "active" : ""}
              onClick={() => handleTheme(mode)}
              disabled={busy}
            >
              {mode.charAt(0).toUpperCase() + mode.slice(1)}
            </button>
          ))}
        </div>
      </section>

      <section className="panel-form">
        <h2 className="section-title">Execution Engines</h2>
        <label className="field">
          <span>Default Engine</span>
          <select
            value={settings.defaultEngine}
            disabled={busy}
            onChange={(e) =>
              persist({ defaultEngine: e.target.value as EngineKind })
            }
          >
            {ENGINES.map((engine) => (
              <option key={engine} value={engine}>
                {engine}
              </option>
            ))}
          </select>
        </label>
      </section>

      <section className="panel-form">
        <h2 className="section-title">Workspace Environment</h2>
        <label className="field">
          <span>Default Data Directory</span>
          <div className="field-row">
            <input
              className="mono"
              value={settings.dataDir}
              disabled={busy}
              onChange={(e) =>
                setSettings({ ...settings, dataDir: e.target.value })
              }
              onBlur={() => persist({ dataDir: settings.dataDir })}
            />
            <button
              type="button"
              className="btn-ghost"
              disabled={busy}
              onClick={handleBrowseDataDir}
            >
              Browse
            </button>
          </div>
        </label>
      </section>

      <section className="panel-form">
        <h2 className="section-title">Interaction</h2>
        <label className="field checkbox-field">
          <input
            type="checkbox"
            checked={settings.notifications}
            disabled={busy}
            onChange={(e) => persist({ notifications: e.target.checked })}
          />
          <span>System notifications for HITL confirmations</span>
        </label>
      </section>

      {status ? <p className="form-status">{status}</p> : null}
    </div>
  );
}
