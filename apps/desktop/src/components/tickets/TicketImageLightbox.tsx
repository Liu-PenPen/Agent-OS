import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

type TicketImageLightboxProps = {
  urls: string[];
  index: number;
  onClose: () => void;
  onIndexChange: (index: number) => void;
};

function openInSystemBrowser(url: string) {
  window.open(url, "_blank", "noopener,noreferrer");
}

const MIN_ZOOM = 0.25;
const MAX_ZOOM = 5;

export function TicketImageLightbox({
  urls,
  index,
  onClose,
  onIndexChange,
}: TicketImageLightboxProps) {
  const safeIndex = Math.min(Math.max(index, 0), Math.max(urls.length - 1, 0));
  const url = urls[safeIndex];
  const stageRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);
  const [fitScale, setFitScale] = useState(1);
  const [natural, setNatural] = useState({ w: 0, h: 0 });

  useEffect(() => {
    setZoom(1);
    setFitScale(1);
    setNatural({ w: 0, h: 0 });
  }, [url]);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
        return;
      }
      if (event.key === "ArrowLeft" && urls.length > 1) {
        onIndexChange((safeIndex - 1 + urls.length) % urls.length);
      }
      if (event.key === "ArrowRight" && urls.length > 1) {
        onIndexChange((safeIndex + 1) % urls.length);
      }
      if (event.key === "+" || event.key === "=") {
        setZoom((z) => Math.min(MAX_ZOOM, Number((z * 1.15).toFixed(3))));
      }
      if (event.key === "-" || event.key === "_") {
        setZoom((z) => Math.max(MIN_ZOOM, Number((z / 1.15).toFixed(3))));
      }
      if (event.key === "0") setZoom(1);
    }
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose, onIndexChange, safeIndex, urls.length]);

  function recomputeFit(nw: number, nh: number) {
    const stage = stageRef.current;
    if (!stage || !nw || !nh) return;
    const pad = 24;
    const availW = Math.max(stage.clientWidth - pad, 80);
    const availH = Math.max(stage.clientHeight - pad, 80);
    const scale = Math.min(1, availW / nw, availH / nh);
    setFitScale(scale);
  }

  useEffect(() => {
    function onResize() {
      if (natural.w) recomputeFit(natural.w, natural.h);
    }
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [natural.w, natural.h]);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    function onWheel(event: WheelEvent) {
      event.preventDefault();
      const factor = event.deltaY < 0 ? 1.12 : 1 / 1.12;
      setZoom((z) => {
        const next = Number((z * factor).toFixed(3));
        return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, next));
      });
    }
    stage.addEventListener("wheel", onWheel, { passive: false });
    return () => stage.removeEventListener("wheel", onWheel);
  }, [url]);

  if (!url) return null;

  const displayScale = fitScale * zoom;
  const displayW = natural.w ? natural.w * displayScale : undefined;
  const displayH = natural.h ? natural.h * displayScale : undefined;
  const zoomPercent = Math.round(zoom * 100);

  return createPortal(
    <div
      className="ticket-lightbox"
      role="dialog"
      aria-modal="true"
      aria-label="附图预览"
    >
      <button
        type="button"
        className="ticket-lightbox-backdrop"
        aria-label="关闭"
        onClick={onClose}
      />
      <div className="ticket-lightbox-dialog">
        <header className="ticket-lightbox-head">
          <span className="mono">
            {urls.length > 1 ? `${safeIndex + 1} / ${urls.length}` : "附图预览"}
            <em className="ticket-lightbox-zoom-label">{zoomPercent}%</em>
          </span>
          <div className="ticket-lightbox-actions">
            <button
              type="button"
              className="ticket-lightbox-tool"
              onClick={() =>
                setZoom((z) => Math.max(MIN_ZOOM, Number((z / 1.2).toFixed(3))))
              }
              title="缩小"
            >
              −
            </button>
            <button
              type="button"
              className="ticket-lightbox-tool"
              onClick={() => setZoom(1)}
              title="适配窗口"
            >
              适配
            </button>
            <button
              type="button"
              className="ticket-lightbox-tool"
              onClick={() =>
                setZoom((z) => Math.min(MAX_ZOOM, Number((z * 1.2).toFixed(3))))
              }
              title="放大"
            >
              +
            </button>
            <button
              type="button"
              className="ticket-lightbox-link"
              onClick={() => openInSystemBrowser(url)}
            >
              系统浏览器打开
            </button>
            <button
              type="button"
              className="icon-btn ticket-lightbox-close"
              aria-label="关闭"
              onClick={onClose}
            >
              ×
            </button>
          </div>
        </header>
        <div className="ticket-lightbox-stage" ref={stageRef}>
          {urls.length > 1 ? (
            <button
              type="button"
              className="ticket-lightbox-nav is-prev"
              aria-label="上一张"
              onClick={() =>
                onIndexChange((safeIndex - 1 + urls.length) % urls.length)
              }
            >
              ‹
            </button>
          ) : null}
          <div
            className={
              zoom > 1.01
                ? "ticket-lightbox-scroll is-zoomed"
                : "ticket-lightbox-scroll"
            }
          >            <img
              src={url}
              alt=""
              style={
                displayW && displayH
                  ? { width: displayW, height: displayH }
                  : undefined
              }
              onLoad={(event) => {
                const img = event.currentTarget;
                const nw = img.naturalWidth;
                const nh = img.naturalHeight;
                setNatural({ w: nw, h: nh });
                // wait a frame so stage has layout
                requestAnimationFrame(() => recomputeFit(nw, nh));
              }}
            />
          </div>
          {urls.length > 1 ? (
            <button
              type="button"
              className="ticket-lightbox-nav is-next"
              aria-label="下一张"
              onClick={() => onIndexChange((safeIndex + 1) % urls.length)}
            >
              ›
            </button>
          ) : null}
        </div>
        <p className="ticket-lightbox-hint">
          滚轮缩放 · − / + 或键盘调节 · 0 /「适配」恢复全图 · Esc 关闭
        </p>
      </div>
    </div>,
    document.body,
  );
}

export function isUsefulImageAlt(alt: string): boolean {
  const value = alt.trim();
  if (!value) return false;
  return !/^(输入图片说明|图片|image|screenshot|截图|附图)$/i.test(value);
}
