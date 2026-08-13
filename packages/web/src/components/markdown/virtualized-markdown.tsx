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
import type { WorkspaceResourceOpener } from "@/lib/use-workspace-file-open"
import { markdownContentHash } from "./markdown-content-hash"
import { MarkdownHtmlSegment, markdownBlockBoundaryClassName } from "./markdown-html-segment"
import type { MarkdownRenderedRootDecorator } from "./markdown-html-segment"

const LAZY_MARKDOWN_BLOCK_PREFETCH_PX = 1200
const MIN_MEASURED_BLOCK_HEIGHT_PX = 1
const MARKDOWN_BLOCK_MEASUREMENT_CACHE_LIMIT = 512
const MARKDOWN_BLOCK_MEASUREMENT_KEY_SEPARATOR = "\u0000"

const markdownBlockMeasurementCache = new Map<string, number>()

type MarkdownBlock = {
  ordinal: number
  markdown: string
  estimate: number
}

function markdownBlockMeasurementKey(input: {
  blockKey: string
  sourceHash: string
  viewportWidth: number
}) {
  return [input.blockKey, input.sourceHash, input.viewportWidth].join(
    MARKDOWN_BLOCK_MEASUREMENT_KEY_SEPARATOR,
  )
}

function cacheMarkdownBlockMeasurement(key: string, height: number) {
  markdownBlockMeasurementCache.delete(key)
  markdownBlockMeasurementCache.set(key, height)
  while (markdownBlockMeasurementCache.size > MARKDOWN_BLOCK_MEASUREMENT_CACHE_LIMIT) {
    const oldestKey = markdownBlockMeasurementCache.keys().next().value
    if (!oldestKey) break
    markdownBlockMeasurementCache.delete(oldestKey)
  }
}

function hasReferenceDefinitions(markdown: string): boolean {
  return /^\[[^\]]+\]:\s+\S+/mu.test(markdown) || /^\[\^[^\]]+\]:\s+/mu.test(markdown)
}

function estimateBlockHeight(markdown: string): number {
  const lineCount = markdown.split("\n").length
  const mathCount = (markdown.match(/\$\$|\\\[|\\\(|\\begin\{/gu) ?? []).length
  return Math.max(
    VIRTUAL_MARKDOWN_ESTIMATE_PX,
    44 + lineCount * 24 + mathCount * 72 + Math.ceil(markdown.length / 96) * 18,
  )
}

function pushMarkdownBlock(blocks: MarkdownBlock[], markdown: string): void {
  if (markdown.trim().length === 0) return
  blocks.push({
    ordinal: blocks.length,
    markdown,
    estimate: estimateBlockHeight(markdown),
  })
}

function splitMarkdownIntoBlocks(markdown: string): MarkdownBlock[] {
  const tokens = marked.lexer(markdown)
  const blocks: MarkdownBlock[] = []
  let buffer = ""

  for (const token of tokens) {
    const raw = token.raw
    if (!raw) continue

    if (buffer.length > 0 && buffer.length + raw.length > VIRTUAL_MARKDOWN_TARGET_CHARS) {
      pushMarkdownBlock(blocks, buffer)
      buffer = ""
    }

    if (raw.length >= VIRTUAL_MARKDOWN_MAX_TOKEN_CHARS) {
      if (buffer.length > 0) {
        pushMarkdownBlock(blocks, buffer)
        buffer = ""
      }
      pushMarkdownBlock(blocks, raw)
      continue
    }

    buffer += raw
  }

  pushMarkdownBlock(blocks, buffer)
  return blocks
}

export function shouldVirtualizeMarkdown(markdown: string): boolean {
  return markdown.length >= VIRTUAL_MARKDOWN_MIN_CHARS && !hasReferenceDefinitions(markdown)
}

export function shouldVirtualizeMarkdownLeaf(markdown: string): boolean {
  return markdown.length >= VIRTUAL_MARKDOWN_TARGET_CHARS
}

function LazyMarkdownBlock(props: {
  block: MarkdownBlock
  forceResident: boolean
  cacheKey?: string
  directory?: string
  onOpenResource?: WorkspaceResourceOpener
  streaming?: boolean
  interrupted?: boolean
  decorateRenderedRoot?: MarkdownRenderedRootDecorator
}) {
  const scrollViewportRef = useChatScrollViewport()
  const rootRef = useRef<HTMLDivElement | null>(null)
  const root = scrollViewportRef?.current
  const viewportWidth =
    typeof HTMLElement !== "undefined" && root instanceof HTMLElement ? root.clientWidth : 0
  const blockKey = `${props.cacheKey ?? "markdown"}:virtual-block:${props.block.ordinal}`
  const measurementKey = markdownBlockMeasurementKey({
    blockKey,
    sourceHash: markdownContentHash(props.block.markdown),
    viewportWidth,
  })
  const cachedHeight = markdownBlockMeasurementCache.get(measurementKey)
  const measuredHeightRef = useRef<{ key: string; height: number } | undefined>(
    cachedHeight === undefined ? undefined : { key: measurementKey, height: cachedHeight },
  )
  const [nearViewport, setNearViewport] = useState(props.block.ordinal === 0 || props.forceResident)
  const [placeholderMeasurement, setPlaceholderMeasurement] = useState<
    { key: string; height: number } | undefined
  >(cachedHeight === undefined ? undefined : { key: measurementKey, height: cachedHeight })
  const placeholderHeight =
    placeholderMeasurement?.key === measurementKey ? placeholderMeasurement.height : cachedHeight
  const shouldCacheMeasurement = !(props.streaming === true && props.forceResident)
  const canObserve =
    typeof HTMLElement !== "undefined" &&
    root instanceof HTMLElement &&
    typeof IntersectionObserver !== "undefined"
  const resident = !canObserve || props.forceResident || nearViewport

  useEffect(() => {
    const scrollRoot = scrollViewportRef?.current
    const element = rootRef.current
    if (!(element instanceof HTMLDivElement)) return
    if (!(scrollRoot instanceof HTMLElement)) {
      setNearViewport(true)
      return
    }
    if (typeof IntersectionObserver === "undefined") {
      setNearViewport(true)
      return
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const nextNearViewport = entries.some((entry) => entry.isIntersecting)
        if (!nextNearViewport) {
          const measuredHeight =
            (measuredHeightRef.current?.key === measurementKey
              ? measuredHeightRef.current.height
              : undefined) ?? element.getBoundingClientRect().height
          if (measuredHeight >= MIN_MEASURED_BLOCK_HEIGHT_PX) {
            if (shouldCacheMeasurement) {
              cacheMarkdownBlockMeasurement(measurementKey, measuredHeight)
            }
            setPlaceholderMeasurement({ key: measurementKey, height: measuredHeight })
          }
        }
        setNearViewport(nextNearViewport)
      },
      {
        root: scrollRoot,
        rootMargin: `${LAZY_MARKDOWN_BLOCK_PREFETCH_PX}px 0px ${LAZY_MARKDOWN_BLOCK_PREFETCH_PX}px 0px`,
      },
    )

    observer.observe(element)
    return () => observer.disconnect()
  }, [measurementKey, scrollViewportRef, shouldCacheMeasurement])

  useEffect(() => {
    const element = rootRef.current
    if (!resident || !(element instanceof HTMLDivElement)) return

    const rememberHeight = () => {
      const height = element.getBoundingClientRect().height
      if (height >= MIN_MEASURED_BLOCK_HEIGHT_PX) {
        measuredHeightRef.current = { key: measurementKey, height }
        if (shouldCacheMeasurement) {
          cacheMarkdownBlockMeasurement(measurementKey, height)
        }
      }
    }
    rememberHeight()
    if (typeof ResizeObserver === "undefined") return

    const observer = new ResizeObserver(rememberHeight)
    observer.observe(element)
    return () => observer.disconnect()
  }, [measurementKey, props.block.markdown, resident, shouldCacheMeasurement])

  return (
    <div
      ref={rootRef}
      data-markdown-virtual-block-key={blockKey}
      data-markdown-residency={resident ? "resident" : "placeholder"}
      className="min-w-0 w-full max-w-full [contain-intrinsic-size:auto_220px] [content-visibility:auto] [&:not(:last-child)]:pb-3"
      style={resident ? undefined : { minHeight: `${placeholderHeight ?? props.block.estimate}px` }}
    >
      {resident ? (
        <MarkdownHtmlSegment
          text={props.block.markdown}
          cacheKey={blockKey}
          className={markdownBlockBoundaryClassName}
          directory={props.directory}
          onOpenResource={props.onOpenResource}
          streaming={props.streaming}
          interrupted={props.interrupted}
          decorateRenderedRoot={props.decorateRenderedRoot}
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
  onOpenResource?: WorkspaceResourceOpener
  streaming?: boolean
  interrupted?: boolean
  decorateRenderedRoot?: MarkdownRenderedRootDecorator
}) {
  const scrollViewportRef = useChatScrollViewport()
  const blocks = useMemo(() => splitMarkdownIntoBlocks(props.text), [props.text])

  if (!scrollViewportRef) {
    return (
      <MarkdownHtmlSegment
        text={props.text}
        cacheKey={props.cacheKey}
        className={cn(markdownBlockBoundaryClassName, props.className)}
        directory={props.directory}
        onOpenResource={props.onOpenResource}
        streaming={props.streaming}
        interrupted={props.interrupted}
        decorateRenderedRoot={props.decorateRenderedRoot}
      />
    )
  }

  return (
    <div
      className={cn("min-w-0 w-full max-w-full", props.className)}
      data-markdown-virtualized="true"
      data-markdown-source-hash={markdownContentHash(props.text)}
    >
      {blocks.map((block, index) => (
        <LazyMarkdownBlock
          key={`${props.cacheKey ?? "markdown"}:virtual-block:${block.ordinal}`}
          block={block}
          forceResident={props.streaming === true && index === blocks.length - 1}
          cacheKey={props.cacheKey}
          directory={props.directory}
          onOpenResource={props.onOpenResource}
          streaming={props.streaming}
          interrupted={props.interrupted}
          decorateRenderedRoot={props.decorateRenderedRoot}
        />
      ))}
    </div>
  )
}
