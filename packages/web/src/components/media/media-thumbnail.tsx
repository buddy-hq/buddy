import { Skeleton, cn } from "@buddy/ui"
import { AppWindowIcon, FileIcon, Music2Icon, PlayIcon } from "@/icons/app-icons"
import type { MediaItem } from "./types"
import { MermaidThumbnail } from "./renderers/mermaid-thumbnail"

export function MediaThumbnail(props: { item: MediaItem; className?: string }) {
  const { item } = props
  if (item.state.status !== "ready") {
    return <Skeleton className={cn("size-full rounded-[inherit]", props.className)} />
  }

  if (item.kind === "image") {
    return (
      <img
        src={item.state.data.src}
        alt=""
        className={cn("size-full object-cover", props.className)}
      />
    )
  }

  if (item.kind === "mermaid") {
    return <MermaidThumbnail data={item.state.data} className={props.className} />
  }

  const Icon =
    item.kind === "video"
      ? PlayIcon
      : item.kind === "audio"
        ? Music2Icon
        : item.kind === "html"
          ? AppWindowIcon
          : FileIcon

  return (
    <div
      className={cn(
        "flex size-full items-center justify-center bg-surface-raised-base text-text-weak",
        props.className,
      )}
    >
      <Icon aria-hidden />
    </div>
  )
}
