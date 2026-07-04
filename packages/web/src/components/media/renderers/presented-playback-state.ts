import type { MediaState } from "../types"
import type { PresentedMediaPlayerState } from "./presented-media-player"

export function effectivePresentedPlaybackState<T>(
  state: MediaState<T>,
  playerState: PresentedMediaPlayerState,
): MediaState<T> {
  if (state.status !== "ready") return state
  if (playerState.status === "loading") {
    return {
      status: "loading",
      data: state.data,
    }
  }
  if (playerState.status === "error") {
    return {
      status: "error",
      data: state.data,
      message: "Preview failed to load",
      detail: playerState.message,
    }
  }
  return state
}
