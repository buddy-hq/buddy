import { cn } from "@buddy/ui"
import { useMemo, type ReactNode } from "react"
import { MarkdownChemistrySegment } from "./markdown-chemistry-segment"
import { markdownContentHash } from "./markdown-content-hash"
import {
  MarkdownHtmlSegment,
  markdownBlockBoundaryClassName,
  markdownClassName,
} from "./markdown-html-segment"
import type { MarkdownRenderedRootDecorator } from "./markdown-html-segment"
import { MarkdownMermaidSegment, type MarkdownMermaidContext } from "./markdown-mermaid-segment"
import { parseMarkdownSegments, type MarkdownSegment } from "./markdown-segments"
import {
  shouldVirtualizeMarkdown,
  shouldVirtualizeMarkdownLeaf,
  VirtualizedMarkdown,
} from "./virtualized-markdown"
import { CHEMISTRY_FORMATS } from "@/components/media/renderers/chemistry/formats"
import { MermaidDiagram } from "@/components/media/renderers/mermaid/mermaid-diagram"
import type { WorkspaceResourceOpener } from "@/lib/use-workspace-file-open"

const POSSIBLE_MERMAID_BLOCK_RE =
  /(^|[\r\n]) {0,3}(`{3,}|~{3,})[ \t]*mermaid(?:[ \t][^\r\n]*)?(?:\r\n|\r|\n)/u
const POSSIBLE_CHEMISTRY_BLOCK_RE = new RegExp(
  `(^|[\\r\\n]) {0,3}(\`{3,}|~{3,})[ \\t]*(?:${CHEMISTRY_FORMATS.join("|")})(?:[ \\t][^\\r\\n]*)?(?:\\r\\n|\\r|\\n)`,
  "iu",
)

export function canContainMermaidBlock(markdown: string): boolean {
  return POSSIBLE_MERMAID_BLOCK_RE.test(markdown)
}

export function canContainChemistryBlock(markdown: string): boolean {
  return POSSIBLE_CHEMISTRY_BLOCK_RE.test(markdown)
}

type MarkdownProps = {
  text: string
  className?: string
  cacheKey?: string
  mermaidContext?: MarkdownMermaidContext
  chemistryContext?: MarkdownChemistryContext
  isStreaming?: boolean
  isInterrupted?: boolean
  renderMermaid?: boolean
  directory?: string
  onOpenResource?: WorkspaceResourceOpener
  decorateRenderedRoot?: MarkdownRenderedRootDecorator
}

type MarkdownChemistryContext = {
  directory: string
  sessionID: string
  messageID: string
  partID: string
}

function markdownHtmlSegment(input: {
  segmentKey: string
  markdown: string
  props: MarkdownProps
  virtualize: boolean
}): ReactNode {
  if (input.virtualize && shouldVirtualizeMarkdownLeaf(input.markdown)) {
    return (
      <VirtualizedMarkdown
        text={input.markdown}
        cacheKey={`${input.segmentKey}:html`}
        directory={input.props.directory}
        onOpenResource={input.props.onOpenResource}
        streaming={input.props.isStreaming}
        interrupted={input.props.isInterrupted}
        decorateRenderedRoot={input.props.decorateRenderedRoot}
      />
    )
  }

  return (
    <MarkdownHtmlSegment
      text={input.markdown}
      cacheKey={`${input.segmentKey}:html`}
      className={markdownBlockBoundaryClassName}
      directory={input.props.directory}
      onOpenResource={input.props.onOpenResource}
      streaming={input.props.isStreaming}
      interrupted={input.props.isInterrupted}
      decorateRenderedRoot={input.props.decorateRenderedRoot}
    />
  )
}

function renderMarkdownSegment(input: {
  segmentKey: string
  segment: MarkdownSegment
  props: MarkdownProps
  virtualizeHtml: boolean
}): ReactNode {
  const segment = input.segment
  if (segment.kind === "html") {
    return markdownHtmlSegment({
      segmentKey: input.segmentKey,
      markdown: segment.markdown,
      props: input.props,
      virtualize: input.virtualizeHtml,
    })
  }
  if (segment.kind === "chemistry") {
    return (
      <MarkdownChemistrySegment
        format={segment.format}
        source={segment.source}
        alt={segment.alt}
        directory={input.props.directory}
        autoRepairContext={
          input.props.chemistryContext &&
          input.props.isStreaming !== true &&
          input.props.isInterrupted !== true
            ? {
                ...input.props.chemistryContext,
                segmentIndex: segment.segmentIndex,
                rawFence: segment.raw,
              }
            : undefined
        }
      />
    )
  }
  if (input.props.mermaidContext) {
    return (
      <MarkdownMermaidSegment
        cacheKey={input.segmentKey}
        context={input.props.mermaidContext}
        isStreaming={input.props.isStreaming ?? false}
        raw={segment.raw}
        segmentIndex={segment.segmentIndex}
        source={segment.source}
      />
    )
  }
  if (input.props.renderMermaid) {
    return (
      <div className="my-4 overflow-hidden rounded-xl border border-border-weaker-base bg-background-base">
        <MermaidDiagram
          source={segment.source}
          alt="Mermaid diagram"
          directory={input.props.directory}
          minimalActions
          className="min-h-56"
        />
      </div>
    )
  }
  return markdownHtmlSegment({
    segmentKey: input.segmentKey,
    markdown: segment.raw,
    props: input.props,
    virtualize: input.virtualizeHtml,
  })
}

function singleHtmlSegment(markdown: string): MarkdownSegment[] {
  return [{ kind: "html", markdown, segmentIndex: 0 }]
}

export function Markdown(props: MarkdownProps): ReactNode {
  const baseCacheKey = props.cacheKey ?? props.text
  const canRenderMermaid =
    (!!props.mermaidContext || props.renderMermaid === true) && canContainMermaidBlock(props.text)
  const canContainChemistry = canContainChemistryBlock(props.text)
  const segments = useMemo(() => {
    if (!canRenderMermaid && !canContainChemistry) return singleHtmlSegment(props.text)
    const parsed = parseMarkdownSegments(props.text)
    return parsed.length > 0 ? parsed : singleHtmlSegment(props.text)
  }, [canContainChemistry, canRenderMermaid, props.text])
  const hasRenderableSegments = segments.some(
    (segment) => segment.kind === "chemistry" || (segment.kind === "mermaid" && canRenderMermaid),
  )

  const virtualizeHtml = shouldVirtualizeMarkdown(props.text)
  const branch = hasRenderableSegments
    ? virtualizeHtml
      ? "segmented-lazy"
      : "segmented"
    : virtualizeHtml
      ? "lazy"
      : "eager"
  const phase = props.isInterrupted ? "interrupted" : props.isStreaming ? "streaming" : "complete"

  return (
    <div
      className={cn(markdownClassName, "min-w-0 w-full max-w-full", props.className)}
      data-markdown-document={baseCacheKey}
      data-markdown-source-length={props.text.length}
      data-markdown-source-hash={markdownContentHash(props.text)}
      data-markdown-phase={phase}
      data-markdown-branch={branch}
      data-markdown-segment-count={segments.length}
    >
      {segments.map((segment) => {
        const segmentKey = `${baseCacheKey}:segment:${segment.segmentIndex}`
        return (
          <div
            key={segmentKey}
            className={cn("min-w-0 w-full max-w-full", segment.kind !== "html" && "not-prose")}
            data-markdown-segment-key={segmentKey}
            data-markdown-segment-kind={segment.kind}
          >
            {renderMarkdownSegment({ segmentKey, segment, props, virtualizeHtml })}
          </div>
        )
      })}
    </div>
  )
}

export type { MarkdownChemistryContext, MarkdownMermaidContext }
