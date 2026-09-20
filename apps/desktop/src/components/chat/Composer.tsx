import { useEffect, useMemo, useRef, useState } from "react";
import type { BotConfig } from "@ml-aos/shared";

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
  onDispatch,
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
      {mentioned ? (
        <div className="mention-chip-row">
          <span className="mention-chip">
            @{mentioned.name}
            <button
              type="button"
              className="chip-clear"
              aria-label="Clear mention"
              onClick={() => setMentionBotId(undefined)}
            >
              ×
            </button>
          </span>
        </div>
      ) : null}

      {pickerOpen ? (
        <ul className="mention-picker" role="listbox" aria-label="Mention bot">
          {filtered.length === 0 ? (
            <li className="muted">No enabled bots</li>
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
        placeholder="Message agents… use @ to mention"
        aria-label="Composer"
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
        <button
          type="button"
          className="btn-ghost"
          disabled={disabled}
          onClick={() => openPicker(false)}
        >
          @
        </button>
        <button
          type="button"
          className="btn-ghost"
          disabled={disabled}
          onClick={onDispatch}
        >
          Dispatch
        </button>
        <button
          type="button"
          className="btn-ghost"
          disabled={disabled}
          onClick={onAbort}
        >
          Abort
        </button>
        <button
          type="button"
          className="btn-primary"
          disabled={disabled || sending || !text.trim()}
          onClick={handleSend}
        >
          {sending ? "Sending…" : "Send"}
        </button>
      </div>
    </footer>
  );
}
