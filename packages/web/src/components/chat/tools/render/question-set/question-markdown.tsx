import { cn } from "@buddy/ui"
import DOMPurify from "dompurify"
import { marked } from "marked"
import { useEffect, useState } from "react"
import { Markdown } from "@/components/markdown/Markdown"
import { parseInlineMarkdownToHtml } from "@/components/markdown/markdown-parser"

const QUESTION_MARKDOWN_CACHE_KEY_PREFIX = "question"
const QUESTION_MARKDOWN_EMPTY_PART = "_"
const QUESTION_INLINE_MARKDOWN_CACHE_MAX = 200
const QUESTION_DISPLAY_MATH_PATTERN = /(\$\$[\s\S]*\$\$|\\\[[\s\S]*\\\]|\\begin\{)/u
const QUESTION_MARKDOWN_SPACE_TOKEN = "space"
const QUESTION_MARKDOWN_PARAGRAPH_TOKEN = "paragraph"
const questionInlineMarkdownCache = new Map<string, { source: string; html: string }>()

type QuestionInlineMarkdownRender = {
  cacheKey: string
  source: string
  html: string
}

const QUESTION_MARKDOWN_VARIANT_CLASS_NAME = {
  body: [
    "[&_p]:mb-3 [&_p]:text-[15px] [&_p]:leading-relaxed",
    "[&_li]:text-[15px] [&_li]:leading-relaxed",
    "[&_ul]:mb-3 [&_ol]:mb-3",
  ].join(" "),
  compact: [
    "text-sm leading-relaxed",
    "[&_p]:m-0",
    "[&_ul]:my-1 [&_ol]:my-1",
    "[&_li]:mb-1 [&_li]:text-sm",
    "[&_blockquote]:my-2",
    "[&_pre]:my-2 [&_table]:my-2 [&_img]:my-2",
  ].join(" "),
} as const

type QuestionMarkdownVariant = keyof typeof QUESTION_MARKDOWN_VARIANT_CLASS_NAME
type QuestionMarkdownTextEntry = {
  text: string
  occurrence: number
}

function normalizeCacheKeyPart(part: string | number | undefined): string {
  const value = String(part ?? QUESTION_MARKDOWN_EMPTY_PART).trim()
  if (!value) {
    return QUESTION_MARKDOWN_EMPTY_PART
  }
  return encodeURIComponent(value)
}

export function buildQuestionMarkdownCacheKey(
  ...parts: Array<string | number | undefined>
): string {
  return [QUESTION_MARKDOWN_CACHE_KEY_PREFIX, ...parts.map(normalizeCacheKeyPart)].join(":")
}

export function enumerateQuestionMarkdownText(values: string[]): QuestionMarkdownTextEntry[] {
  const occurrences = new Map<string, number>()

  return values.map((value) => {
    const nextOccurrence = (occurrences.get(value) ?? 0) + 1
    occurrences.set(value, nextOccurrence)
    return {
      text: value,
      occurrence: nextOccurrence,
    }
  })
}

export function isQuestionMarkdownBlock(text: string): boolean {
  if (QUESTION_DISPLAY_MATH_PATTERN.test(text)) return true
  const contentTokens = marked
    .lexer(text)
    .filter((token) => token.type !== QUESTION_MARKDOWN_SPACE_TOKEN)
  return contentTokens.length !== 1 || contentTokens[0]?.type !== QUESTION_MARKDOWN_PARAGRAPH_TOKEN
}

function cacheInlineQuestionMarkdown(key: string, source: string, html: string) {
  questionInlineMarkdownCache.delete(key)
  questionInlineMarkdownCache.set(key, { source, html })
  if (questionInlineMarkdownCache.size <= QUESTION_INLINE_MARKDOWN_CACHE_MAX) return
  const oldestKey = questionInlineMarkdownCache.keys().next().value
  if (oldestKey) questionInlineMarkdownCache.delete(oldestKey)
}

export function QuestionInlineMarkdown(props: {
  text: string
  cacheKey: string
  className?: string
  wrapContent?: boolean
}) {
  const cached = questionInlineMarkdownCache.get(props.cacheKey)
  const [rendered, setRendered] = useState<QuestionInlineMarkdownRender | undefined>(() =>
    cached?.source === props.text
      ? { cacheKey: props.cacheKey, source: props.text, html: cached.html }
      : undefined,
  )
  const html =
    rendered?.cacheKey === props.cacheKey && rendered.source === props.text
      ? rendered.html
      : undefined

  useEffect(() => {
    let cancelled = false
    const current = questionInlineMarkdownCache.get(props.cacheKey)
    if (current?.source === props.text) {
      setRendered({ cacheKey: props.cacheKey, source: props.text, html: current.html })
      return
    }

    void parseInlineMarkdownToHtml(props.text).then((parsed) => {
      if (cancelled) return
      const sanitized = DOMPurify.sanitize(parsed, {
        USE_PROFILES: { html: true, mathMl: true, svg: true },
        FORBID_TAGS: ["style"],
        FORBID_CONTENTS: ["style", "script"],
      })
      cacheInlineQuestionMarkdown(props.cacheKey, props.text, sanitized)
      setRendered({ cacheKey: props.cacheKey, source: props.text, html: sanitized })
    })

    return () => {
      cancelled = true
    }
  }, [props.cacheKey, props.text])

  const content = html ? (
    <span dangerouslySetInnerHTML={{ __html: html }} />
  ) : (
    <span>{props.text}</span>
  )

  if (props.wrapContent) {
    return <span className={props.className}>{content}</span>
  }

  return (
    <span className={props.className} dangerouslySetInnerHTML={html ? { __html: html } : undefined}>
      {html ? undefined : props.text}
    </span>
  )
}

export function QuestionMarkdown(props: {
  text: string
  cacheKey: string
  variant?: QuestionMarkdownVariant
  className?: string
}) {
  const variant = props.variant ?? "body"

  return (
    <Markdown
      text={props.text}
      cacheKey={props.cacheKey}
      className={cn(QUESTION_MARKDOWN_VARIANT_CLASS_NAME[variant], props.className)}
    />
  )
}
