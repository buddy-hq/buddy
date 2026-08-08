import {
  createContext,
  useContext,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react"

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

function useTransientBenchSurface() {
  return useContext(TransientBenchSurfaceContext)
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
  closeTransientBenchSurface,
  useTransientBenchSurface,
}
export type {
  TransientBenchSurface,
  TransientBenchSurfaceContextValue,
  WhiteboardOpeningTransientBenchSurface,
}
