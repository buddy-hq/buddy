import { Marked, marked, type Tokens } from "marked"
import markedShiki from "marked-shiki"
import { bundledLanguages, createHighlighter, type BundledLanguage } from "shiki"
import remend from "remend"
import { markdownContentHash } from "./markdown-content-hash"
import { buddyMathExtension, hasOpenStreamingMath } from "./markdown-math"

let highlighterPromise: ReturnType<typeof createHighlighter> | undefined

export async function getSharedHighlighter() {
  if (!highlighterPromise) {
    highlighterPromise = createHighlighter({
      themes: [openCodeTheme],
      langs: [],
    })
  }
  return highlighterPromise
}

export const openCodeTheme = {
  name: "OpenCode",
  colors: {
    "editor.background": "var(--color-background-stronger)",
    "editor.foreground": "var(--color-text-base)",
    "gitDecoration.addedResourceForeground": "var(--syntax-diff-add)",
    "gitDecoration.deletedResourceForeground": "var(--syntax-diff-delete)",
  },
  tokenColors: [
    {
      scope: ["comment", "punctuation.definition.comment", "string.comment"],
      settings: { foreground: "var(--syntax-comment)" },
    },
    {
      scope: ["entity.other.attribute-name"],
      settings: { foreground: "var(--syntax-property)" },
    },
    {
      scope: [
        "constant",
        "entity.name.constant",
        "variable.other.constant",
        "variable.language",
        "entity",
      ],
      settings: { foreground: "var(--syntax-constant)" },
    },
    {
      scope: ["entity.name", "meta.export.default", "meta.definition.variable"],
      settings: { foreground: "var(--syntax-type)" },
    },
    {
      scope: ["meta.object.member"],
      settings: { foreground: "var(--syntax-primitive)" },
    },
    {
      scope: [
        "variable.parameter.function",
        "meta.jsx.children",
        "meta.block",
        "meta.tag.attributes",
        "entity.name.constant",
        "meta.embedded.expression",
        "meta.template.expression",
        "string.other.begin.yaml",
        "string.other.end.yaml",
      ],
      settings: { foreground: "var(--syntax-punctuation)" },
    },
    {
      scope: ["entity.name.function", "support.type.primitive"],
      settings: { foreground: "var(--syntax-primitive)" },
    },
    {
      scope: ["support.class.component"],
      settings: { foreground: "var(--syntax-type)" },
    },
    {
      scope: "keyword",
      settings: { foreground: "var(--syntax-keyword)" },
    },
    {
      scope: [
        "keyword.operator",
        "storage.type.function.arrow",
        "punctuation.separator.key-value.css",
        "entity.name.tag.yaml",
        "punctuation.separator.key-value.mapping.yaml",
      ],
      settings: { foreground: "var(--syntax-operator)" },
    },
    {
      scope: ["storage", "storage.type"],
      settings: { foreground: "var(--syntax-keyword)" },
    },
    {
      scope: ["storage.modifier.package", "storage.modifier.import", "storage.type.java"],
      settings: { foreground: "var(--syntax-primitive)" },
    },
    {
      scope: [
        "string",
        "punctuation.definition.string",
        "string punctuation.section.embedded source",
        "entity.name.tag",
      ],
      settings: { foreground: "var(--syntax-string)" },
    },
    {
      scope: "support",
      settings: { foreground: "var(--syntax-primitive)" },
    },
    {
      scope: [
        "support.type.object.module",
        "variable.other.object",
        "support.type.property-name.css",
      ],
      settings: { foreground: "var(--syntax-object)" },
    },
    {
      scope: "meta.property-name",
      settings: { foreground: "var(--syntax-property)" },
    },
    {
      scope: "variable",
      settings: { foreground: "var(--syntax-variable)" },
    },
    {
      scope: "variable.other",
      settings: { foreground: "var(--syntax-variable)" },
    },
    {
      scope: [
        "invalid.broken",
        "invalid.illegal",
        "invalid.unimplemented",
        "invalid.deprecated",
        "message.error",
        "markup.deleted",
        "meta.diff.header.from-file",
        "punctuation.definition.deleted",
        "brackethighlighter.unmatched",
        "token.error-token",
      ],
      settings: { foreground: "var(--syntax-critical)" },
    },
    {
      scope: "carriage-return",
      settings: { foreground: "var(--syntax-keyword)" },
    },
    {
      scope: "string source",
      settings: { foreground: "var(--syntax-variable)" },
    },
    {
      scope: "string variable",
      settings: { foreground: "var(--syntax-constant)" },
    },
    {
      scope: [
        "source.regexp",
        "string.regexp",
        "string.regexp.character-class",
        "string.regexp constant.character.escape",
        "string.regexp source.ruby.embedded",
        "string.regexp string.regexp.arbitrary-repitition",
        "string.regexp constant.character.escape",
      ],
      settings: { foreground: "var(--syntax-regexp)" },
    },
    {
      scope: "support.constant",
      settings: { foreground: "var(--syntax-primitive)" },
    },
    {
      scope: "support.variable",
      settings: { foreground: "var(--syntax-variable)" },
    },
    {
      scope: "meta.module-reference",
      settings: { foreground: "var(--syntax-info)" },
    },
    {
      scope: "punctuation.definition.list.begin.markdown",
      settings: { foreground: "var(--syntax-punctuation)" },
    },
    {
      scope: ["markup.heading", "markup.heading entity.name"],
      settings: {
        fontStyle: "bold",
        foreground: "var(--syntax-info)",
      },
    },
    {
      scope: "markup.quote",
      settings: { foreground: "var(--syntax-info)" },
    },
    {
      scope: "markup.italic",
      settings: { fontStyle: "italic" },
    },
    {
      scope: "markup.bold",
      settings: {
        fontStyle: "bold",
        foreground: "var(--text-strong)",
      },
    },
    {
      scope: [
        "markup.raw",
        "markup.inserted",
        "meta.diff.header.to-file",
        "punctuation.definition.inserted",
        "markup.changed",
        "punctuation.definition.changed",
        "markup.ignored",
        "markup.untracked",
      ],
      settings: { foreground: "var(--color-text-base)" },
    },
    {
      scope: "meta.diff.range",
      settings: {
        fontStyle: "bold",
        foreground: "var(--syntax-unknown)",
      },
    },
    {
      scope: "meta.diff.header",
      settings: { foreground: "var(--syntax-unknown)" },
    },
    {
      scope: "meta.separator",
      settings: {
        fontStyle: "bold",
        foreground: "var(--syntax-unknown)",
      },
    },
    {
      scope: "meta.output",
      settings: { foreground: "var(--syntax-unknown)" },
    },
    {
      scope: "meta.export.default",
      settings: { foreground: "var(--syntax-unknown)" },
    },
    {
      scope: [
        "brackethighlighter.tag",
        "brackethighlighter.curly",
        "brackethighlighter.round",
        "brackethighlighter.square",
        "brackethighlighter.angle",
        "brackethighlighter.quote",
      ],
      settings: { foreground: "var(--syntax-unknown)" },
    },
    {
      scope: ["constant.other.reference.link", "string.other.link"],
      settings: {
        fontStyle: "underline",
        foreground: "var(--syntax-unknown)",
      },
    },
    {
      scope: "token.info-token",
      settings: { foreground: "var(--syntax-info)" },
    },
    {
      scope: "token.warn-token",
      settings: { foreground: "var(--syntax-warning)" },
    },
    {
      scope: "token.debug-token",
      settings: { foreground: "var(--syntax-info)" },
    },
  ],
  semanticTokenColors: {
    comment: "var(--syntax-comment)",
    string: "var(--syntax-string)",
    number: "var(--syntax-constant)",
    regexp: "var(--syntax-regexp)",
    keyword: "var(--syntax-keyword)",
    variable: "var(--syntax-variable)",
    parameter: "var(--syntax-variable)",
    property: "var(--syntax-property)",
    function: "var(--syntax-primitive)",
    method: "var(--syntax-primitive)",
    type: "var(--syntax-type)",
    class: "var(--syntax-type)",
    namespace: "var(--syntax-type)",
    enumMember: "var(--syntax-primitive)",
    "variable.constant": "var(--syntax-constant)",
    "variable.defaultLibrary": "var(--syntax-unknown)",
  },
}

// ── Streaming ──────────────────────────────────────────────────────────────

export type Block = {
  raw: string
  src: string
  mode: "full" | "live" | "code"
  language?: string
  complete?: boolean
}

export type MarkdownProjection = {
  text: string
  blocks: Block[]
}

function refs(text: string) {
  if (!text.includes("]:")) return false
  return /^[ \t]{0,3}\[[^\]]+\]:[ \t]*(?:\S+|\r?\n[ \t]+\S+)/m.test(text)
}

function fenceOpen(raw: string) {
  const match = raw.match(/^[ \t]{0,3}(`{3,}|~{3,})/)
  if (!match) return false
  const mark = match[1]
  if (!mark) return false
  const char = mark[0]
  const size = mark.length
  const last = raw.trimEnd().split("\n").at(-1)?.trim() ?? ""
  return !new RegExp(`^[\\t ]{0,3}${char}{${size},}[\\t ]*$`).test(last)
}

function closesFence(raw: string, suffix: string) {
  const mark = raw.match(/^[ \t]{0,3}(`{3,}|~{3,})/u)?.[1]
  if (!mark) return suffix.includes("```") || suffix.includes("~~~")
  return `${raw.slice(-(mark.length - 1))}${suffix}`.includes(mark)
}

function codeLanguage(value: string | undefined) {
  return value?.trim().split(/\s+/u, 1)[0] || undefined
}

function openCode(raw: string) {
  const newline = raw.indexOf("\n")
  return newline < 0 ? "" : raw.slice(newline + 1)
}

function heal(text: string) {
  return remend(text, { linkMode: "text-only" })
}

export function streamBlocks(text: string, live: boolean): Block[] {
  if (!live) return [{ raw: text, src: text, mode: "full" }]
  if (refs(text)) return [{ raw: text, src: heal(text), mode: "live" }]

  const tokens = marked.lexer(text)
  const tail = tokens.findLastIndex((token) => token.type !== "space")
  if (tail < 0) return [{ raw: text, src: heal(text), mode: "live" }]
  const last = tokens[tail]
  if (!last) return [{ raw: text, src: heal(text), mode: "live" }]

  const blocks: Block[] = []
  for (let index = 0; index < tail; index += 1) {
    const token = tokens[index]
    if (!token || token.type === "space") continue
    let raw = token.raw
    while (tokens[index + 1]?.type === "space" && index + 1 < tail) {
      index += 1
      raw += tokens[index]?.raw ?? ""
    }
    if (token.type === "code") {
      const code = token as Tokens.Code
      blocks.push({
        raw,
        src: code.text,
        mode: "code",
        language: codeLanguage(code.lang),
        complete: true,
      })
      continue
    }
    blocks.push({ raw, src: raw, mode: "full" })
  }

  const raw = tokens
    .slice(tail)
    .map((token) => token.raw)
    .join("")
  if (last.type !== "code") {
    return [...blocks, { raw, src: hasOpenStreamingMath(raw) ? raw : heal(raw), mode: "live" }]
  }

  const code = last as import("marked").Tokens.Code
  if (!fenceOpen(code.raw)) {
    return [
      ...blocks,
      {
        raw,
        src: code.text,
        mode: "code",
        language: codeLanguage(code.lang),
        complete: true,
      },
    ]
  }
  return [
    ...blocks,
    {
      raw: code.raw,
      src: openCode(code.raw),
      mode: "code",
      language: codeLanguage(code.lang),
    },
  ]
}

export function projectMarkdownBlocks(
  previous: MarkdownProjection | undefined,
  text: string,
  live: boolean,
): MarkdownProjection {
  if (!previous || !text.startsWith(previous.text)) {
    return { text, blocks: streamBlocks(text, live) }
  }

  if (!live) {
    const blocks = text === previous.text ? previous.blocks : streamBlocks(text, true)
    return {
      text,
      blocks: blocks.map((block) =>
        block.mode === "live"
          ? {
              raw: block.raw,
              src: block.raw,
              mode: "full",
            }
          : block,
      ),
    }
  }

  const tail = previous.blocks.at(-1)
  const suffix = text.slice(previous.text.length)
  if (!suffix || tail?.mode !== "code" || tail.complete || closesFence(tail.raw, suffix)) {
    return { text, blocks: streamBlocks(text, live) }
  }

  return {
    text,
    blocks: [
      ...previous.blocks.slice(0, -1),
      {
        ...tail,
        raw: tail.raw + suffix,
        src: tail.src + suffix,
      },
    ],
  }
}

// ── Marked parser ──────────────────────────────────────────────────────────

function isExternalHttpLink(href: string) {
  try {
    const url = new URL(href)
    return url.protocol === "http:" || url.protocol === "https:"
  } catch {
    return false
  }
}

function createParser(options: { suppressMathErrors?: boolean }) {
  return new Marked(
    {
      renderer: {
        link({ href, title, text }) {
          const titleAttr = title ? ` title="${title}"` : ""
          if (!isExternalHttpLink(href)) {
            return `<a href="${href}"${titleAttr}>${text}</a>`
          }
          return `<a href="${href}"${titleAttr} class="external-link" target="_blank" rel="noopener noreferrer">${text}</a>`
        },
      },
    },
    buddyMathExtension({
      suppressErrors: options.suppressMathErrors,
    }),
    markedShiki({
      async highlight(code, lang) {
        const highlighter = await getSharedHighlighter()
        if (!(lang in bundledLanguages)) {
          lang = "text"
        }
        if (!highlighter.getLoadedLanguages().includes(lang)) {
          await highlighter.loadLanguage(lang as BundledLanguage)
        }
        return highlighter.codeToHtml(code, {
          lang: lang || "text",
          theme: "OpenCode",
          tabindex: false,
        })
      },
    }),
  )
}

const parser = createParser({ suppressMathErrors: false })
const streamingParser = createParser({ suppressMathErrors: true })

export async function parseInlineMarkdownToHtml(markdown: string): Promise<string> {
  return await parser.parseInline(markdown)
}

// ── Per-block cache (streaming) ────────────────────────────────────────────

type CacheEntry = { hash: string; html: string }
const blockCache = new Map<string, CacheEntry>()
const BLOCK_CACHE_MAX = 200

function touchBlockCache(key: string, entry: CacheEntry) {
  blockCache.delete(key)
  blockCache.set(key, entry)
  if (blockCache.size <= BLOCK_CACHE_MAX) return
  const first = blockCache.keys().next().value
  if (!first) return
  blockCache.delete(first)
}

// ── Main entry ─────────────────────────────────────────────────────────────

export async function parseMarkdownToHtml(
  markdown: string,
  streaming = false,
  blockCacheKey?: string,
) {
  if (streaming) {
    const blocks = streamBlocks(markdown, true)
    const base = blockCacheKey ?? markdownContentHash(markdown)
    const parts = await Promise.all(
      blocks.map(async (block, index) => {
        const hash = markdownContentHash(block.raw)
        const key = `${base}:${index}:${block.mode}`

        const cached = blockCache.get(key)
        if (cached && cached.hash === hash) {
          touchBlockCache(key, cached)
          return cached.html
        }

        const html = await Promise.resolve(
          streamingParser.parse(block.mode === "code" ? block.raw : block.src),
        )
        if (hash) touchBlockCache(key, { hash, html })
        return html
      }),
    )
    return parts.join("")
  }

  return parser.parse(markdown)
}

export async function parseProjectedMarkdownBlockToHtml(
  markdown: string,
  tolerant: boolean,
): Promise<string> {
  return await Promise.resolve(tolerant ? streamingParser.parse(markdown) : parser.parse(markdown))
}
