import { cn } from "@buddy/ui"
import { useMemo, type ReactNode } from "react"
import { MarkdownChemistrySegment } from "./markdown-chemistry-segment"
import { MarkdownHtmlSegment, markdownClassName } from "./markdown-html-segment"
import { MarkdownMermaidSegment, type MarkdownMermaidContext } from "./markdown-mermaid-segment"
import { parseMarkdownSegments, type MarkdownSegment } from "./markdown-segments"
import { shouldVirtualizeMarkdown, VirtualizedMarkdown } from "./virtualized-markdown"
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
  preferEagerRender?: boolean
  renderMermaid?: boolean
  directory?: string
  onOpenResource?: WorkspaceResourceOpener
}

type MarkdownChemistryContext = {
  directory: string
  sessionID: string
  messageID: string
  partID: string
}

function markdownHtmlSegment(input: {
  key: string
  markdown: string
  props: MarkdownProps
}): ReactNode {
  return (
    <MarkdownHtmlSegment
      key={input.key}
      text={input.markdown}
      cacheKey={input.key}
      directory={input.props.directory}
      onOpenResource={input.props.onOpenResource}
      streaming={input.props.isStreaming}
      interrupted={input.props.isInterrupted}
    />
  )
}

function renderMarkdownSegment(input: {
  baseCacheKey: string
  segment: MarkdownSegment
  props: MarkdownProps
}): ReactNode {
  const segment = input.segment
  const key = `${input.baseCacheKey}:${segment.kind}:${segment.segmentIndex}`
  if (segment.kind === "html") {
    return markdownHtmlSegment({ key, markdown: segment.markdown, props: input.props })
  }
  if (segment.kind === "chemistry") {
    return (
      <MarkdownChemistrySegment
        key={key}
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
        key={key}
        cacheKey={key}
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
      <div
        key={key}
        className="my-4 overflow-hidden rounded-xl border border-border-weaker-base bg-background-base"
      >
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
  return markdownHtmlSegment({ key, markdown: segment.raw, props: input.props })
}

export function Markdown(props: MarkdownProps): ReactNode {
  const baseCacheKey = props.cacheKey ?? props.text
  const canRenderMermaid =
    (!!props.mermaidContext || props.renderMermaid === true) && canContainMermaidBlock(props.text)
  const canContainChemistry = canContainChemistryBlock(props.text)
  const segments = useMemo(
    () =>
      canRenderMermaid || canContainChemistry ? parseMarkdownSegments(props.text) : [],
    [canContainChemistry, canRenderMermaid, props.text],
  )
  const hasRenderableSegments = segments.some(
    (segment) =>
      segment.kind === "chemistry" || (segment.kind === "mermaid" && canRenderMermaid),
  )

  if (!hasRenderableSegments) {
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
        renderMarkdownSegment({ baseCacheKey, segment, props }),
      )}
    </div>
  )
}

export type { MarkdownChemistryContext, MarkdownMermaidContext }
