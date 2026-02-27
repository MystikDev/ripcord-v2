/**
 * @module message-content
 * Renders message text with Markdown formatting (bold, italic, code, lists,
 * blockquotes, etc.) and clickable URLs. Links open in the default browser
 * via Tauri shell plugin (desktop) or window.open (web).
 */
'use client';

import { useCallback, useMemo } from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { Components } from 'react-markdown';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface MessageContentProps {
  content: string;
}

// ---------------------------------------------------------------------------
// Markdown token detection (fast path)
// ---------------------------------------------------------------------------

/**
 * Quick check for any markdown-ish tokens so we can skip the parser for
 * plain text messages (the vast majority). This is intentionally loose —
 * false positives just mean we run the parser, which is fine.
 */
const MD_HINT = /[*_~`#>|\-\[\]\\]|\n/;

// ---------------------------------------------------------------------------
// Shared styles
// ---------------------------------------------------------------------------

const BASE_STYLE = {
  fontSize: 'var(--font-size-base, 14px)',
  color: 'var(--color-chat-text, var(--color-text-secondary))',
} as const;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function MessageContent({ content }: MessageContentProps) {
  // Open links via Tauri shell (desktop) or window.open (web)
  const handleLinkClick = useCallback(
    async (e: React.MouseEvent<HTMLAnchorElement>) => {
      e.preventDefault();
      const url = e.currentTarget.href;
      try {
        const { open } = await import('@tauri-apps/plugin-shell');
        await open(url);
      } catch {
        window.open(url, '_blank', 'noopener,noreferrer');
      }
    },
    [],
  );

  // Custom component overrides for react-markdown
  const components = useMemo<Components>(
    () => ({
      // Links — use Tauri shell open
      a: ({ href, children }) => (
        <a
          href={href}
          onClick={handleLinkClick}
          className="text-accent underline decoration-accent/40 underline-offset-2 hover:decoration-accent transition-colors"
          title={href}
        >
          {children}
        </a>
      ),
      // Inline code
      code: ({ children, className }) => {
        // Fenced code block (has language class from remark)
        if (className) {
          return (
            <code className={`${className} text-[0.9em]`}>{children}</code>
          );
        }
        // Inline code
        return (
          <code className="rounded bg-surface-3 px-1.5 py-0.5 text-[0.9em] font-mono text-text-primary">
            {children}
          </code>
        );
      },
      // Fenced code blocks
      pre: ({ children }) => (
        <pre className="my-1.5 overflow-x-auto rounded-md bg-surface-3 p-3 text-[0.85em] font-mono leading-relaxed">
          {children}
        </pre>
      ),
      // Blockquotes
      blockquote: ({ children }) => (
        <blockquote className="my-1 border-l-2 border-accent/50 pl-3 text-text-muted italic">
          {children}
        </blockquote>
      ),
      // Lists
      ul: ({ children }) => (
        <ul className="my-1 ml-4 list-disc space-y-0.5">{children}</ul>
      ),
      ol: ({ children }) => (
        <ol className="my-1 ml-4 list-decimal space-y-0.5">{children}</ol>
      ),
      // Paragraphs — no extra margin for single-paragraph messages
      p: ({ children }) => (
        <p className="leading-relaxed break-words [&+&]:mt-1">{children}</p>
      ),
      // Headings — capped size for chat context
      h1: ({ children }) => (
        <p className="font-bold text-text-primary text-[1.1em] mt-1.5 mb-0.5">{children}</p>
      ),
      h2: ({ children }) => (
        <p className="font-bold text-text-primary text-[1.05em] mt-1.5 mb-0.5">{children}</p>
      ),
      h3: ({ children }) => (
        <p className="font-semibold text-text-primary mt-1 mb-0.5">{children}</p>
      ),
      // Horizontal rule
      hr: () => <hr className="my-2 border-border" />,
      // Disallow images (images come via attachments)
      img: () => null,
    }),
    [handleLinkClick],
  );

  // Fast path: plain text with no markdown tokens → skip parser
  if (!MD_HINT.test(content)) {
    return (
      <p
        className="text-text-secondary leading-relaxed break-words"
        style={BASE_STYLE}
      >
        {content}
      </p>
    );
  }

  return (
    <div
      className="text-text-secondary leading-relaxed break-words"
      style={BASE_STYLE}
    >
      <Markdown
        remarkPlugins={[remarkGfm]}
        components={components}
        disallowedElements={['img']}
        unwrapDisallowed
      >
        {content}
      </Markdown>
    </div>
  );
}
