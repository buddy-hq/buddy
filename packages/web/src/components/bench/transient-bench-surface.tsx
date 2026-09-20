import {
  createContext,
  useContext,
  type Dispatch,
  type ReactNode,
  type Ref,
  type SetStateAction,
} from "react"
import { cn } from "@buddy/ui"
import {
  BENCH_CHAT_LAYOUT_DOCKED,
  BENCH_CHAT_LAYOUT_FLOATING,
  type BenchChatLayoutMode,
} from "@/lib/bench-navigation"

const TRANSIENT_BENCH_SURFACE_SKETCH = "sketch" as const
const TRANSIENT_BENCH_SURFACE_WHITEBOARD_OPENING = "whiteboard-opening" as const

type WhiteboardOpeningTransientBenchSurface = {
  type: typeof TRANSIENT_BENCH_SURFACE_WHITEBOARD_OPENING
  toolKey: string
}

type TransientBenchSurface =
  | typeof TRANSIENT_BENCH_SURFACE_SKETCH
  | WhiteboardOpeningTransientBenchSurface

type TransientBenchSurfaceContextValue = {
  activeSurface: TransientBenchSurface | null
  host: HTMLDivElement | null
  open: (surface: TransientBenchSurface) => void
  close: (surface: TransientBenchSurface) => void
}

type TransientBenchSurfaceProviderProps = {
  children: ReactNode
  value: TransientBenchSurfaceContextValue
}

const TransientBenchSurfaceContext = createContext<TransientBenchSurfaceContextValue | undefined>(
  undefined,
)

function TransientBenchSurfaceProvider(props: TransientBenchSurfaceProviderProps) {
  return (
    <TransientBenchSurfaceContext.Provider value={props.value}>
      {props.children}
    </TransientBenchSurfaceContext.Provider>
  )
}

/**
 * Covers the persistent Bench with transient content without unmounting either surface host.
 *
 * Browser guests, readers, editors, and other stateful Bench surfaces must survive a transient
 * whiteboard preview. The persistent layer is parked and made noninteractive while covered; the
 * transient host remains a stable portal target across activation changes.
 */
function TransientBenchSurfaceStack(props: {
  active: boolean
  hostRef: Ref<HTMLDivElement>
  children: ReactNode
}) {
  return (
    <div
      data-component="transient-bench-surface-stack"
      className="relative h-full min-h-0 w-full min-w-0"
    >
      <div
        data-component="persistent-bench-surface-layer"
        data-covered={props.active ? "true" : "false"}
        {...(props.active ? { inert: "" } : {})}
        className={cn("h-full min-h-0 w-full min-w-0", props.active && "pointer-events-none")}
      >
        {props.children}
      </div>
      <div
        ref={props.hostRef}
        data-component="transient-bench-surface-host"
        data-active={props.active ? "true" : "false"}
        aria-hidden={props.active ? undefined : true}
        {...(props.active ? {} : { inert: "" })}
        className={cn(
          "absolute inset-0 z-10 h-full min-h-0 w-full min-w-0 bg-background-base",
          !props.active && "hidden",
        )}
      />
    </div>
  )
}

function useTransientBenchSurface() {
  return useContext(TransientBenchSurfaceContext)
}

function resolveTransientBenchSurfaceLayoutMode(
  surface: TransientBenchSurface | null,
): BenchChatLayoutMode | null {
  if (surface === null) return null
  if (surface === TRANSIENT_BENCH_SURFACE_SKETCH) return BENCH_CHAT_LAYOUT_DOCKED
  return BENCH_CHAT_LAYOUT_FLOATING
}

function closeTransientBenchSurface(
  setActiveSurface: Dispatch<SetStateAction<TransientBenchSurface | null>>,
  surface: TransientBenchSurface,
) {
  setActiveSurface((current) => (current === surface ? null : current))
}

export {
  TRANSIENT_BENCH_SURFACE_SKETCH,
  TRANSIENT_BENCH_SURFACE_WHITEBOARD_OPENING,
  TransientBenchSurfaceProvider,
  TransientBenchSurfaceStack,
  closeTransientBenchSurface,
  resolveTransientBenchSurfaceLayoutMode,
  useTransientBenchSurface,
}
export type {
  TransientBenchSurface,
  TransientBenchSurfaceContextValue,
  WhiteboardOpeningTransientBenchSurface,
}
