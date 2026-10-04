import { Marked } from "marked"

/**
 * Marks clipboard HTML that Buddy rendered from Markdown. Rich-text apps paste the HTML; Buddy's
 * own editors see the marker and read the plain-text Markdown instead, which keeps every construct
 * the HTML importer would lose.
 */
export const BUDDY_MARKDOWN_CLIPBOARD_ATTRIBUTE = "data-buddy-markdown"

const LINE_ENDING_PATTERN = /\r\n?/gu

const clipboardMarked = new Marked({ gfm: true })

export function markdownClipboardHtml(markdown: string): string {
  const html = clipboardMarked.parse(markdown, { async: false })
  return `<div ${BUDDY_MARKDOWN_CLIPBOARD_ATTRIBUTE}="">${html}</div>`
}

/** Copies Markdown as plain text plus rendered HTML, or plain text alone where HTML is refused. */
export async function writeMarkdownToClipboard(markdown: string): Promise<void> {
  try {
    await navigator.clipboard.write([
      new ClipboardItem({
        "text/plain": new Blob([markdown], { type: "text/plain" }),
        "text/html": new Blob([markdownClipboardHtml(markdown)], { type: "text/html" }),
      }),
    ])
  } catch {
    await navigator.clipboard.writeText(markdown)
  }
}

/**
 * The pasted text to read as Markdown: plain text that arrived without HTML, or Buddy's own
 * Markdown copy. Other HTML stays with the editor's HTML importer.
 */
export function readPastedMarkdown(clipboardData: DataTransfer): string | undefined {
  const text = clipboardData.getData("text/plain")
  if (!text) return undefined
  const html = clipboardData.getData("text/html")
  if (html && html !== text && !html.includes(BUDDY_MARKDOWN_CLIPBOARD_ATTRIBUTE)) return undefined
  return text.replace(LINE_ENDING_PATTERN, "\n")
}
