import { useEffect, useMemo, useRef, useState } from "react";
import type { BotConfig } from "@ml-aos/shared";
import { IconAt, IconSend } from "../shell/icons";

type ComposerProps = {
  bots: BotConfig[];
  disabled?: boolean;
  sending?: boolean;
  onSend: (content: string, mentionBotId?: string) => void;
  onAbort: () => void;
  onDispatch: () => void;
};

export function Composer({
  bots,
  disabled,
  sending,
  onSend,
  onAbort,
}: ComposerProps) {
  const [text, setText] = useState("");
  const [mentionBotId, setMentionBotId] = useState<string | undefined>();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [filter, setFilter] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const mentioned = useMemo(
    () => bots.find((b) => b.id === mentionBotId),
    [bots, mentionBotId],
  );

  const filtered = useMemo(() => {
    const q = filter.toLowerCase();
    return bots.filter(
      (b) =>
        b.enabled &&
        (!q ||
          b.name.toLowerCase().includes(q) ||
          b.role.toLowerCase().includes(q)),
    );
  }, [bots, filter]);

  useEffect(() => {
    if (!mentionBotId) return;
    if (!bots.some((b) => b.id === mentionBotId && b.enabled)) {
      setMentionBotId(undefined);
    }
  }, [bots, mentionBotId]);

  function openPicker(fromAt = false) {
    setPickerOpen(true);
    setFilter(fromAt ? "" : filter);
  }

  function pickBot(bot: BotConfig) {
    setMentionBotId(bot.id);
    setPickerOpen(false);
    setFilter("");
    setText((prev) => {
      const withoutTrailingAt = prev.replace(/@[\w-]*$/, "").trimEnd();
      return withoutTrailingAt ? `${withoutTrailingAt} ` : "";
    });
    textareaRef.current?.focus();
  }

  function handleChange(value: string) {
    setText(value);
    const atMatch = value.match(/@([\w-]*)$/);
    if (atMatch) {
      setPickerOpen(true);
      setFilter(atMatch[1] ?? "");
    } else if (pickerOpen && !value.includes("@")) {
      setPickerOpen(false);
      setFilter("");
    }
  }

  function handleSend() {
    const content = text.trim();
    if (!content || disabled || sending) return;
    onSend(content, mentionBotId);
    setText("");
    setPickerOpen(false);
    setFilter("");
  }

  return (
    <footer className="composer">
      <div className="composer-box">
        {mentioned ? (
          <div className="mention-chip-row">
            <span className="mention-chip">
              @{mentioned.name}
              <button
                type="button"
                className="chip-clear"
                aria-label="清除提及"
                onClick={() => setMentionBotId(undefined)}
              >
                ×
              </button>
            </span>
          </div>
        ) : null}

        {pickerOpen ? (
          <ul className="mention-picker" role="listbox" aria-label="提及智能体">
            {filtered.length === 0 ? (
              <li className="muted">暂无已启用的智能体</li>
            ) : (
              filtered.map((bot) => (
                <li key={bot.id}>
                  <button type="button" onClick={() => pickBot(bot)}>
                    <strong>@{bot.name}</strong>
                    <span className="muted">{bot.role}</span>
                  </button>
                </li>
              ))
            )}
          </ul>
        ) : null}

        <textarea
          ref={textareaRef}
          rows={3}
          placeholder="向智能体发消息，输入 @ 可提及…"
          aria-label="输入框"
          value={text}
          disabled={disabled}
          onChange={(e) => handleChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
              e.preventDefault();
              handleSend();
            }
            if (e.key === "@" && !pickerOpen) {
              openPicker(true);
            }
            if (e.key === "Escape") {
              setPickerOpen(false);
            }
          }}
        />
        <div className="composer-actions">
          <div className="composer-tools">
            <button
              type="button"
              className="icon-btn"
              disabled={disabled}
              onClick={() => openPicker(false)}
              aria-label="提及智能体"
              title="提及"
            >
              <IconAt />
            </button>
          </div>
          <div className="composer-send-row">
            <button
              type="button"
              className="btn-abort"
              disabled={disabled}
              onClick={onAbort}
            >
              全部中止
            </button>
            <button
              type="button"
              className="btn-primary btn-send"
              disabled={disabled || sending || !text.trim()}
              onClick={handleSend}
            >
              {sending ? "发送中…" : "发送"}
              <IconSend />
            </button>
          </div>
        </div>
      </div>
      <p className="composer-hint">
        Ctrl / ⌘ + Enter 发送 · 智能体执行可能需要几分钟
      </p>
    </footer>
  );
}
