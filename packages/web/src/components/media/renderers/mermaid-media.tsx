import { useMemo } from "react";
import { cn } from "@buddy/ui";
import { ClipboardCopyIcon, WrenchIcon } from "lucide-react";
import {
  MermaidDiagram,
  type MermaidDiagramRenderState,
} from "@/components/media/renderers/mermaid/mermaid-diagram";
import { MediaGridSurface } from "../media-grid-surface";
import { useKeyedMediaState } from "../use-keyed-media-state";
import { VisualMediaFrame } from "../visual-media-frame";
import {
  mediaStateData,
  type MediaAction,
  type MediaRendererProps,
  type MediaState,
  type MermaidMediaData,
  type MermaidMediaItem,
} from "../types";

function summarizeError(message: string): string {
  const singleLine = message.trim().replace(/\s+/gu, " ");
  if (!singleLine) return "Unable to render diagram";
  if (singleLine.length <= 240) return singleLine;
  return `${singleLine.slice(0, 237)}...`;
}

function effectiveMermaidState(
  state: MermaidMediaItem["state"],
  renderState: MermaidDiagramRenderState,
  actions: MediaAction[],
): MediaState<MermaidMediaData> {
  if (state.status !== "ready") return state;
  if (renderState.status === "loading") {
    return {
      status: "loading",
      data: state.data,
    };
  }
  if (renderState.status === "error") {
    return {
      status: "error",
      data: state.data,
      message: "Unable to render diagram",
      detail: state.data.errorDetail ?? summarizeError(renderState.message),
      actions,
    };
  }
  return state;
}

export function MermaidMediaRenderer(
  props: MediaRendererProps<MermaidMediaItem>,
) {
  const data = mediaStateData(props.item.state);
  const [renderState, setRenderState] =
    useKeyedMediaState<MermaidDiagramRenderState>(data?.source, {
      status: "loading",
    });

  const errorActions = useMemo<MediaAction[]>(() => {
    if (renderState.status !== "error" || !data) return [];
    return [
      ...(data.onRequestFix
        ? [
            {
              id: "request-fix",
              label: "Request fix",
              icon: WrenchIcon,
              disabled: data.fixDisabled,
              onSelect: () => data.onRequestFix?.(renderState.message),
            } satisfies MediaAction,
          ]
        : []),
      {
        id: "copy-error",
        label: "Copy error",
        icon: ClipboardCopyIcon,
        onSelect: () => {
          if (!("clipboard" in navigator)) return;
          void navigator.clipboard.writeText(
            `${renderState.message}\n\n${data.source}`,
          );
        },
      },
    ];
  }, [data, renderState]);

  const state = effectiveMermaidState(
    props.item.state,
    renderState,
    errorActions,
  );

  return (
    <VisualMediaFrame
      state={state}
      actions={props.actions}
      className={cn("min-h-56", props.className)}
    >
      {data ? (
        <MermaidDiagram
          source={data.source}
          alt={data.alt}
          directory={data.directory}
          objectID={data.objectID}
          revisionID={data.revisionID}
          renderPriority={data.renderPriority}
          hideLoadingPlaceholder
          className="h-full p-4"
          onFullscreenOpen={data.onFullscreenOpen}
          onRenderFailure={data.onRenderFailure}
          showStatePresentation={false}
          onRenderStateChange={setRenderState}
          renderWrapper={(diagram, actions) => (
            <MediaGridSurface>
              <div className="size-full">{diagram}</div>
              {actions ? (
                <div className="absolute right-3 bottom-3 z-30">{actions}</div>
              ) : null}
            </MediaGridSurface>
          )}
        />
      ) : null}
    </VisualMediaFrame>
  );
}
