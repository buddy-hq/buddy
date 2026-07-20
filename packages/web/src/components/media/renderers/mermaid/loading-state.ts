import { MERMAID_MEDIA_LOADING_VARIANT } from "../../loading/types"
import type { MediaState, MermaidMediaData } from "../../types"

export function createMermaidLoadingState(data?: MermaidMediaData): MediaState<MermaidMediaData> {
  if (!data) {
    return {
      status: "loading",
      variant: MERMAID_MEDIA_LOADING_VARIANT,
    }
  }

  return {
    status: "loading",
    data,
    variant: MERMAID_MEDIA_LOADING_VARIANT,
  }
}
