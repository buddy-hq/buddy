import { cn } from "@buddy/ui"
import { marked } from "marked"
import { useEffect, useMemo, useRef, useState } from "react"
import { useChatScrollViewport } from "@/components/chat/chat-scroll-context"
import {
  VIRTUAL_MARKDOWN_ESTIMATE_PX,
  VIRTUAL_MARKDOWN_MAX_TOKEN_CHARS,
  VIRTUAL_MARKDOWN_MIN_CHARS,
  VIRTUAL_MARKDOWN_TARGET_CHARS,
} from "@/components/virtualization/virtualization-defaults"
import { MarkdownHtmlSegment, markdownClassName } from "./markdown-html-segment"

const LAZY_MARKDOWN_BLOCK_PREFETCH_PX = 1200
const INITIAL_ACTIVE_BLOCKS = 2

type MarkdownBlock = {
  key: string
  markdown: string
  estimate: number
}

function hasReferenceDefinitions(markdown: string): boolean {
  return /^\[[^\]]+\]:\s+\S+/mu.test(markdown) || /^\[\^[^\]]+\]:\s+/mu.test(markdown)
}

function checksum(value: string): string {
  let hash = 0
  for (let index = 0; index < value.length; index += 1) {
    hash = ((hash << 5) - hash + value.charCodeAt(index)) | 0
  }
  return hash.toString(36)
}

function estimateBlockHeight(markdown: string): number {
  const lineCount = markdown.split("\n").length
  const mathCount = (markdown.match(/\$\$|\\\[|\\\(|\\begin\{/gu) ?? []).length
  return Math.max(
    VIRTUAL_MARKDOWN_ESTIMATE_PX,
    44 + lineCount * 24 + mathCount * 72 + Math.ceil(markdown.length / 96) * 18,
  )
}

function pushMarkdownBlock(blocks: MarkdownBlock[], markdown: string, salt: string): void {
  if (markdown.trim().length === 0) return
  blocks.push({
    key: `${blocks.length}:${checksum(`${salt}:${markdown}`)}`,
    markdown,
    estimate: estimateBlockHeight(markdown),
  })
}

function splitMarkdownIntoBlocks(markdown: string, salt: string): MarkdownBlock[] {
  const tokens = marked.lexer(markdown)
  const blocks: MarkdownBlock[] = []
  let buffer = ""

  for (const token of tokens) {
    const raw = token.raw
    if (!raw) continue

    if (
      buffer.length > 0 &&
      buffer.length + raw.length > VIRTUAL_MARKDOWN_TARGET_CHARS
    ) {
      pushMarkdownBlock(blocks, buffer, salt)
      buffer = ""
    }

    if (raw.length >= VIRTUAL_MARKDOWN_MAX_TOKEN_CHARS) {
      if (buffer.length > 0) {
        pushMarkdownBlock(blocks, buffer, salt)
        buffer = ""
      }
      pushMarkdownBlock(blocks, raw, salt)
      continue
    }

    buffer += raw
  }

  pushMarkdownBlock(blocks, buffer, salt)
  return blocks
}

export function shouldVirtualizeMarkdown(markdown: string): boolean {
  return markdown.length >= VIRTUAL_MARKDOWN_MIN_CHARS && !hasReferenceDefinitions(markdown)
}

function LazyMarkdownBlock(props: {
  block: MarkdownBlock
  index: number
  cacheKey?: string
  directory?: string
  streaming?: boolean
  interrupted?: boolean
}) {
  const scrollViewportRef = useChatScrollViewport()
  const rootRef = useRef<HTMLDivElement | null>(null)
  const [active, setActive] = useState(props.index < INITIAL_ACTIVE_BLOCKS)

  useEffect(() => {
    if (active) return
    const root = scrollViewportRef?.current
    const element = rootRef.current
    if (!(element instanceof HTMLDivElement)) return
    if (!(root instanceof HTMLElement)) {
      setActive(true)
      return
    }
    if (typeof IntersectionObserver === "undefined") {
      setActive(true)
      return
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return
        setActive(true)
        observer.disconnect()
      },
      {
        root,
        rootMargin: `${LAZY_MARKDOWN_BLOCK_PREFETCH_PX}px 0px ${LAZY_MARKDOWN_BLOCK_PREFETCH_PX}px 0px`,
      },
    )

    observer.observe(element)
    return () => observer.disconnect()
  }, [active, scrollViewportRef])

  return (
    <div
      ref={rootRef}
      className="min-w-0 w-full max-w-full [contain-intrinsic-size:auto_220px] [content-visibility:auto] [&:not(:last-child)]:pb-3"
      style={active ? undefined : { minHeight: `${props.block.estimate}px` }}
    >
      {active ? (
        <MarkdownHtmlSegment
          text={props.block.markdown}
          cacheKey={`${props.cacheKey ?? "markdown"}:lazy:${props.block.key}`}
          className={markdownClassName}
          directory={props.directory}
          streaming={props.streaming}
          interrupted={props.interrupted}
        />
      ) : null}
    </div>
  )
}

export function VirtualizedMarkdown(props: {
  text: string
  cacheKey?: string
  className?: string
  directory?: string
  streaming?: boolean
  interrupted?: boolean
}) {
  const scrollViewportRef = useChatScrollViewport()
  const blocks = useMemo(
    () => splitMarkdownIntoBlocks(props.text, props.cacheKey ?? checksum(props.text)),
    [props.cacheKey, props.text],
  )

  if (!scrollViewportRef || blocks.length <= 1) {
    return (
      <MarkdownHtmlSegment
        text={props.text}
        cacheKey={props.cacheKey}
        className={cn(markdownClassName, props.className)}
        directory={props.directory}
        streaming={props.streaming}
        interrupted={props.interrupted}
      />
    )
  }

  return (
    <div className={cn("min-w-0 w-full max-w-full", props.className)}>
      {blocks.map((block, index) => (
        <LazyMarkdownBlock
          key={block.key}
          block={block}
          index={index}
          cacheKey={props.cacheKey}
          directory={props.directory}
          streaming={props.streaming}
          interrupted={props.interrupted}
        />
      ))}
    </div>
  )
}
