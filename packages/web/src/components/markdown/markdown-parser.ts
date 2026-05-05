import katex from "katex"
import { Marked, type Token } from "marked"
import markedKatex from "marked-katex-extension"
import markedShiki from "marked-shiki"
import { bundledLanguages, createHighlighter, type BundledLanguage } from "shiki"
import { getPlatform } from "@/context/platform"

let highlighterPromise: ReturnType<typeof createHighlighter> | undefined

async function getHighlighter() {
  if (!highlighterPromise) {
    highlighterPromise = createHighlighter({
      themes: ["github-dark"],
      langs: [],
    })
  }

  return highlighterPromise
}

function renderMathInText(text: string) {
  let result = text

  const displayMathRegex = /\$\$([\s\S]*?)\$\$/g
  result = result.replace(displayMathRegex, (_, math) => {
    try {
      return katex.renderToString(math, {
        displayMode: true,
        throwOnError: false,
      })
    } catch {
      return `$$${math}$$`
    }
  })

  const inlineMathRegex = /(?<!\$)\$(?!\$)((?:[^$\\]|\\.)+?)\$(?!\$)/g
  result = result.replace(inlineMathRegex, (_, math) => {
    try {
      return katex.renderToString(math, {
        displayMode: false,
        throwOnError: false,
      })
    } catch {
      return `$${math}$`
    }
  })

  return result
}

function renderMathExpressions(html: string) {
  const codeBlockPattern = /(<(?:pre|code|kbd)[^>]*>[\s\S]*?<\/(?:pre|code|kbd)>)/gi
  const parts = html.split(codeBlockPattern)

  return parts
    .map((part, index) => {
      if (index % 2 === 1) return part
      return renderMathInText(part)
    })
    .join("")
}

async function highlightCodeBlocks(html: string) {
  const codeBlockRegex = /<pre><code(?:\s+class="language-([^"]*)")?>([\s\S]*?)<\/code><\/pre>/g
  const matches = [...html.matchAll(codeBlockRegex)]
  if (matches.length === 0) return html

  const highlighter = await getHighlighter()
  let result = html

  for (const match of matches) {
    const [fullMatch, lang, escapedCode] = match
    const code = escapedCode
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&amp;/g, "&")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")

    let safeLanguage = lang || "text"
    if (!(safeLanguage in bundledLanguages)) {
      safeLanguage = "text"
    }
    if (!highlighter.getLoadedLanguages().includes(safeLanguage)) {
      await highlighter.loadLanguage(safeLanguage as BundledLanguage)
    }

    const highlighted = highlighter.codeToHtml(code, {
      lang: safeLanguage,
      theme: "github-dark",
    })
    result = result.replace(fullMatch, () => highlighted)
  }

  return result
}

const renderer = {
  link(token: Token & { href?: string; text?: string }) {
    const href = token.href || ""
    const text = token.text || href

    let isExternal = false
    try {
      const url = new URL(href)
      isExternal = url.protocol === "http:" || url.protocol === "https:"
    } catch {
      isExternal = false
    }

    if (isExternal) {
      return `<a href="${href}" class="external-link" target="_blank" rel="noopener noreferrer">${text}</a>`
    }

    return false
  },
}

const parser = new Marked({
  gfm: true,
  breaks: true,
  async: true,
  renderer,
})

parser.use(
  markedKatex({
    throwOnError: false,
    output: "html",
  }),
)

parser.use({
  async walkTokens(token) {
    if (token.type !== "code") return
    if (token.lang === "mermaid") return
    const highlighter = await getHighlighter()
    let safeLanguage = token.lang || "text"
    if (!(safeLanguage in bundledLanguages)) {
      safeLanguage = "text"
    }
    if (!highlighter.getLoadedLanguages().includes(safeLanguage)) {
      await highlighter.loadLanguage(safeLanguage as BundledLanguage)
    }
  },
})

parser.use(
  markedShiki({
    async highlight(code, lang) {
      const highlighter = await getHighlighter()
      let safeLanguage = lang || "text"
      if (!(safeLanguage in bundledLanguages)) {
        safeLanguage = "text"
      }
      if (!highlighter.getLoadedLanguages().includes(safeLanguage)) {
        await highlighter.loadLanguage(safeLanguage as BundledLanguage)
      }
      return highlighter.codeToHtml(code, {
        lang: safeLanguage,
        theme: "github-dark",
      })
    },
  }),
)

export async function parseMarkdownToHtml(markdown: string) {
  const nativeParser = getPlatform().parseMarkdown
  if (nativeParser) {
    try {
      const html = await nativeParser(markdown)
      const withMath = renderMathExpressions(html)
      return highlightCodeBlocks(withMath)
    } catch {
      // Fall through to the JS parser so browser mode and desktop dev stay usable.
    }
  }

  return parser.parse(markdown)
}
