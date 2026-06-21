import { useMemo, type ReactNode } from "react"
import { useBenchRouteContext, useRegisterBenchContextProvider } from "./bench-route-context"
import type { BenchReadContextOpenOutput } from "./bench-route-context"

type BenchContextStatus = BenchReadContextOpenOutput["target"]["status"]

type BenchStaticContextProviderProps = {
  title?: string
  status: BenchContextStatus
  metadata: string[]
  content: string
  refs?: BenchReadContextOpenOutput["refs"]
  hints?: string[]
  children: ReactNode
}

export function BenchStaticContextProvider(props: BenchStaticContextProviderProps) {
  const benchContext = useBenchRouteContext()
  const contextProvider = useMemo(
    () => ({
      read: () => ({
        targetStatus: props.status,
        ...(props.title ? { title: props.title } : {}),
        metadata: props.metadata,
        content: props.content,
        ...(props.refs ? { refs: props.refs } : {}),
        hints: props.hints ?? [],
      }),
    }),
    [props.content, props.hints, props.metadata, props.refs, props.status, props.title],
  )
  useRegisterBenchContextProvider({
    target: benchContext.state.target,
    provider: contextProvider,
  })

  return <>{props.children}</>
}
