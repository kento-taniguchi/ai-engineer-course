import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

// AIの回答に含まれるマークダウン（**太字**・箇条書き・表・リンクなど）を
// 見やすく表示する部品。HTMLの直書きは表示しない設定（安全のため）。
export function Markdown({ content }: { content: string }) {
  return (
    <div className="space-y-2 break-words text-[15px] leading-[1.8]">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          p: ({ children }) => <p className="whitespace-pre-wrap">{children}</p>,
          strong: ({ children }) => <strong className="font-semibold text-ink">{children}</strong>,
          ul: ({ children }) => <ul className="list-disc space-y-1 pl-5">{children}</ul>,
          ol: ({ children }) => <ol className="list-decimal space-y-1 pl-5">{children}</ol>,
          h1: ({ children }) => <h3 className="pt-1 text-base font-bold">{children}</h3>,
          h2: ({ children }) => <h3 className="pt-1 text-base font-bold">{children}</h3>,
          h3: ({ children }) => <h4 className="pt-1 font-bold">{children}</h4>,
          a: ({ href, children }) => (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-caramel underline underline-offset-2 hover:opacity-80"
            >
              {children}
            </a>
          ),
          blockquote: ({ children }) => (
            <blockquote className="border-l-4 border-caramel/40 pl-3 text-muted">{children}</blockquote>
          ),
          code: ({ className, children }) =>
            className ? (
              <code className={`${className} block`}>{children}</code>
            ) : (
              <code className="rounded bg-sunken px-1 py-0.5 font-mono text-[0.85em] text-caramel">
                {children}
              </code>
            ),
          pre: ({ children }) => (
            <pre className="overflow-x-auto rounded-lg bg-roast p-3 font-mono text-xs text-on-roast">
              {children}
            </pre>
          ),
          table: ({ children }) => (
            <div className="overflow-x-auto">
              <table className="min-w-full border-collapse text-left text-xs">{children}</table>
            </div>
          ),
          th: ({ children }) => (
            <th className="border border-line bg-sunken px-2 py-1.5 font-semibold">{children}</th>
          ),
          td: ({ children }) => <td className="border border-line px-2 py-1.5">{children}</td>,
          hr: () => <hr className="border-line" />,
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
