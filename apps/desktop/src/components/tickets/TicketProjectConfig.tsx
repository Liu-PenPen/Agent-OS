import { useEffect, useState } from "react";
import type { BotConfig } from "@ml-aos/shared";
import { api } from "../../lib/api";
import type { TicketEngine, TicketProject } from "./ticket-types";

function castIncludesBot(cast: string[], bot: BotConfig): boolean {
  return cast.some(
    (token) =>
      token === bot.id || token.toLowerCase() === bot.role.toLowerCase(),
  );
}

type TicketProjectConfigProps = {
  open: boolean;
  project: TicketProject | null;
  onClose: () => void;
  onSave: (next: TicketProject) => void;
};

export function TicketProjectConfig({
  open,
  project,
  onClose,
  onSave,
}: TicketProjectConfigProps) {
  const [localPath, setLocalPath] = useState("");
  const [engine, setEngine] = useState<TicketEngine>("claude");
  const [cast, setCast] = useState<string[]>([]);
  const [bots, setBots] = useState<BotConfig[]>([]);
  const [testBaseUrl, setTestBaseUrl] = useState("");
  const [testStartCommand, setTestStartCommand] = useState("");

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    api
      .listBots()
      .then((list) => {
        if (!cancelled) setBots(list.filter((bot) => bot.enabled));
      })
      .catch(() => {
        if (!cancelled) setBots([]);
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  useEffect(() => {
    if (!project) return;
    setLocalPath(project.localPath ?? "");
    setEngine(project.defaultEngine);
    setTestBaseUrl(project.testBaseUrl ?? "");
    setTestStartCommand(project.testStartCommand ?? "");
    if (bots.length === 0) {
      setCast([...project.cast]);
      return;
    }
    const selected = bots
      .filter((bot) => castIncludesBot(project.cast, bot))
      .map((bot) => bot.id);
    setCast(selected);
  }, [project, open, bots]);

  if (!open || !project) return null;

  function toggleBot(botId: string) {
    setCast((prev) =>
      prev.includes(botId) ? prev.filter((id) => id !== botId) : [...prev, botId],
    );
  }

  function handleSave() {
    onSave({
      ...project!,
      localPath: localPath.trim() || undefined,
      defaultEngine: engine,
      cast,
      testBaseUrl: testBaseUrl.trim() || undefined,
      testStartCommand: testStartCommand.trim() || undefined,
    });
    onClose();
  }

  return (
    <div className="ticket-config-layer" role="dialog" aria-label="工单项目配置">
      <button
        type="button"
        className="ticket-status-backdrop"
        aria-label="关闭"
        onClick={onClose}
      />
      <div className="ticket-config-sheet">
        <header className="ticket-status-head">
          <div>
            <p className="ticket-kicker">项目配置</p>
            <h3>{project.name}</h3>
            <p className="muted mono">{project.ident}</p>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="关闭">
            ×
          </button>
        </header>

        <label className="ticket-field">
          <span>本地工作目录</span>
          <input
            className="mono"
            value={localPath}
            placeholder="E:\\projects\\repo"
            onChange={(e) => setLocalPath(e.target.value)}
          />
          <span className="field-hint muted">
            每个 Gitee 项目对应不同本地路径；未配置时不能交给 CEO。
          </span>
        </label>

        <label className="ticket-field">
          <span>默认引擎</span>
          <select
            value={engine}
            onChange={(e) => setEngine(e.target.value as TicketEngine)}
          >
            <option value="claude">Claude Code</option>
            <option value="codex">Codex</option>
          </select>
        </label>

        <label className="ticket-field">
          <span>验收 baseURL</span>
          <input
            className="mono"
            value={testBaseUrl}
            placeholder="http://localhost:5173"
            onChange={(e) => setTestBaseUrl(e.target.value)}
          />
          <span className="field-hint muted">
            派给 tester 时注入；可选。纯库项目可不填，允许 skip。
          </span>
        </label>

        <label className="ticket-field">
          <span>启服命令</span>
          <input
            className="mono"
            value={testStartCommand}
            placeholder="pnpm dev"
            onChange={(e) => setTestStartCommand(e.target.value)}
          />
          <span className="field-hint muted">
            写入派测 prompt，由 tester 在工作目录自行执行；系统不会自动起服。
          </span>
        </label>

        <fieldset className="ticket-cast">
          <legend>参与 Bot（Cast）</legend>
          {bots.length === 0 ? (
            <p className="field-hint muted">还没有已启用的智能体。请先在智能体配置里新增并保存。</p>
          ) : (
            <ul>
              {bots.map((bot) => (
                <li key={bot.id}>
                  <label>
                    <input
                      type="checkbox"
                      checked={cast.includes(bot.id)}
                      onChange={() => toggleBot(bot.id)}
                    />
                    <span>{bot.name}</span>
                    <span className="muted mono">{bot.role}</span>
                  </label>
                </li>
              ))}
            </ul>
          )}
          <span className="field-hint muted">
            名单来自智能体配置。勾选后，这个项目只能派给这些成员。
          </span>
        </fieldset>

        <div className="ticket-config-actions">
          <button type="button" className="btn-ghost" onClick={onClose}>
            取消
          </button>
          <button type="button" className="btn-primary" onClick={handleSave}>
            保存配置
          </button>
        </div>
      </div>
    </div>
  );
}
