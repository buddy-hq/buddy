import { Skeleton, cn } from "@buddy/ui"
import { useMermaidRender } from "@/components/media/renderers/mermaid/use-mermaid-render"
import type { MermaidMediaData } from "../types"

export function MermaidThumbnail(props: { data: MermaidMediaData; className?: string }) {
  const { state } = useMermaidRender({
    source: props.data.source,
    directory: props.data.directory,
    objectID: props.data.objectID,
    enabled: true,
    priority: 1,
    revisionID: props.data.revisionID,
  })

  if (state.status !== "ready") {
    return <Skeleton className={cn("size-full rounded-[inherit]", props.className)} />
  }

  return (
    <div
      aria-hidden
      className={cn(
        "pointer-events-none flex size-full items-center justify-center overflow-hidden rounded-[inherit] bg-background-base p-1.5 [&>svg]:!size-full [&>svg]:!max-h-full [&>svg]:!max-w-full",
        props.className,
      )}
      dangerouslySetInnerHTML={{ __html: state.value.svg }}
    />
  )
}
