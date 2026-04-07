import katex from "katex"
import { Marked, type Token } from "marked"
import markedKatex from "marked-katex-extension"
import markedShiki from "marked-shiki"
import { bundledLanguages, createHighlighter, type BundledLanguage } from "shiki"
import { getPlatform } from "@/context/platform"
import {
  renderMermaidSvg,
  type MermaidRenderResult,
} from "@/components/chat/tools/render/mermaid/lib/render"

const MERMAID_PLACEHOLDER_ATTRIBUTE = "data-buddy-mermaid-placeholder"
const MERMAID_SOURCE_ATTRIBUTE = "data-buddy-mermaid-source"
const MERMAID_ENHANCED_ATTRIBUTE = "data-buddy-mermaid-enhanced"

const MARKDOWN_MERMAID_WRAPPER_CLASS =
  "my-5 rounded-lg border border-border-base bg-background-base p-3"
const MARKDOWN_MERMAID_ERROR_CLASS =
  "rounded-md border border-border-critical-base/40 bg-surface-critical-base/10 p-3 text-sm text-icon-critical-base"
const MARKDOWN_MERMAID_META_CLASS = "mt-2 text-sm text-text-weak"

function normalizeMermaidSource(source: string): string {
  return source.replace(/\r\n?/gu, "\n").trim()
}

function sourceFromPlaceholder(node: Element): string | undefined {
  const encoded = node.getAttribute(MERMAID_SOURCE_ATTRIBUTE)
  if (!encoded) {
    return undefined
  }

  try {
    const decoded = decodeURIComponent(encoded)
    const normalized = normalizeMermaidSource(decoded)
    return normalized.length > 0 ? normalized : undefined
  } catch {
    return undefined
  }
}

function createRawSourceBlock(source: string): HTMLPreElement {
  const pre = document.createElement("pre")
  pre.className =
    "mt-2 max-h-80 overflow-auto whitespace-pre-wrap break-words rounded-md border border-border-base bg-surface-weak/40 p-2 text-xs text-text-base"
  const code = document.createElement("code")
  code.textContent = source
  pre.appendChild(code)
  return pre
}

function renderInlineMermaidSuccess(
  node: HTMLElement,
  source: string,
  rendered: MermaidRenderResult,
): void {
  node.className = MARKDOWN_MERMAID_WRAPPER_CLASS
  node.setAttribute(MERMAID_ENHANCED_ATTRIBUTE, "true")
  node.setAttribute(MERMAID_SOURCE_ATTRIBUTE, encodeURIComponent(source))

  const diagram = document.createElement("div")
  diagram.className = "overflow-auto"
  diagram.innerHTML = rendered.svg
  rendered.bindFunctions?.(diagram)

  node.replaceChildren(diagram)
}

function renderInlineMermaidFailure(node: HTMLElement, source: string, message: string): void {
  node.className = MARKDOWN_MERMAID_WRAPPER_CLASS
  node.setAttribute(MERMAID_ENHANCED_ATTRIBUTE, "true")
  node.setAttribute(MERMAID_SOURCE_ATTRIBUTE, encodeURIComponent(source))

  const panel = document.createElement("div")
  panel.className = MARKDOWN_MERMAID_ERROR_CLASS
  panel.textContent = `Unable to render diagram: ${message}`

  const helper = document.createElement("div")
  helper.className = MARKDOWN_MERMAID_META_CLASS
  helper.textContent = "Showing raw source instead."

  node.replaceChildren(panel, helper, createRawSourceBlock(source))
}

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message.trim()
  }
  if (typeof error === "string" && error.trim()) {
    return error.trim()
  }
  return "Diagram rendering failed."
}

export function createMermaidPlaceholderHtml(source: string): string {
  const encodedSource = encodeURIComponent(source)
  return `<div ${MERMAID_PLACEHOLDER_ATTRIBUTE}="true" ${MERMAID_SOURCE_ATTRIBUTE}="${encodedSource}"></div>`
}

export async function enhanceMermaidPlaceholders(
  root: ParentNode,
  input?: { signal?: AbortSignal },
): Promise<void> {
  const MERMAID_PLACEHOLDER_SELECTOR = `[${MERMAID_PLACEHOLDER_ATTRIBUTE}="true"]`
  const placeholders = Array.from(root.querySelectorAll<HTMLElement>(MERMAID_PLACEHOLDER_SELECTOR))

  for (const placeholder of placeholders) {
    if (input?.signal?.aborted) {
      return
    }

    const source = sourceFromPlaceholder(placeholder)
    if (!source) {
      renderInlineMermaidFailure(placeholder, "", "missing diagram source")
      continue
    }

    try {
      const rendered = await renderMermaidSvg({ source })
      if (input?.signal?.aborted) {
        return
      }
      renderInlineMermaidSuccess(placeholder, source, rendered)
    } catch (error) {
      if (input?.signal?.aborted) {
        return
      }
      renderInlineMermaidFailure(placeholder, source, errorMessage(error))
    }
  }
}

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

type MermaidBlockToken = Token & {
  type: "mermaidBlock"
  raw: string
  text: string
}

const MERMAID_BLOCK_PATTERN =
  /^([ \t]{0,3})(`{3,}|~{3,})[ \t]*mermaid(?:[ \t][^\n\r]*)?[ \t]*\r?\n([\s\S]*?)(?:\r?\n|\n)\1\2[ \t]*(?:\r?\n|$)/u

function createMermaidBlockExtension() {
  return {
    extensions: [
      {
        name: "mermaidBlock",
        level: "block" as const,
        start(src: string) {
          const match = /[ \t]{0,3}(`{3,}|~{3,})[ \t]*mermaid\b/iu.exec(src)
          return match?.index
        },
        tokenizer(src: string): MermaidBlockToken | undefined {
          const match = MERMAID_BLOCK_PATTERN.exec(src)
          if (!match) {
            return undefined
          }

          return {
            type: "mermaidBlock",
            raw: match[0],
            text: match[3] ?? "",
          }
        },
        renderer(token: MermaidBlockToken) {
          return createMermaidPlaceholderHtml(token.text)
        },
      },
    ],
  }
}

function tokensContainMermaidCodeBlocks(tokens: readonly Token[]): boolean {
  for (const token of tokens) {
    if (token.type === "mermaidBlock") {
      return true
    }

    if (token.type === "blockquote") {
      if (tokensContainMermaidCodeBlocks(token.tokens ?? [])) {
        return true
      }
    }

    if (token.type === "list") {
      for (const item of token.items) {
        if (tokensContainMermaidCodeBlocks(item.tokens ?? [])) {
          return true
        }
      }
    }
  }

  return false
}

function containsMermaidCodeBlocks(parser: Marked, markdown: string): boolean {
  return tokensContainMermaidCodeBlocks(parser.lexer(markdown))
}

const parser = new Marked(
  createMermaidBlockExtension(),
  markedKatex({
    throwOnError: false,
    nonStandard: true,
  }),
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
  {
    renderer: {
      link({ href, title, text }) {
        const titleAttr = title ? ` title="${title}"` : ""
        return `<a href="${href}"${titleAttr} class="external-link" target="_blank" rel="noopener noreferrer">${text}</a>`
      },
    },
  },
)

export async function parseMarkdownToHtml(markdown: string) {
  const containsMermaidFence = containsMermaidCodeBlocks(parser, markdown)
  const nativeParser = getPlatform().parseMarkdown

  if (nativeParser && !containsMermaidFence) {
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
