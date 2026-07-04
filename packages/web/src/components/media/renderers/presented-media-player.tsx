import { useCallback, useEffect, useRef, useState, type ReactNode } from "react"
import { Button, Skeleton, Slider, cn } from "@buddy/ui"
import {
  Maximize2Icon,
  Music2Icon,
  PauseIcon,
  PlayIcon,
  VideoIcon,
  Volume2Icon,
  VolumeXIcon,
} from "lucide-react"
import { resolveAssetUrl } from "@/lib/resource-url"
import { usePresentedMediaPlaybackStore } from "@/state/presented-media-playback-store"
import type { PresentMediaResolvedItem } from "../presented-media-types"
import { useKeyedMediaState } from "../use-keyed-media-state"

export type PresentedMediaPlayerState =
  | {
      status: "deferred"
    }
  | {
      status: "loading"
    }
  | {
      status: "ready"
    }
  | {
      status: "error"
      message: string
    }
  | {
      status: "fallback"
    }

const MEDIA_TIME_STEP_SECONDS = 0.1
const MEDIA_VOLUME_STEP = 0.05
const SECONDS_PER_MINUTE = 60
const VIDEO_STAGE_CLASS_NAME =
  "relative flex aspect-video w-full items-center justify-center overflow-hidden bg-background-stronger"

function isSafeInlineAudio(mimeType: string | null) {
  return (
    mimeType === "audio/mpeg" ||
    mimeType === "audio/mp4" ||
    mimeType === "audio/ogg" ||
    mimeType === "audio/wav" ||
    mimeType === "audio/x-wav" ||
    mimeType === "audio/flac"
  )
}

function isSafeInlineVideo(mimeType: string | null) {
  return (
    mimeType === "video/mp4" ||
    mimeType === "video/webm" ||
    mimeType === "video/ogg" ||
    mimeType === "video/quicktime"
  )
}

function formatMediaTime(value: number) {
  if (!Number.isFinite(value) || value < 0) return "0:00"
  const totalSeconds = Math.floor(value)
  const minutes = Math.floor(totalSeconds / SECONDS_PER_MINUTE)
  const seconds = totalSeconds % SECONDS_PER_MINUTE
  return `${minutes}:${seconds.toString().padStart(2, "0")}`
}

function MediaShell(props: { children: ReactNode }) {
  return (
    <div
      className="flex w-full flex-col overflow-hidden rounded-xl border border-border-weaker-base bg-background-base shadow-sm"
      data-component="presented-media-player"
    >
      {props.children}
    </div>
  )
}

function MediaInfoRow(props: {
  item: PresentMediaResolvedItem
  compact?: boolean
  trailing: ReactNode
}) {
  const isVideo = props.item.mediaKind === "video"

  return (
    <div
      className={cn(
        "flex items-center gap-3 border-t border-border-weaker-base",
        props.compact ? "px-3 py-2.5" : "px-4 py-3",
      )}
    >
      <span className="flex size-9 shrink-0 items-center justify-center rounded-full border border-border-base bg-background-base text-text-base">
        {isVideo ? (
          <VideoIcon className="size-4 text-text-weak" aria-hidden />
        ) : (
          <Music2Icon className="size-4 text-text-weak" aria-hidden />
        )}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-text-base">{props.item.fileName}</p>
        <p className="mt-0.5 text-xs text-text-weak">{isVideo ? "Video" : "Audio"}</p>
      </div>
      {props.trailing}
    </div>
  )
}

function MediaPlaceholder(props: {
  item: PresentMediaResolvedItem
  onActivate: () => void
  compact?: boolean
}) {
  const isVideo = props.item.mediaKind === "video"

  if (isVideo) {
    return (
      <MediaShell>
        <button type="button" onClick={props.onActivate} className="group flex w-full flex-col">
          <div className={VIDEO_STAGE_CLASS_NAME}>
            <Skeleton className="absolute inset-0 rounded-none" />
            <span className="relative z-10 flex size-14 items-center justify-center rounded-full border border-border-base bg-background-base/95 text-text-base shadow-sm transition-transform duration-150 group-hover:scale-105">
              <PlayIcon className="size-5 translate-x-px" aria-hidden />
            </span>
          </div>
          <MediaInfoRow
            item={props.item}
            compact={props.compact}
            trailing={<span className="text-xs text-text-weak">Load preview</span>}
          />
        </button>
      </MediaShell>
    )
  }

  return (
    <MediaShell>
      <button type="button" onClick={props.onActivate} className="group flex w-full flex-col">
        <div className="flex min-h-28 items-center gap-3 bg-surface-raised-base/60 px-5 py-4">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-full border border-border-base bg-background-base text-text-base">
            <Music2Icon className="size-5" aria-hidden />
          </span>
          <div className="min-w-0 flex-1 text-left">
            <p className="truncate text-sm font-medium text-text-base">{props.item.fileName}</p>
            <p className="mt-1 text-xs text-text-weak">Audio</p>
          </div>
          <span className="flex size-10 items-center justify-center rounded-full border border-border-base bg-background-base text-text-base shadow-sm transition-transform duration-150 group-hover:scale-105">
            <PlayIcon className="size-4 translate-x-px" aria-hidden />
          </span>
        </div>
        <div className="flex items-center justify-between gap-3 border-t border-border-weaker-base px-4 py-3">
          <div className="min-w-0">
            <p className="text-sm font-medium text-text-base">Load preview</p>
            <p className="mt-0.5 text-xs text-text-weak">
              Keeps the player lightweight until needed
            </p>
          </div>
        </div>
      </button>
    </MediaShell>
  )
}

function MediaLoadingState(props: { item: PresentMediaResolvedItem; compact?: boolean }) {
  const isVideo = props.item.mediaKind === "video"

  if (isVideo) {
    return (
      <MediaShell>
        <div className={VIDEO_STAGE_CLASS_NAME}>
          <Skeleton className="absolute inset-0 rounded-none" />
          <div className="relative z-10 flex flex-col items-center gap-2 text-text-weak">
            <VideoIcon className="size-6" aria-hidden />
            <span className="text-xs font-medium">Loading preview</span>
          </div>
        </div>
        <div className="flex flex-col gap-2 border-t border-border-weaker-base px-3 py-2.5">
          <div className="flex items-center gap-2">
            <Skeleton className="size-8 shrink-0 rounded-md" />
            <Skeleton className="h-3 w-10 shrink-0 rounded" />
            <Skeleton className="h-3 flex-1 rounded" />
            <Skeleton className="h-3 w-10 shrink-0 rounded" />
            <Skeleton className="size-8 shrink-0 rounded-md" />
            <Skeleton className="hidden h-3 w-20 rounded sm:flex" />
            <Skeleton className="size-8 shrink-0 rounded-md" />
          </div>
        </div>
      </MediaShell>
    )
  }

  return (
    <MediaShell>
      <div className="flex min-h-28 items-center gap-3 bg-surface-raised-base/60 px-5 py-4">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-full border border-border-base bg-background-base text-text-base">
          <Music2Icon className="size-5" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-text-base">{props.item.fileName}</p>
          <p className="mt-1 text-xs text-text-weak">Loading audio</p>
        </div>
        <Skeleton className="h-3 w-16 rounded" />
      </div>
      <div className="flex flex-col gap-2 border-t border-border-weaker-base px-3 py-2.5">
        <div className="flex items-center gap-2">
          <Skeleton className="size-8 shrink-0 rounded-md" />
          <Skeleton className="h-3 w-10 shrink-0 rounded" />
          <Skeleton className="h-3 flex-1 rounded" />
          <Skeleton className="h-3 w-10 shrink-0 rounded" />
          <Skeleton className="size-8 shrink-0 rounded-md" />
          <Skeleton className="hidden h-3 w-20 rounded sm:flex" />
        </div>
      </div>
    </MediaShell>
  )
}

function BuddyMediaTransport(props: {
  item: PresentMediaResolvedItem
  playbackKey: string
  src: string
  onOpen?: () => void
  onStateChange?: (state: PresentedMediaPlayerState) => void
}) {
  const { item, onOpen, playbackKey, src, onStateChange } = props
  const isVideo = item.mediaKind === "video"
  const shellRef = useRef<HTMLDivElement | null>(null)
  const mediaRef = useRef<HTMLMediaElement | null>(null)
  const requestPlayback = usePresentedMediaPlaybackStore((state) => state.requestPlayback)
  const pausePlayback = usePresentedMediaPlaybackStore((state) => state.pausePlayback)
  const volume = usePresentedMediaPlaybackStore((state) => state.volume)
  const muted = usePresentedMediaPlaybackStore((state) => state.muted)
  const setVolumePreference = usePresentedMediaPlaybackStore((state) => state.setVolumePreference)
  const setMutedPreference = usePresentedMediaPlaybackStore((state) => state.setMutedPreference)
  const isCurrentPlayback = usePresentedMediaPlaybackStore(
    (state) => state.playingKey === playbackKey,
  )
  const [playing, setPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [error, setError] = useKeyedMediaState<string | undefined>(src, undefined)
  const [hasLoadedFrame, setHasLoadedFrame] = useKeyedMediaState(src, !isVideo)

  useEffect(() => {
    return () => {
      mediaRef.current?.pause()
    }
  }, [])

  useEffect(() => {
    const media = mediaRef.current
    if (!media) return
    if (media.volume !== volume) {
      media.volume = volume
    }
    if (media.muted !== muted) {
      media.muted = muted
    }
  }, [muted, volume])

  useEffect(() => {
    const media = mediaRef.current
    if (!media || isCurrentPlayback || media.paused) return
    media.pause()
  }, [isCurrentPlayback])

  const togglePlayback = useCallback(async () => {
    const media = mediaRef.current
    if (!media) return

    try {
      setError(undefined)
      if (media.paused) {
        requestPlayback(playbackKey)
        await media.play()
      } else {
        media.pause()
      }
    } catch (playbackError) {
      pausePlayback(playbackKey)
      const message = playbackError instanceof Error ? playbackError.message : String(playbackError)
      setError(message)
      onStateChange?.({
        status: "error",
        message,
      })
    }
  }, [onStateChange, pausePlayback, playbackKey, requestPlayback, setError])

  const seek = useCallback((values: number[]) => {
    const media = mediaRef.current
    const value = values[0]
    if (!media || value === undefined || !Number.isFinite(value)) return
    media.currentTime = value
    setCurrentTime(value)
  }, [])

  const changeVolume = useCallback(
    (values: number[]) => {
      const value = values[0]
      if (value === undefined || !Number.isFinite(value)) return
      setVolumePreference(value)
    },
    [setVolumePreference],
  )

  const toggleMuted = useCallback(() => {
    setMutedPreference(!muted)
  }, [muted, setMutedPreference])

  const enterFullscreen = useCallback(async () => {
    if (onOpen) {
      onOpen()
      return
    }
    if (!shellRef.current?.requestFullscreen) return
    await shellRef.current.requestFullscreen()
  }, [onOpen])

  return (
    <MediaShell>
      {isVideo ? (
        <div ref={shellRef} className={VIDEO_STAGE_CLASS_NAME}>
          {!hasLoadedFrame ? <Skeleton className="absolute inset-0 rounded-none" /> : null}
          <button
            type="button"
            className="absolute inset-0 z-10"
            onClick={() => void togglePlayback()}
            aria-label={playing ? `Pause ${item.fileName}` : `Play ${item.fileName}`}
          />
          <video
            ref={(element) => {
              mediaRef.current = element
            }}
            src={src}
            preload="metadata"
            aria-label={item.fileName}
            onPlay={() => {
              setPlaying(true)
              requestPlayback(playbackKey)
            }}
            onPause={() => {
              setPlaying(false)
              pausePlayback(playbackKey)
            }}
            onEnded={() => {
              setPlaying(false)
              pausePlayback(playbackKey)
            }}
            onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime)}
            onDurationChange={(event) =>
              setDuration(
                Number.isFinite(event.currentTarget.duration) ? event.currentTarget.duration : 0,
              )
            }
            onLoadedData={() => {
              setHasLoadedFrame(true)
              onStateChange?.({
                status: "ready",
              })
            }}
            onError={() => {
              const message = "This media could not be played."
              setError(message)
              onStateChange?.({
                status: "error",
                message,
              })
            }}
            className={cn(
              "h-full w-full object-contain transition-opacity duration-150",
              hasLoadedFrame ? "opacity-100" : "opacity-0",
            )}
            playsInline
            controls={false}
          />
        </div>
      ) : (
        <div className="flex min-h-28 items-center gap-3 bg-surface-raised-base/60 px-5 py-4">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-full border border-border-base bg-background-base text-text-base">
            <Music2Icon className="size-5" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-text-base">{item.fileName}</p>
            <p className="mt-1 text-xs text-text-weak">Audio</p>
          </div>
          <audio
            ref={(element) => {
              mediaRef.current = element
            }}
            src={src}
            preload="metadata"
            aria-label={item.fileName}
            onPlay={() => {
              setPlaying(true)
              requestPlayback(playbackKey)
            }}
            onPause={() => {
              setPlaying(false)
              pausePlayback(playbackKey)
            }}
            onEnded={() => {
              setPlaying(false)
              pausePlayback(playbackKey)
            }}
            onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime)}
            onDurationChange={(event) =>
              setDuration(
                Number.isFinite(event.currentTarget.duration) ? event.currentTarget.duration : 0,
              )
            }
            onLoadedMetadata={() =>
              onStateChange?.({
                status: "ready",
              })
            }
            onError={() => {
              const message = "This media could not be played."
              setError(message)
              onStateChange?.({
                status: "error",
                message,
              })
            }}
            controls={false}
          />
        </div>
      )}

      <div className="flex flex-col gap-2 border-t border-border-weaker-base px-3 py-2.5">
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={() => void togglePlayback()}
            aria-label={playing ? "Pause" : "Play"}
          >
            {playing ? <PauseIcon aria-hidden /> : <PlayIcon aria-hidden />}
          </Button>
          <span className="w-10 text-right text-[11px] tabular-nums text-text-weak">
            {formatMediaTime(currentTime)}
          </span>
          <Slider
            value={[Math.min(currentTime, duration || 0)]}
            min={0}
            max={duration || 0}
            step={MEDIA_TIME_STEP_SECONDS}
            onValueChange={seek}
            disabled={duration <= 0}
            aria-label="Seek"
            className="min-w-0 flex-1"
          />
          <span className="w-10 text-[11px] tabular-nums text-text-weak">
            {formatMediaTime(duration)}
          </span>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={toggleMuted}
            aria-label={muted ? "Unmute" : "Mute"}
          >
            {muted ? <VolumeXIcon aria-hidden /> : <Volume2Icon aria-hidden />}
          </Button>
          <Slider
            value={[muted ? 0 : volume]}
            min={0}
            max={1}
            step={MEDIA_VOLUME_STEP}
            onValueChange={changeVolume}
            aria-label="Volume"
            className="hidden w-20 sm:flex"
          />
          {isVideo ? (
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={() => void enterFullscreen()}
              aria-label={onOpen ? "Open on Bench" : "Enter fullscreen"}
            >
              <Maximize2Icon aria-hidden />
            </Button>
          ) : null}
        </div>
        {error ? <p className="px-1 text-xs text-icon-critical-base">{error}</p> : null}
      </div>
    </MediaShell>
  )
}

export function PresentedMediaPlayer(props: {
  item: PresentMediaResolvedItem
  playbackKey: string
  fallback: ReactNode
  compact?: boolean
  shouldLoad?: boolean
  onOpen?: () => void
  onStateChange?: (state: PresentedMediaPlayerState) => void
}) {
  const { item, playbackKey, fallback, compact, onOpen, shouldLoad, onStateChange } = props
  const isLoaded = usePresentedMediaPlaybackStore((state) => state.loadedKeys.includes(playbackKey))
  const ensureLoaded = usePresentedMediaPlaybackStore((state) => state.ensureLoaded)
  const isVideo = item.mediaKind === "video"
  const canPreview =
    item.resolvedAvailability.status === "available" &&
    (isVideo ? isSafeInlineVideo(item.mimeType) : isSafeInlineAudio(item.mimeType))
  const rawUrl = item.rawUrl ? resolveAssetUrl(item.rawUrl) : undefined

  useEffect(() => {
    if (!canPreview || !rawUrl || !shouldLoad || isLoaded) return
    ensureLoaded(playbackKey)
  }, [canPreview, ensureLoaded, isLoaded, playbackKey, shouldLoad, rawUrl])

  useEffect(() => {
    if (!canPreview || !rawUrl) {
      onStateChange?.({
        status: "fallback",
      })
      return
    }
    if (!isLoaded) {
      onStateChange?.({
        status: shouldLoad ? "loading" : "deferred",
      })
    }
  }, [canPreview, isLoaded, onStateChange, shouldLoad, rawUrl])

  if (!canPreview || !rawUrl) return fallback

  if (!isLoaded) {
    return shouldLoad ? (
      <MediaLoadingState item={item} compact={compact} />
    ) : (
      <MediaPlaceholder
        item={item}
        compact={compact}
        onActivate={() => ensureLoaded(playbackKey)}
      />
    )
  }

  return (
    <BuddyMediaTransport
      key={rawUrl}
      item={item}
      playbackKey={playbackKey}
      src={rawUrl}
      onOpen={onOpen}
      onStateChange={onStateChange}
    />
  )
}
