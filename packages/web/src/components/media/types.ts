import type { LucideIcon } from "lucide-react"
import type { HtmlWidgetPresentation } from "@/lib/html-widgets"
import type { WorkspaceMediaKind } from "@/lib/workspace-file-media"
import type { PresentMediaResolvedItem } from "./presented-media-types"
import type { MediaLoadingVariant } from "./loading/types"

type MediaLoadingState<T> = {
  status: "loading"
  data?: T
  label?: string
  detail?: string
  variant?: MediaLoadingVariant
}

type MediaReadyState<T> = {
  status: "ready"
  data: T
}

type MediaErrorState<T> = {
  status: "error"
  data?: T
  message?: string
  detail?: string
  actions?: MediaAction[]
}

type MediaEmptyState<T> = {
  status: "empty"
  data?: T
  message?: string
  detail?: string
}

export type MediaState<T> =
  | MediaLoadingState<T>
  | MediaReadyState<T>
  | MediaErrorState<T>
  | MediaEmptyState<T>

export type MediaCommandAction = {
  kind?: "command"
  id: string
  label: string
  icon: LucideIcon
  disabled?: boolean
  loading?: boolean
  onSelect: () => void
}

export type MediaMenuItem =
  | {
      kind?: "command"
      id: string
      label: string
      icon?: LucideIcon
      disabled?: boolean
      loading?: boolean
      onSelect: () => void
    }
  | {
      kind: "separator"
      id: string
    }

export type MediaMenuAction = {
  kind: "menu"
  id: string
  label: string
  icon: LucideIcon
  disabled?: boolean
  items: MediaMenuItem[]
}

export type MediaAction = MediaCommandAction | MediaMenuAction

export type ImageMediaData = {
  src: string
  alt: string
  caption?: string
  captionPlacement?: "footer" | "overlay"
  fit?: "contain" | "cover"
}

export type MermaidMediaData = {
  source: string
  alt: string
  directory?: string
  objectID?: string
  revisionID?: string | null
  renderPriority?: number
  onFullscreenOpen?: () => void
  onRequestFix?: (errorMessage: string) => void
  onRenderFailure?: (input: { message: string; persisted: boolean; renderKey?: string }) => void
  errorDetail?: string
  fixDisabled?: boolean
}

type PresentedPlaybackMediaData = {
  item: PresentMediaResolvedItem
  playbackKey: string
  onOpen?: () => void
  fallback: {
    item: FileMediaItem
    actions?: MediaAction[]
    onOpen?: () => void
  }
  compact?: boolean
  shouldLoad?: boolean
}

export type VideoMediaData = PresentedPlaybackMediaData

export type AudioMediaData = PresentedPlaybackMediaData

export type HtmlMediaData = {
  widget: HtmlWidgetPresentation
  reloadKey?: number
}

export type FileMediaData = {
  name: string
  detail?: string
  mediaType?: string
  mediaKind?: WorkspaceMediaKind
}

export type ImageMediaItem = {
  kind: "image"
  state: MediaState<ImageMediaData>
}

export type MermaidMediaItem = {
  kind: "mermaid"
  state: MediaState<MermaidMediaData>
}

export type VideoMediaItem = {
  kind: "video"
  state: MediaState<VideoMediaData>
}

export type AudioMediaItem = {
  kind: "audio"
  state: MediaState<AudioMediaData>
}

export type HtmlMediaItem = {
  kind: "html"
  state: MediaState<HtmlMediaData>
}

export type FileMediaItem = {
  kind: "file"
  state: MediaState<FileMediaData>
}

export type MediaItem =
  | ImageMediaItem
  | MermaidMediaItem
  | VideoMediaItem
  | AudioMediaItem
  | HtmlMediaItem
  | FileMediaItem

export type MediaProps = {
  item: MediaItem
  actions?: MediaAction[]
  onOpen?: () => void
  className?: string
  fit?: "content" | "fill"
}

export type MediaRendererProps<TItem extends MediaItem> = {
  item: TItem
  actions?: MediaAction[]
  onOpen?: () => void
  className?: string
  fit?: "content" | "fill"
}

export function mediaStateData<T>(state: MediaState<T>): T | undefined {
  return "data" in state ? state.data : undefined
}
