/**
 * Telegram HTML Formatter
 * Converts markdown to Telegram-compatible HTML and handles text chunking.
 * Uses HTML mode (not MarkdownV2) for simpler escaping and reliable rendering.
 */

// ---------------------------------------------------------------------------
// ChannelFormatter Interface (mirrors daemux-cli)
// ---------------------------------------------------------------------------

export interface ChannelFormatter {
  bold(text: string): string;
  italic(text: string): string;
  strikethrough(text: string): string;
  code(text: string): string;
  codeBlock(text: string, language?: string): string;
  link(text: string, url: string): string;
  escape(text: string): string;
  fromMarkdown(markdown: string): string;
  chunk(text: string, maxLength: number): string[];
}

// ---------------------------------------------------------------------------
// HTML Escaping
// ---------------------------------------------------------------------------

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function escapeHtmlAttr(text: string): string {
  return escapeHtml(text).replace(/"/g, '&quot;');
}

// ---------------------------------------------------------------------------
// Markdown to Telegram HTML conversion
// ---------------------------------------------------------------------------

export function markdownToTelegramHtml(markdown: string): string {
  if (!markdown) return '';

  let html = markdown;

  // Extract and preserve code blocks before any other processing.
  // This prevents formatting rules from being applied inside code.
  const codeBlocks: string[] = [];
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_match, lang: string, code: string) => {
    const escaped = escapeHtml(code);
    const langAttr = lang ? ` class="language-${escapeHtmlAttr(lang)}"` : '';
    const placeholder = `\x00CB${codeBlocks.length}\x00`;
    codeBlocks.push(`<pre><code${langAttr}>${escaped}</code></pre>`);
    return placeholder;
  });

  // Extract and preserve inline code.
  const inlineCodes: string[] = [];
  html = html.replace(/`([^`]+)`/g, (_match, code: string) => {
    const placeholder = `\x00IC${inlineCodes.length}\x00`;
    inlineCodes.push(`<code>${escapeHtml(code)}</code>`);
    return placeholder;
  });

  // Escape remaining HTML entities (not inside code).
  html = escapeHtml(html);

  // Bold: **text**
  html = html.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');

  // Italic: *text* (not preceded/followed by another *)
  html = html.replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, '<i>$1</i>');

  // Strikethrough: ~~text~~
  html = html.replace(/~~(.+?)~~/g, '<s>$1</s>');

  // Links: [text](url)
  html = html.replace(
    /\[([^\]]+)\]\(([^)]+)\)/g,
    (_match, text: string, url: string) => `<a href="${escapeHtmlAttr(url)}">${text}</a>`,
  );

  // Restore inline code placeholders.
  for (let i = 0; i < inlineCodes.length; i++) {
    html = html.replace(`\x00IC${i}\x00`, inlineCodes[i]);
  }

  // Restore code block placeholders.
  for (let i = 0; i < codeBlocks.length; i++) {
    html = html.replace(`\x00CB${i}\x00`, codeBlocks[i]);
  }

  return html;
}

// ---------------------------------------------------------------------------
// Text Chunking (Telegram has a 4096 char message limit)
// ---------------------------------------------------------------------------

const TELEGRAM_MAX_MESSAGE_LENGTH = 4096;
const TELEGRAM_MAX_CAPTION_LENGTH = 1024;

export function chunkText(text: string, maxLength = TELEGRAM_MAX_MESSAGE_LENGTH): string[] {
  if (!text) return [''];
  if (text.length <= maxLength) return [text];

  const chunks: string[] = [];
  let remaining = text;

  while (remaining.length > 0) {
    if (remaining.length <= maxLength) {
      chunks.push(remaining);
      break;
    }

    let breakPoint = findBreakPoint(remaining, maxLength);
    chunks.push(remaining.slice(0, breakPoint));
    remaining = remaining.slice(breakPoint).trimStart();
  }

  return chunks;
}

function findBreakPoint(text: string, maxLength: number): number {
  // Prefer breaking at a blank line (paragraph boundary).
  const doubleNewline = text.lastIndexOf('\n\n', maxLength);
  if (doubleNewline > maxLength * 0.3) return doubleNewline;

  // Fall back to single newline.
  const newline = text.lastIndexOf('\n', maxLength);
  if (newline > maxLength * 0.3) return newline;

  // Fall back to space.
  const space = text.lastIndexOf(' ', maxLength);
  if (space > maxLength * 0.3) return space;

  // Hard break as last resort.
  return maxLength;
}

/** Truncate text suitable for a media caption (max 1024 chars). */
export function truncateCaption(text: string): string {
  if (text.length <= TELEGRAM_MAX_CAPTION_LENGTH) return text;

  const truncated = text.slice(0, TELEGRAM_MAX_CAPTION_LENGTH - 3);
  const lastSpace = truncated.lastIndexOf(' ');
  if (lastSpace > TELEGRAM_MAX_CAPTION_LENGTH * 0.5) {
    return truncated.slice(0, lastSpace) + '...';
  }
  return truncated + '...';
}

// ---------------------------------------------------------------------------
// Telegram HTML Formatter (implements ChannelFormatter)
// ---------------------------------------------------------------------------

export const telegramHtmlFormatter: ChannelFormatter = {
  bold: (text) => `<b>${escapeHtml(text)}</b>`,
  italic: (text) => `<i>${escapeHtml(text)}</i>`,
  strikethrough: (text) => `<s>${escapeHtml(text)}</s>`,
  code: (text) => `<code>${escapeHtml(text)}</code>`,
  codeBlock: (text, language) => {
    const langAttr = language ? ` class="language-${escapeHtmlAttr(language)}"` : '';
    return `<pre><code${langAttr}>${escapeHtml(text)}</code></pre>`;
  },
  link: (text, url) => `<a href="${escapeHtmlAttr(url)}">${escapeHtml(text)}</a>`,
  escape: escapeHtml,
  fromMarkdown: markdownToTelegramHtml,
  chunk: chunkText,
};
