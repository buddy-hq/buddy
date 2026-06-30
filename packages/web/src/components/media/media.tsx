import { AudioMediaRenderer } from "./renderers/audio-media"
import { FileMediaRenderer } from "./renderers/file-media"
import { HtmlMediaRenderer } from "./renderers/html-media"
import { ImageMediaRenderer } from "./renderers/image-media"
import { MermaidMediaRenderer } from "./renderers/mermaid-media"
import { VideoMediaRenderer } from "./renderers/video-media"
import type { MediaProps } from "./types"

export function Media(props: MediaProps) {
  const { item } = props

  if (item.kind === "image") {
    return <ImageMediaRenderer {...props} item={item} />
  }
  if (item.kind === "mermaid") {
    return <MermaidMediaRenderer {...props} item={item} />
  }
  if (item.kind === "video") {
    return <VideoMediaRenderer {...props} item={item} />
  }
  if (item.kind === "audio") {
    return <AudioMediaRenderer {...props} item={item} />
  }
  if (item.kind === "html") {
    return <HtmlMediaRenderer {...props} item={item} />
  }
  return <FileMediaRenderer {...props} item={item} />
}
