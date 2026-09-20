import { useEffect, useState } from "react";
import { Link, useOutletContext } from "react-router-dom";
import type { AppSettings, EngineKind } from "@ml-aos/shared";
import { api } from "../lib/api";
import type { ThemeMode } from "../lib/theme";
import { pickFolder } from "../lib/tauri";
import type { AppOutletContext } from "../lib/app-context";

const THEMES: ThemeMode[] = ["dark", "light", "system"];
const ENGINES: EngineKind[] = ["mock", "claude", "codex"];

const THEME_LABEL: Record<ThemeMode, string> = {
  dark: "深色",
  light: "浅色",
  system: "跟随系统",
};

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
          setStatus(err instanceof Error ? err.message : "加载失败");
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
      setStatus("已保存");
    } catch (err: unknown) {
      setStatus(err instanceof Error ? err.message : "保存失败");
    } finally {
      setBusy(false);
    }
  }

  function handleTheme(mode: ThemeMode) {
    onThemeChange(mode);
    setSettings((prev) => (prev ? { ...prev, theme: mode } : prev));
    setStatus("主题已更新");
  }

  async function handleBrowseDataDir() {
    const path = await pickFolder();
    if (path) await persist({ dataDir: path });
  }

  if (!settings) {
    return (
      <div className="page">
        <p className="muted">正在加载设置…</p>
      </div>
    );
  }

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <p className="muted">设置</p>
          <h1>应用偏好</h1>
          <p className="page-lead">全局设置与开发环境配置。</p>
        </div>
        <Link className="btn-ghost" to="/">
          返回首页
        </Link>
      </header>

      <section className="panel-form">
        <h2 className="section-title">执行引擎</h2>
        <label className="field">
          <span>默认引擎</span>
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
        <h2 className="section-title">工作区环境</h2>
        <label className="field">
          <span>默认数据目录</span>
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
              浏览
            </button>
          </div>
          <span className="field-hint">
            用于存放智能体日志、上下文文件与临时产物。
          </span>
        </label>
      </section>

      <section className="panel-form">
        <h2 className="section-title">界面</h2>
        <div className="settings-row">
          <div>
            <strong>外观</strong>
            <p className="field-hint">在深色与浅色高对比模式之间切换。</p>
          </div>
          <div className="segmented" role="group" aria-label="主题">
            {THEMES.map((mode) => (
              <button
                key={mode}
                type="button"
                className={theme === mode ? "active" : ""}
                onClick={() => handleTheme(mode)}
                disabled={busy}
              >
                {THEME_LABEL[mode]}
              </button>
            ))}
          </div>
        </div>
        <label className="field checkbox-field settings-row">
          <div>
            <strong>系统通知</strong>
            <p className="field-hint">
              当智能体需要人工确认（HITL）时提醒我。
            </p>
          </div>
          <input
            type="checkbox"
            checked={settings.notifications}
            disabled={busy}
            onChange={(e) => persist({ notifications: e.target.checked })}
          />
        </label>
      </section>

      {status ? <p className="form-status">{status}</p> : null}
    </div>
  );
}
