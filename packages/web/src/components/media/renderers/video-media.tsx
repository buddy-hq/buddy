import { cn } from "@buddy/ui";
import { MediaActions } from "../media-action-bar";
import { VisualMediaFrame } from "../visual-media-frame";
import { VisualMediaState } from "../visual-media-state";
import {
  mediaStateData,
  type MediaRendererProps,
  type VideoMediaItem,
} from "../types";
import { FileMediaRenderer } from "./file-media";
import { useKeyedMediaState } from "../use-keyed-media-state";
import {
  PresentedMediaPlayer,
  type PresentedMediaPlayerState,
} from "./presented-media-player";
import { effectivePresentedPlaybackState } from "./presented-playback-state";

export function VideoMediaRenderer(props: MediaRendererProps<VideoMediaItem>) {
  const data = mediaStateData(props.item.state);
  const playerKey = data
    ? JSON.stringify([data.playbackKey, data.item.rawUrl, data.shouldLoad])
    : undefined;
  const [playerState, setPlayerState] =
    useKeyedMediaState<PresentedMediaPlayerState>(playerKey, {
      status: data?.shouldLoad ? "loading" : "deferred",
    });

  if (props.item.state.status !== "ready" || !data) {
    return (
      <VisualMediaFrame
        state={props.item.state}
        actions={props.actions}
        actionPosition="top"
        className={cn("aspect-video min-h-56", props.className)}
      >
        {null}
      </VisualMediaFrame>
    );
  }

  const state = effectivePresentedPlaybackState(props.item.state, playerState);

  return (
    <div
      className={cn(
        "relative w-full overflow-hidden rounded-xl",
        props.className,
      )}
    >
      <PresentedMediaPlayer
        item={data.item}
        playbackKey={data.playbackKey}
        compact={data.compact}
        shouldLoad={data.shouldLoad}
        onOpen={props.onOpen ?? data.onOpen}
        onStateChange={setPlayerState}
        fallback={
          <FileMediaRenderer
            item={data.fallback.item}
            actions={data.fallback.actions}
            onOpen={data.fallback.onOpen}
          />
        }
      />
      <VisualMediaState state={state} />
      {state.status === "ready" && props.actions && props.actions.length > 0 ? (
        <div className="absolute right-3 top-3 z-30">
          <MediaActions actions={props.actions} />
        </div>
      ) : null}
    </div>
  );
}
