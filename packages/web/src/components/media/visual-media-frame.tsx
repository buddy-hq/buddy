import type { CSSProperties, ReactNode } from "react";
import { cn } from "@buddy/ui";
import { MediaActions } from "./media-action-bar";
import { VisualMediaState } from "./visual-media-state";
import type { MediaAction, MediaState } from "./types";

export function VisualMediaFrame<T>(props: {
  state: MediaState<T>;
  children: ReactNode;
  actions?: MediaAction[];
  chromeLabel?: ReactNode;
  actionPosition?: "bottom" | "top";
  className?: string;
  style?: CSSProperties;
  fit?: "content" | "fill";
}) {
  const readyActions =
    props.state.status === "ready" &&
    props.actions !== undefined &&
    props.actions.length > 0
      ? props.actions
      : undefined;
  const hasReadyActions = readyActions !== undefined;
  const hasReadyChromeLabel =
    props.state.status === "ready" &&
    props.chromeLabel !== undefined &&
    props.chromeLabel !== null &&
    props.chromeLabel !== false;
  const showBottomChrome =
    props.actionPosition !== "top" && (hasReadyActions || hasReadyChromeLabel);

  const fitContent = props.fit === "content";
  const fitClass = fitContent
    ? props.state.status === "ready"
      ? "w-fit max-w-full rounded-xl mx-auto"
      : "w-full rounded-xl"
    : "w-full rounded-xl border border-border-weaker-base bg-surface-base shadow-sm";

  return (
    <div
      data-status={props.state.status}
      className={cn(
        "relative flex min-w-0 items-center justify-center overflow-hidden",
        fitClass,
        props.className,
      )}
      style={props.style}
    >
      {props.children}
      <VisualMediaState state={props.state} />
      {props.actionPosition === "top" && hasReadyActions ? (
        <div className="absolute top-3 right-3 z-30">
          <MediaActions actions={readyActions} />
        </div>
      ) : null}
      {showBottomChrome ? (
        <div className="absolute inset-x-3 bottom-3 z-30 flex items-end justify-between gap-2 pointer-events-none">
          <div className="min-w-0 flex-1">
            {props.chromeLabel ? (
              <div className="inline-flex max-w-full rounded-full bg-background-base/72 px-2.5 py-1 text-[11px] font-medium text-text-weak shadow-sm backdrop-blur-md pointer-events-auto">
                <span className="truncate">{props.chromeLabel}</span>
              </div>
            ) : null}
          </div>
          {hasReadyActions ? (
            <div className="pointer-events-auto">
              <MediaActions actions={readyActions} minimal />
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
