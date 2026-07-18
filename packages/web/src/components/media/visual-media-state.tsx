import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@buddy/ui"
import { AlertTriangleIcon, ImageIcon } from "@/icons/app-icons"
import { MediaLoadingVisual } from "./loading"
import { DEFAULT_MEDIA_LOADING_VARIANT } from "./loading/types"
import { MediaActions } from "./media-action-bar"
import type { MediaState } from "./types"

function MediaStateMessage(props: { title?: string; detail?: string }) {
  if (!props.title && !props.detail) return null
  return (
    <EmptyHeader>
      {props.title ? <EmptyTitle>{props.title}</EmptyTitle> : null}
      {props.detail ? <EmptyDescription>{props.detail}</EmptyDescription> : null}
    </EmptyHeader>
  )
}

export function VisualMediaState<T>(props: { state: MediaState<T> }) {
  const { state } = props
  if (state.status === "ready") return null

  if (state.status === "loading") {
    return (
      <div
        className="absolute inset-0 z-20 overflow-hidden rounded-[inherit] bg-surface-base"
        role="status"
        aria-live="polite"
      >
        <MediaLoadingVisual
          variant={state.variant ?? DEFAULT_MEDIA_LOADING_VARIANT}
          label={state.label}
          detail={state.detail}
          className="absolute inset-0 rounded-[inherit]"
        />
      </div>
    )
  }

  const error = state.status === "error"
  const title = state.message ?? (error ? "Preview unavailable" : "Nothing to preview")
  const Icon = error ? AlertTriangleIcon : ImageIcon

  return (
    <div className="absolute inset-0 z-20 flex bg-surface-base/95">
      <Empty className="border-0">
        <EmptyMedia variant="icon">
          <Icon aria-hidden />
        </EmptyMedia>
        <MediaStateMessage title={title} detail={state.detail} />
        {error && state.actions && state.actions.length > 0 ? (
          <EmptyContent>
            <MediaActions actions={state.actions} />
          </EmptyContent>
        ) : null}
      </Empty>
    </div>
  )
}
