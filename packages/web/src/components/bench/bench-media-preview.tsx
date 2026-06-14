import { cn } from "@buddy/ui"
import { FileTypeIcon } from "@/components/files/file-type-icon"
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

const CENTERED_MEDIA_FRAME_CLASS =
  "flex h-full min-h-0 w-full items-center justify-center p-6"

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
        <video src={props.src} controls className="block max-h-full max-w-full bg-black" />
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
        <audio src={props.src} controls className="w-full max-w-xl" />
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
