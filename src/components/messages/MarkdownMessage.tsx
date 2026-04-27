"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark, oneLight } from "react-syntax-highlighter/dist/esm/styles/prism";
import { useTheme } from "next-themes";
import { Copy, Check } from "lucide-react";
import { useState, useCallback } from "react";

// Copy button component for code blocks
function CopyButton({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [code]);

  return (
    <button
      onClick={handleCopy}
      className="inline-flex items-center justify-center text-white/80 hover:text-white transition-colors opacity-0 group-hover:opacity-100 text-[12px] leading-none"
      title="Copy code"
    >
      {copied ? <Check className="size-[12px]" /> : <Copy className="size-[12px]" />}
    </button>
  );
}

export default function MarkdownMessage({ content }: { content: string }) {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";

  return (
    <div className="max-w-none text-inherit">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeRaw]}
        components={{
          h1: ({ children }) => (
            <h1 className="my-1 text-[20px] font-bold leading-tight text-inherit">{children}</h1>
          ),
          h2: ({ children }) => (
            <h2 className="my-1 text-[17px] font-semibold leading-tight text-inherit">{children}</h2>
          ),
          h3: ({ children }) => (
            <h3 className="my-1 text-[15px] font-semibold leading-snug text-inherit">{children}</h3>
          ),
          p: ({ children }) => <p className="my-1 text-[14px] leading-relaxed text-inherit">{children}</p>,
          ul: ({ children }) => <ul className="my-1 ml-5 list-disc text-inherit">{children}</ul>,
          ol: ({ children }) => <ol className="my-1 ml-5 list-decimal text-inherit">{children}</ol>,
          li: ({ children }) => <li className="my-0.5 text-[14px] leading-relaxed text-inherit">{children}</li>,
          blockquote: ({ children }) => (
            <blockquote className="my-1 border-l-2 border-current/40 pl-3 italic text-inherit/90">{children}</blockquote>
          ),
          table: ({ children }) => (
            <div className="my-2 overflow-x-auto">
              <table className="w-full border-collapse text-[13px] text-inherit">{children}</table>
            </div>
          ),
          thead: ({ children }) => <thead className="bg-black/10 dark:bg-white/10">{children}</thead>,
          th: ({ children }) => <th className="border border-current/20 px-2 py-1 text-left font-semibold">{children}</th>,
          td: ({ children }) => <td className="border border-current/20 px-2 py-1 align-top">{children}</td>,
          strong: ({ children }) => <strong className="font-semibold text-inherit">{children}</strong>,
          em: ({ children }) => <em className="italic text-inherit">{children}</em>,
          del: ({ children }) => <del className="text-inherit">{children}</del>,
          sub: ({ children }) => <sub className="text-[11px] text-inherit">{children}</sub>,
          sup: ({ children }) => <sup className="text-[11px] text-inherit">{children}</sup>,
          code: ({ inline, className, children, ...props }: any) => {
            const match = /language-(\w+)/.exec(className || "");
            const lang = match ? match[1] : "";
            const code = String(children);

            if (!inline && lang) {
              return (
                <div className="group relative my-2 rounded-lg overflow-hidden">
                  <div className="flex items-center justify-between px-3 py-1.5 bg-[#2d2d2d] dark:bg-[#1e1e1e] text-white/70 text-xs leading-none">
                    <span className="uppercase font-medium">{lang}</span>
                    <CopyButton code={code} />
                  </div>
                  <SyntaxHighlighter
                    style={isDark ? oneDark : oneLight}
                    language={lang}
                    PreTag="div"
                    customStyle={{
                      margin: 0,
                      padding: "12px 16px",
                      fontSize: "13px",
                      lineHeight: "1.5",
                      borderRadius: "0 0 8px 8px",
                    }}
                    {...props}
                  >
                    {code}
                  </SyntaxHighlighter>
                </div>
              );
            }

            // Inline code or code block without language
            return inline ? (
              <code className="rounded bg-black/10 dark:bg-white/10 px-1 py-0.5 text-[13px] text-inherit" {...props}>
                {children}
              </code>
            ) : (
              <code className="block rounded-md bg-black/10 dark:bg-white/10 p-2 text-[13px] text-inherit overflow-x-auto" {...props}>
                {children}
              </code>
            );
          },
          pre: ({ children }) => <>{children}</>,
          input: ({ type, checked, disabled }) =>
            type === "checkbox" ? (
              <span className="mr-1.5 opacity-70">•</span>
            ) : (
              <input type={type} disabled={disabled} />
            ),
          a: ({ href, children }) => (
            <a href={href} className="underline underline-offset-2 text-blue-500 hover:text-blue-600 opacity-90 hover:opacity-100">
              {children}
            </a>
          ),
          span: ({ children, style }: any) => (
            <span 
              style={style} 
              className="text-inherit"
            >
              {children}
            </span>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
