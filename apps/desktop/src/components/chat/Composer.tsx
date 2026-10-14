import { useEffect, useMemo, useRef, useState } from "react";
import type { BotConfig } from "@ml-aos/shared";
import { IconArrowUp, IconAt, IconChevronDown } from "../shell/icons";

type ComposerProps = {
  bots: BotConfig[];
  disabled?: boolean;
  sending?: boolean;
  onSend: (content: string, mentionBotId?: string) => void;
  onAbort: () => void;
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
  const [expanded, setExpanded] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const footerRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const footer = footerRef.current;
    const host = footer?.closest(".home-center");
    if (!footer || !(host instanceof HTMLElement)) return;
    const apply = () => {
      host.style.setProperty(
        "--composer-space",
        `${footer.offsetHeight + 20}px`,
      );
    };
    apply();
    const observer = new ResizeObserver(apply);
    observer.observe(footer);
    return () => observer.disconnect();
  }, []);

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
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "0px";
    const next = expanded ? Math.min(el.scrollHeight, 160) : Math.min(el.scrollHeight, 72);
    el.style.height = `${Math.max(next, 48)}px`;
  }, [text, expanded]);

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
      const withoutTrailingAt = prev.replace(/@[^\s@]*$/, "").trimEnd();
      return withoutTrailingAt ? `${withoutTrailingAt} ` : "";
    });
    textareaRef.current?.focus();
  }

  function handleChange(value: string) {
    setText(value);
    const atMatch = value.match(/@([^\s@]*)$/);
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
    <footer className="composer" ref={footerRef}>
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
          rows={1}
          placeholder="随心输入，用 @ 提及智能体；@Bot /compact 可整理上下文…"
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
              className="composer-tool"
              disabled={disabled}
              onClick={() => openPicker(false)}
              aria-label="提及智能体"
              title="提及"
            >
              <IconAt size={16} />
            </button>
            <button
              type="button"
              className="composer-quiet"
              disabled={disabled}
              onClick={onAbort}
            >
              全部中止
            </button>
            <button
              type="button"
              className={`composer-tool composer-fold${expanded ? " is-open" : ""}`}
              onClick={() => setExpanded((open) => !open)}
              aria-expanded={expanded}
              aria-label={expanded ? "收起输入框" : "展开输入框"}
              title={expanded ? "收起" : "展开"}
            >
              <IconChevronDown />
            </button>
          </div>
          <button
            type="button"
            className="composer-send"
            disabled={disabled || sending || !text.trim()}
            onClick={handleSend}
            aria-label={sending ? "发送中" : "发送"}
            title="发送"
          >
            <IconArrowUp />
          </button>
        </div>
      </div>
      <p className="composer-hint">
        Ctrl / ⌘ + Enter 发送 · 智能体执行可能需要几分钟
      </p>
    </footer>
  );
}
