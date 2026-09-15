import type { CSSProperties } from "react"

type ChatMarkdownTextStyle = CSSProperties & {
  "--chat-markdown-text-base": string
  "--chat-markdown-text-strong": string
}

/** Applies the theme's long-form reading color to plain transcript text. */
export const CHAT_BODY_TEXT_STYLE: CSSProperties = {
  color: "var(--chat-text-base, var(--text-base))",
}

/** Maps Markdown's semantic colors to the chat-specific theme tokens. */
export const CHAT_MARKDOWN_TEXT_STYLE: ChatMarkdownTextStyle = {
  "--chat-markdown-text-base": "var(--chat-text-base, var(--text-base))",
  "--chat-markdown-text-strong": "var(--chat-text-strong, var(--text-strong))",
}
