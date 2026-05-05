import { cn } from "@buddy/ui"
import { useMemo } from "react"
import { MarkdownHtmlSegment, markdownClassName } from "./markdown-html-segment"
import { MarkdownMermaidSegment, type MarkdownMermaidContext } from "./markdown-mermaid-segment"
import { parseMarkdownSegments } from "./markdown-segments"

export function Markdown(props: {
  text: string
  className?: string
  cacheKey?: string
  mermaidContext?: MarkdownMermaidContext
  isStreaming?: boolean
}) {
  const baseCacheKey = props.cacheKey ?? props.text
  const segments = useMemo(() => parseMarkdownSegments(props.text), [props.text])
  const hasMermaidSegments =
    !!props.mermaidContext && segments.some((segment) => segment.kind === "mermaid")

  if (!hasMermaidSegments) {
    return (
      <MarkdownHtmlSegment
        text={props.text}
        cacheKey={baseCacheKey}
        className={cn(markdownClassName, props.className)}
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
        ) : null,
      )}
    </div>
  )
}

export type { MarkdownMermaidContext }
