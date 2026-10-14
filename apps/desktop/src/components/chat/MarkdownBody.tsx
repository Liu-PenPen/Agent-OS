import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

type MarkdownBodyProps = {
  content: string;
  streaming?: boolean;
};

export function MarkdownBody({ content, streaming }: MarkdownBodyProps) {
  if (!content) {
    return (
      <div className={`md-body ${streaming ? "is-streaming" : ""}`}>
        <span className="stream-placeholder">…</span>
        {streaming ? <span className="stream-caret" aria-hidden /> : null}
      </div>
    );
  }

  return (
    <div className={`md-body ${streaming ? "is-streaming" : ""}`}>
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
      {streaming ? <span className="stream-caret" aria-hidden /> : null}
    </div>
  );
}
