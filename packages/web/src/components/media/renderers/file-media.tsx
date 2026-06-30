import { Skeleton, cn } from "@buddy/ui"
import { AlertTriangleIcon, FileQuestionIcon } from "lucide-react"
import { FileTypeIcon } from "@/components/files/file-type-icon"
import { MediaActions } from "../media-action-bar"
import { mediaStateData, type FileMediaData, type FileMediaItem, type MediaRendererProps } from "../types"

function FileContent(props: {
  data: FileMediaData
  status: FileMediaItem["state"]["status"]
  statusMessage?: string
}) {
  const unavailable = props.status === "error" || props.status === "empty"
  const detail = unavailable ? (props.statusMessage ?? "File unavailable") : props.data.detail

  return (
    <div
      data-component="media-file-row-content"
      className={cn(
        "flex min-w-0 flex-1 items-center gap-3 px-3 py-2.5",
        unavailable && "opacity-50",
      )}
    >
      <div className="h-8 w-[26.6px] shrink-0">
        <FileTypeIcon
          fileName={props.data.name}
          mediaKind={props.data.mediaKind}
          className="size-full object-contain"
        />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-text-base">{props.data.name}</p>
        {detail || props.data.mediaType ? (
          <p className="mt-0.5 truncate text-[11px] text-text-weak">
            {[props.data.mediaType, detail].filter(Boolean).join(" · ")}
          </p>
        ) : null}
      </div>
    </div>
  )
}

function FileUnavailable(props: {
  status: "error" | "empty"
  message?: string
  detail?: string
}) {
  const Icon = props.status === "error" ? AlertTriangleIcon : FileQuestionIcon
  const message =
    props.message ?? (props.status === "error" ? "File preview unavailable" : "File unavailable")

  return (
    <div className="flex min-w-0 flex-1 items-center gap-3 px-3 py-2.5">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-md border border-border-base bg-background-base text-text-weak">
        <Icon aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-text-base">{message}</p>
        {props.detail ? (
          <p className="mt-0.5 truncate text-[11px] text-text-weak">{props.detail}</p>
        ) : null}
      </div>
    </div>
  )
}

export function FileMediaRenderer(props: MediaRendererProps<FileMediaItem>) {
  const { state } = props.item
  const data = mediaStateData(state)

  return (
    <div
      data-component="media-file-row"
      data-status={state.status}
      role={props.onOpen ? "button" : undefined}
      tabIndex={props.onOpen ? 0 : undefined}
      onClick={props.onOpen}
      onKeyDown={(event) => {
        if (event.currentTarget !== event.target) return
        if (!props.onOpen || (event.key !== "Enter" && event.key !== " ")) return
        event.preventDefault()
        props.onOpen()
      }}
      className={cn(
        "relative flex min-h-14 w-full min-w-0 items-center overflow-hidden rounded-xl border border-border-weaker-base bg-surface-base shadow-sm",
        props.onOpen && "cursor-pointer hover:bg-surface-raised-base",
        props.className,
      )}
    >
      {data ? (
        <FileContent
          data={data}
          status={state.status}
          statusMessage={
            state.status === "error" || state.status === "empty" ? state.message : undefined
          }
        />
      ) : state.status === "error" || state.status === "empty" ? (
        <FileUnavailable status={state.status} message={state.message} detail={state.detail} />
      ) : null}
      {state.status === "loading" ? (
        <Skeleton className="absolute inset-0 rounded-[inherit]" />
      ) : null}
      {props.actions && props.actions.length > 0 ? (
        <div className="mr-2 shrink-0">
          <MediaActions actions={props.actions} />
        </div>
      ) : null}
    </div>
  )
}
