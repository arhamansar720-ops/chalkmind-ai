"use client";

import { memo } from "react";
import ReactMarkdown from "react-markdown";
import rehypeKatex from "rehype-katex";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import { cn } from "@/lib/utils";

/** Markdown with GFM tables and KaTeX math ($...$ and $$...$$). Raw HTML is not rendered. */
export const Markdown = memo(function Markdown({ children, className }: { children: string; className?: string }) {
  return (
    <div className={cn("prose-cm", className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, [remarkMath, { singleDollarTextMath: true }]]}
        rehypePlugins={[[rehypeKatex, { throwOnError: false, strict: "ignore" }]]}
        components={{
          a: ({ href, children: c }) => (
            <a href={href} target="_blank" rel="noreferrer noopener">
              {c}
            </a>
          ),
        }}
      >
        {normalizeMath(children)}
      </ReactMarkdown>
    </div>
  );
});

/** Models sometimes use \( \) and \[ \] delimiters — convert them to $ forms. */
function normalizeMath(s: string): string {
  return s.replace(/\\\[([\s\S]+?)\\\]/g, (_, m: string) => `$$${m}$$`).replace(/\\\(([\s\S]+?)\\\)/g, (_, m: string) => `$${m}$`);
}
