import { cn } from "@buddy/ui"
import { useEffect, useRef } from "react"
import { FileTypeIcon } from "@/components/files/file-type-icon"
import { useBenchSurfaceActive } from "@/components/bench/bench-surface-activity"
import { fileNameFromPath } from "@/lib/workspace-file-paths"

export type BenchMediaRenderMode = "image" | "audio" | "video" | "pdf" | "file"

type BenchMediaPreviewProps = {
  title: string
  src?: string
  renderMode: BenchMediaRenderMode
  displayPath?: string
}

type BenchMediaMessageProps = {
  title?: string
  children: string
  className?: string
}

const CENTERED_MEDIA_FRAME_CLASS = "flex h-full min-h-0 w-full items-center justify-center p-6"

export function BenchMediaMessage(props: BenchMediaMessageProps) {
  return (
    <div
      className={cn(
        CENTERED_MEDIA_FRAME_CLASS,
        "text-center text-sm text-text-weak",
        props.className,
      )}
    >
      <div className="max-w-md">
        {props.title ? <div className="mb-1 font-medium text-text-base">{props.title}</div> : null}
        <div>{props.children}</div>
      </div>
    </div>
  )
}

export function BenchMediaPreview(props: BenchMediaPreviewProps) {
  if (!props.src && props.renderMode !== "file") {
    return <BenchMediaMessage>Preview URL is unavailable.</BenchMediaMessage>
  }

  if (props.renderMode === "image" && props.src) {
    return (
      <div data-component="bench-media-image" className={CENTERED_MEDIA_FRAME_CLASS}>
        <img
          src={props.src}
          alt={props.title}
          className="block max-h-full max-w-full select-none object-contain"
          draggable={false}
        />
      </div>
    )
  }

  if (props.renderMode === "video" && props.src) {
    return (
      <div data-component="bench-media-video" className={CENTERED_MEDIA_FRAME_CLASS}>
        <ParkAwareVideo src={props.src} />
      </div>
    )
  }

  if (props.renderMode === "audio" && props.src) {
    return (
      <div
        data-component="bench-media-audio"
        className="flex h-full min-h-0 w-full flex-col items-center justify-center gap-4 p-6"
      >
        <FileTypeIcon fileName={props.title} className="size-10" />
        <ParkAwareAudio src={props.src} />
      </div>
    )
  }

  if (props.renderMode === "pdf" && props.src) {
    return (
      <iframe
        title={props.title}
        src={props.src}
        sandbox="allow-scripts"
        className="block h-full w-full border-0 bg-background-base"
      />
    )
  }

  return (
    <div
      data-component="bench-media-file"
      className="flex h-full min-h-0 w-full flex-col items-center justify-center gap-3 p-6 text-center text-sm text-text-weak"
    >
      <FileTypeIcon fileName={props.title} className="size-10" />
      <span className="font-medium text-text-base">{fileNameFromPath(props.title)}</span>
      {props.displayPath ? <span>{props.displayPath}</span> : null}
    </div>
  )
}

/**
 * Media elements keep playing while their surface is parked, so a chat the user left could still be
 * producing sound. Playback is paused on park and deliberately not resumed on return: resuming is
 * the user's decision, and the element keeps its position, buffer, and volume either way.
 */
function useParkAwarePlayback<T extends HTMLMediaElement>() {
  const elementRef = useRef<T | null>(null)
  const active = useBenchSurfaceActive()

  useEffect(() => {
    if (active) return
    elementRef.current?.pause()
  }, [active])

  return elementRef
}

function ParkAwareVideo(props: { src: string }) {
  const videoRef = useParkAwarePlayback<HTMLVideoElement>()

  return (
    <video
      ref={videoRef}
      src={props.src}
      controls
      className="block max-h-full max-w-full bg-black"
    />
  )
}

function ParkAwareAudio(props: { src: string }) {
  const audioRef = useParkAwarePlayback<HTMLAudioElement>()

  return <audio ref={audioRef} src={props.src} controls className="w-full max-w-xl" />
}
