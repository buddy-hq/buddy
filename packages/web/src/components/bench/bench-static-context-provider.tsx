import { useLocation } from "@tanstack/react-router"
import { useMemo, type ReactNode } from "react"
import {
  benchContextRefsFromBenchTarget,
  benchContextTargetFromBenchTarget,
  routeString,
} from "./bench-context-utils"
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
  const location = useLocation()
  const benchContext = useBenchRouteContext()
  const contextProvider = useMemo(
    () => ({
      read: () => ({
        status: "open" as const,
        target: benchContextTargetFromBenchTarget({
          target: benchContext.state.target,
          directory: benchContext.state.directory,
          route: routeString({
            pathname: location.pathname,
            searchStr: location.searchStr,
          }),
          status: props.status,
          ...(props.title ? { title: props.title } : {}),
        }),
        metadata: props.metadata,
        content: props.content,
        refs: props.refs ?? benchContextRefsFromBenchTarget(benchContext.state.target),
        hints: props.hints ?? [],
      }),
    }),
    [
      benchContext.state.directory,
      benchContext.state.target,
      location.pathname,
      location.searchStr,
      props.content,
      props.hints,
      props.metadata,
      props.refs,
      props.status,
      props.title,
    ],
  )
  useRegisterBenchContextProvider(contextProvider)

  return <>{props.children}</>
}
