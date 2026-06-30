import { cn } from "@buddy/ui";
import { useKeyedMediaState } from "../use-keyed-media-state";
import { VisualMediaFrame } from "../visual-media-frame";
import {
  mediaStateData,
  type HtmlMediaData,
  type HtmlMediaItem,
  type MediaAction,
  type MediaRendererProps,
  type MediaState,
} from "../types";
import {
  HtmlWidgetFrame,
  type HtmlWidgetFrameLoadState,
} from "./html-widget-frame";

function effectiveHtmlState(
  state: HtmlMediaItem["state"],
  loadState: HtmlWidgetFrameLoadState,
  actions?: MediaAction[],
): MediaState<HtmlMediaData> {
  if (state.status !== "ready") return state;
  if (loadState === "loading") {
    return {
      status: "loading",
      data: state.data,
    };
  }
  if (loadState === "error") {
    return {
      status: "error",
      data: state.data,
      message: "Widget failed to load",
      actions,
    };
  }
  return state;
}

export function HtmlMediaRenderer(props: MediaRendererProps<HtmlMediaItem>) {
  const data = mediaStateData(props.item.state);
  const loadKey = data
    ? JSON.stringify([data.widget.runtimeUrl, data.reloadKey])
    : undefined;
  const [loadState, setLoadState] =
    useKeyedMediaState<HtmlWidgetFrameLoadState>(loadKey, "loading");

  const state = effectiveHtmlState(props.item.state, loadState, props.actions);

  return (
    <VisualMediaFrame
      state={state}
      actions={props.actions}
      fit={props.fit}
      className={cn("min-h-0", props.className)}
    >
      {data ? (
        <HtmlWidgetFrame
          widget={data.widget}
          mode="inline"
          reloadKey={data.reloadKey}
          showStateOverlay={false}
          onLoadStateChange={setLoadState}
        />
      ) : null}
    </VisualMediaFrame>
  );
}
