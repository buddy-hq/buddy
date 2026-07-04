import { useCallback } from "react"
import { cn } from "@buddy/ui"
import { useKeyedMediaState } from "../use-keyed-media-state"
import { VisualMediaFrame } from "../visual-media-frame"
import {
  mediaStateData,
  type ImageMediaData,
  type ImageMediaItem,
  type MediaRendererProps,
  type MediaState,
} from "../types"

type NativeImageState = "loading" | "ready" | "error"

function effectiveImageState(
  state: ImageMediaItem["state"],
  nativeState: NativeImageState,
): MediaState<ImageMediaData> {
  if (state.status !== "ready") return state
  if (nativeState === "loading") {
    return {
      status: "loading",
      data: state.data,
    }
  }
  if (nativeState === "error") {
    return {
      status: "error",
      data: state.data,
      message: "Image preview unavailable",
    }
  }
  return state
}

export function ImageMediaRenderer(props: MediaRendererProps<ImageMediaItem>) {
  const data = mediaStateData(props.item.state)
  const [nativeState, setNativeState] = useKeyedMediaState<NativeImageState>(data?.src, "loading")
  const handleImageRef = useCallback(
    (image: HTMLImageElement | null) => {
      if (!image?.complete) return
      setNativeState(image.naturalWidth > 0 ? "ready" : "error")
    },
    [setNativeState],
  )

  const state = effectiveImageState(props.item.state, nativeState)
  const fitContent = props.fit === "content"

  return (
    <VisualMediaFrame
      state={state}
      actions={props.actions}
      chromeLabel={data?.caption}
      fit={props.fit}
      className={cn("min-h-56", props.className)}
    >
      {data ? (
        <button
          type="button"
          disabled={state.status !== "ready" || !props.onOpen}
          aria-label={props.onOpen ? `Open ${data.alt}` : undefined}
          className={cn(
            "flex flex-col items-center justify-center disabled:cursor-default",
            fitContent ? "h-full" : "size-full min-h-0",
            props.onOpen ? "cursor-zoom-in" : "cursor-default",
          )}
          onClick={props.onOpen}
        >
          <img
            ref={handleImageRef}
            src={data.src}
            alt={data.alt}
            loading="lazy"
            className={cn(
              fitContent ? "h-full w-auto max-w-full" : "size-full min-h-0 flex-1",
              data.fit === "cover" ? "object-cover" : "object-contain",
            )}
            onLoad={() => setNativeState("ready")}
            onError={() => setNativeState("error")}
          />
        </button>
      ) : null}
    </VisualMediaFrame>
  )
}
