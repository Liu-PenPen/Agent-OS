import { useMemo, useState, type ReactNode } from "react";
import type { TicketDetail } from "./ticket-types";
import {
  isUsefulImageAlt,
  TicketImageLightbox,
} from "./TicketImageLightbox";

type TicketDetailDrawerProps = {
  open: boolean;
  loading: boolean;
  error: string | null;
  detail: TicketDetail | null;
  note: string;
  onNoteChange: (value: string) => void;
  onClose: () => void;
};

function formatWhen(value?: string): string {
  if (!value) return "未设置";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("zh-CN", { hour12: false });
}

const MD_IMG =
  /!\[([^\]]*)]\(\s*<?([^)\s>]+)>?\s*(?:["']([^"']*)["'])?\s*\)/g;
const HTML_IMG = /<img\b[^>]*\bsrc\s*=\s*["']([^"']+)["'][^>]*>/gi;

type DescPart =
  | { kind: "text"; value: string }
  | { kind: "image"; url: string; alt: string };

function parseDescription(description: string): DescPart[] {
  const parts: DescPart[] = [];
  let cursor = 0;
  const matches: Array<{
    index: number;
    length: number;
    url: string;
    alt: string;
  }> = [];

  for (const match of description.matchAll(MD_IMG)) {
    if (match.index == null || !match[2]) continue;
    matches.push({
      index: match.index,
      length: match[0].length,
      url: match[2].trim(),
      alt: (match[1] || match[3] || "").trim(),
    });
  }
  for (const match of description.matchAll(HTML_IMG)) {
    if (match.index == null || !match[1]) continue;
    matches.push({
      index: match.index,
      length: match[0].length,
      url: match[1].trim(),
      alt: "",
    });
  }
  matches.sort((a, b) => a.index - b.index);

  for (const match of matches) {
    if (match.index < cursor) continue;
    const before = description.slice(cursor, match.index);
    if (before.trim()) parts.push({ kind: "text", value: before });
    if (/^https?:\/\//i.test(match.url)) {
      parts.push({ kind: "image", url: match.url, alt: match.alt });
    }
    cursor = match.index + match.length;
  }
  const rest = description.slice(cursor);
  if (rest.trim()) parts.push({ kind: "text", value: rest });
  return parts;
}

function collectImageUrls(description: string, imageUrls: string[]): string[] {
  const fromDesc = parseDescription(description)
    .filter((p): p is Extract<DescPart, { kind: "image" }> => p.kind === "image")
    .map((p) => p.url);
  return [...new Set([...fromDesc, ...imageUrls])];
}

function DescriptionBody({
  description,
  imageUrls,
  onOpenImage,
}: {
  description: string;
  imageUrls: string[];
  onOpenImage: (url: string) => void;
}): ReactNode {
  const parts = parseDescription(description);
  const shown = new Set(
    parts.filter((p) => p.kind === "image").map((p) => p.url),
  );
  const extras = imageUrls.filter((url) => !shown.has(url));

  if (parts.length === 0 && extras.length === 0) {
    return <p className="ticket-empty-hint">（无描述）</p>;
  }

  return (
    <div className="ticket-detail-desc-rich">
      {parts.map((part, index) =>
        part.kind === "text" ? (
          <pre key={`t-${index}`} className="ticket-detail-desc-text">
            {part.value.trim()}
          </pre>
        ) : (
          <figure key={`i-${index}`} className="ticket-detail-figure">
            <button
              type="button"
              className="ticket-detail-figure-btn"
              onClick={() => onOpenImage(part.url)}
              title="点击放大"
            >
              <img src={part.url} alt={part.alt || "附图"} loading="lazy" />
            </button>
            {isUsefulImageAlt(part.alt) ? (
              <figcaption>{part.alt}</figcaption>
            ) : null}
          </figure>
        ),
      )}
      {extras.map((url) => (
        <figure key={url} className="ticket-detail-figure">
          <button
            type="button"
            className="ticket-detail-figure-btn"
            onClick={() => onOpenImage(url)}
            title="点击放大"
          >
            <img src={url} alt="附图" loading="lazy" />
          </button>
        </figure>
      ))}
    </div>
  );
}

export function TicketDetailDrawer({
  open,
  loading,
  error,
  detail,
  note,
  onNoteChange,
  onClose,
}: TicketDetailDrawerProps) {
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  const gallery = useMemo(
    () =>
      detail
        ? collectImageUrls(detail.description, detail.imageUrls)
        : [],
    [detail],
  );

  if (!open) return null;

  return (
    <div className="ticket-detail-layer" role="dialog" aria-label="工单详情">
      <div className="ticket-detail-sheet">
        <header className="ticket-status-head">
          <div>
            <p className="ticket-kicker">工单详情</p>
            <h3>{detail?.ident ?? "…"}</h3>
            <p className="muted">{detail?.title ?? (loading ? "加载中…" : "")}</p>
          </div>
          <button
            type="button"
            className="icon-btn"
            onClick={onClose}
            aria-label="关闭"
          >
            ×
          </button>
        </header>

        {loading ? (
          <div className="ticket-loading" role="status">
            <span className="ticket-loading-spinner" aria-hidden />
            <p>正在拉取 Gitee 详情…</p>
          </div>
        ) : error ? (
          <p className="ticket-empty-hint">{error}</p>
        ) : detail ? (
          <div className="ticket-detail-body">
            <dl className="ticket-detail-meta">
              <div>
                <dt>优先级</dt>
                <dd>
                  <span className="ticket-priority-badge">{detail.priority}</span>
                </dd>
              </div>
              <div>
                <dt>创建人</dt>
                <dd>{detail.authorName}</dd>
              </div>
              <div>
                <dt>计划开始</dt>
                <dd>{formatWhen(detail.planStartedAt)}</dd>
              </div>
              <div>
                <dt>截止时间</dt>
                <dd>{formatWhen(detail.deadline)}</dd>
              </div>
              <div>
                <dt>状态</dt>
                <dd>{detail.stateTitle || "—"}</dd>
              </div>
              <div>
                <dt>迭代</dt>
                <dd>{detail.sprintTitle}</dd>
              </div>
            </dl>

            <section className="ticket-detail-desc">
              <h4>描述</h4>
              <DescriptionBody
                description={detail.description}
                imageUrls={detail.imageUrls}
                onOpenImage={(url) => {
                  const idx = gallery.indexOf(url);
                  setLightboxIndex(idx >= 0 ? idx : 0);
                }}
              />
            </section>

            <section className="ticket-detail-note">
              <label htmlFor="ticket-hand-note">
                <span>补充说明</span>
              </label>
              <textarea
                id="ticket-hand-note"
                rows={4}
                value={note}
                placeholder="若 Gitee 描述不准，在此补充纠偏或约束…"
                onChange={(e) => onNoteChange(e.target.value)}
              />
            </section>

            <a
              className="ticket-detail-open"
              href={detail.url}
              target="_blank"
              rel="noreferrer"
            >
              在 Gitee 打开
            </a>
          </div>
        ) : null}
      </div>

      {lightboxIndex != null && gallery.length > 0 ? (
        <TicketImageLightbox
          urls={gallery}
          index={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
          onIndexChange={setLightboxIndex}
        />
      ) : null}
    </div>
  );
}
