import { cn } from "@buddy/ui"
import { useMemo } from "react"
import { MarkdownHtmlSegment, markdownClassName } from "./markdown-html-segment"
import { MarkdownMermaidSegment, type MarkdownMermaidContext } from "./markdown-mermaid-segment"
import { parseMarkdownSegments } from "./markdown-segments"
import { shouldVirtualizeMarkdown, VirtualizedMarkdown } from "./virtualized-markdown"
import { MermaidDiagram } from "@/components/media/renderers/mermaid/mermaid-diagram"
import type { WorkspaceResourceOpener } from "@/lib/use-workspace-file-open"

const POSSIBLE_MERMAID_BLOCK_RE = /(^|\n)[ \t]{0,3}(`{3,}|~{3,})[ \t]*mermaid(?:[ \t][^\n]*)?\r?\n/u

export function canContainMermaidBlock(markdown: string): boolean {
  return POSSIBLE_MERMAID_BLOCK_RE.test(markdown)
}

export function Markdown(props: {
  text: string
  className?: string
  cacheKey?: string
  mermaidContext?: MarkdownMermaidContext
  isStreaming?: boolean
  isInterrupted?: boolean
  preferEagerRender?: boolean
  renderMermaid?: boolean
  directory?: string
  onOpenResource?: WorkspaceResourceOpener
}) {
  const baseCacheKey = props.cacheKey ?? props.text
  const canContainMermaid =
    (!!props.mermaidContext || props.renderMermaid === true) && canContainMermaidBlock(props.text)
  const segments = useMemo(
    () => (canContainMermaid ? parseMarkdownSegments(props.text) : []),
    [canContainMermaid, props.text],
  )
  const hasMermaidSegments = segments.some((segment) => segment.kind === "mermaid")

  if (!hasMermaidSegments) {
    if (!props.preferEagerRender && shouldVirtualizeMarkdown(props.text)) {
      return (
        <VirtualizedMarkdown
          text={props.text}
          cacheKey={baseCacheKey}
          className={props.className}
          directory={props.directory}
          onOpenResource={props.onOpenResource}
          streaming={props.isStreaming}
          interrupted={props.isInterrupted}
        />
      )
    }

    return (
      <MarkdownHtmlSegment
        text={props.text}
        cacheKey={baseCacheKey}
        className={cn(markdownClassName, props.className)}
        directory={props.directory}
        onOpenResource={props.onOpenResource}
        streaming={props.isStreaming}
        interrupted={props.isInterrupted}
      />
    )
  }

  return (
    <div className={cn(markdownClassName, props.className)}>
      {segments.map((segment) =>
        segment.kind === "html" ? (
          <MarkdownHtmlSegment
            key={`${baseCacheKey}:html:${segment.segmentIndex}`}
            text={segment.markdown}
            cacheKey={`${baseCacheKey}:html:${segment.segmentIndex}`}
            directory={props.directory}
            onOpenResource={props.onOpenResource}
            streaming={props.isStreaming}
            interrupted={props.isInterrupted}
          />
        ) : props.mermaidContext ? (
          <MarkdownMermaidSegment
            key={`${baseCacheKey}:mermaid:${segment.segmentIndex}`}
            cacheKey={`${baseCacheKey}:mermaid:${segment.segmentIndex}`}
            context={props.mermaidContext}
            isStreaming={props.isStreaming ?? false}
            raw={segment.raw}
            segmentIndex={segment.segmentIndex}
            source={segment.source}
          />
        ) : props.renderMermaid ? (
          <div
            key={`${baseCacheKey}:mermaid:${segment.segmentIndex}`}
            className="my-4 overflow-hidden rounded-xl border border-border-weaker-base bg-background-base"
          >
            <MermaidDiagram
              source={segment.source}
              alt="Mermaid diagram"
              directory={props.directory}
              minimalActions
              className="min-h-56"
            />
          </div>
        ) : null,
      )}
    </div>
  )
}

export type { MarkdownMermaidContext }
