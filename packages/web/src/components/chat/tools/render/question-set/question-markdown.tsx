import { cn } from "@buddy/ui"
import { Markdown } from "@/components/markdown/Markdown"

const QUESTION_MARKDOWN_CACHE_KEY_PREFIX = "question"
const QUESTION_MARKDOWN_EMPTY_PART = "_"

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
