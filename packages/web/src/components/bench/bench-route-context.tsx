import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  type ReactNode,
} from "react"
import {
  allowBenchLeave,
  type BenchLeaveGuardInput,
  type BenchLeaveGuardResult,
} from "@/lib/bench-leave-guard"
import { useDirectoryWorkspace } from "@/components/directory-chat/directory-workspace-context"
import {
  buildBenchSurfaceContextSnapshot,
  type BenchSurfaceContextEnrichment,
} from "@/components/bench/bench-context-utils"
import type {
  BenchLayoutProfileID,
  BenchMode,
  BenchRect,
  BenchTarget,
} from "@/lib/bench-navigation"
import { benchTargetKey } from "@/lib/bench-navigation"
import type {
  BenchReadContextOpenOutput,
  BenchReadContextOutput,
  BenchReadSurfaceContextOpenOutput,
  BenchSurfaceSnapshot,
  BenchSurfaceSynchronizationReason,
  BenchSurfaceSynchronizationResult,
} from "@/lib/directory-workspace-lifecycle"

type BenchContextProvider = {
  read(input: {
    target: BenchTarget
    directory: string
    route: string
  }): BenchSurfaceContextEnrichment
}

type BenchContextProviderRegistration = {
  target: BenchTarget
  provider: BenchContextProvider
  semanticKey?: string
  synchronize?: (
    reason: BenchSurfaceSynchronizationReason,
  ) => Promise<BenchSurfaceSynchronizationResult>
  leaveGuard?: (
    input: BenchLeaveGuardInput,
  ) => BenchLeaveGuardResult | Promise<BenchLeaveGuardResult>
}

type BenchFallbackContextProvider = {
  read(): BenchReadSurfaceContextOpenOutput
}

type BenchSetModeRequest = {
  mode: BenchMode
  origin: "user" | "agent"
}

type BenchFloatingChatState = "open" | "minimized"

type BenchRuntimeState = {
  directory: string
  target: BenchTarget
  route: string
  mode: BenchMode
  layoutProfile: BenchLayoutProfileID
  dockedChatWidthPx: number
  floatingRect: BenchRect
  floatingChatState: BenchFloatingChatState
}

type BenchRouteContextValue = {
  state: BenchRuntimeState
  setMode(input: BenchSetModeRequest): void
  setFloatingChatState(input: { state: BenchFloatingChatState; origin: "user" }): void
  registerSurface(input: {
    target: BenchTarget
    getSnapshot: () => BenchSurfaceSnapshot
    subscribe: (listener: () => void) => () => void
    synchronize?: (
      reason: BenchSurfaceSynchronizationReason,
    ) => Promise<BenchSurfaceSynchronizationResult>
    leaveGuard?: (
      input: BenchLeaveGuardInput,
    ) => BenchLeaveGuardResult | Promise<BenchLeaveGuardResult>
  }): () => void
  flushContext(input: { sessionID: string }): Promise<void>
  publishCurrent(): Promise<void>
}

const BenchRouteContext = createContext<BenchRouteContextValue | undefined>(undefined)

export function BenchRouteContextProvider(props: {
  state: BenchRuntimeState
  visible: boolean
  activeSessionID: string | undefined
  fallbackProvider: BenchFallbackContextProvider
  setMode(input: BenchSetModeRequest): void
  setFloatingChatState(input: { state: BenchFloatingChatState; origin: "user" }): void
  children: ReactNode
}) {
  const workspace = useDirectoryWorkspace()

  const flushContext = useCallback(
    (input: { sessionID: string }) => workspace.lifecycle.flushContextBeforePrompt(input),
    [workspace.lifecycle],
  )

  const publishCurrent = useCallback(async () => {
    await workspace.lifecycle.publishCurrent()
  }, [workspace.lifecycle])

  const registerSurface = useCallback(
    (input: {
      target: BenchTarget
      getSnapshot: () => BenchSurfaceSnapshot
      subscribe: (listener: () => void) => () => void
      synchronize?: (
        reason: BenchSurfaceSynchronizationReason,
      ) => Promise<BenchSurfaceSynchronizationResult>
      leaveGuard?: (
        input: BenchLeaveGuardInput,
      ) => BenchLeaveGuardResult | Promise<BenchLeaveGuardResult>
    }) =>
      workspace.lifecycle.registerSurface({
        target: input.target,
        getSnapshot: input.getSnapshot,
        subscribe: input.subscribe,
        ...(input.synchronize ? { synchronize: input.synchronize } : {}),
        ...(input.leaveGuard ? { guardLeave: input.leaveGuard } : {}),
      }),
    [workspace.lifecycle],
  )

  useEffect(() => {
    return workspace.lifecycle.setFallbackProvider(() => props.fallbackProvider.read())
  }, [props.fallbackProvider, workspace.lifecycle])

  useEffect(() => {
    void workspace.lifecycle.setActiveSessionID(props.activeSessionID)
  }, [props.activeSessionID, workspace.lifecycle])

  useEffect(() => {
    void workspace.lifecycle.publishCurrent()
  }, [props.fallbackProvider, props.state, props.visible, workspace.lifecycle])

  const value = useMemo(
    () => ({
      state: props.state,
      setMode: props.setMode,
      setFloatingChatState: props.setFloatingChatState,
      registerSurface,
      flushContext,
      publishCurrent,
    }),
    [
      flushContext,
      props.setFloatingChatState,
      props.setMode,
      props.state,
      publishCurrent,
      registerSurface,
    ],
  )

  return <BenchRouteContext.Provider value={value}>{props.children}</BenchRouteContext.Provider>
}

export function BenchClosedContextPublisher(props: { activeSessionID: string | undefined }) {
  const workspace = useDirectoryWorkspace()

  useEffect(() => {
    void workspace.lifecycle.setActiveSessionID(props.activeSessionID)
  }, [props.activeSessionID, workspace.lifecycle])

  return null
}

export function useBenchRouteContext() {
  const value = useContext(BenchRouteContext)
  if (!value) {
    throw new Error("BenchRouteContext is not available")
  }
  return value
}

export function useRegisterBenchContextProvider(input: BenchContextProviderRegistration): void {
  const benchContext = useBenchRouteContext()
  const registerSurface = benchContext.registerSurface
  const targetKey = benchTargetKey(input.target)
  const routeTargetKey = benchTargetKey(benchContext.state.target)
  const targetBindingRef = useRef({ targetKey, target: input.target })
  if (targetBindingRef.current.targetKey !== targetKey) {
    targetBindingRef.current = { targetKey, target: input.target }
  }
  const target = targetBindingRef.current.target
  const providerRef = useRef(input.provider)
  const synchronizeRef = useRef(input.synchronize)
  const leaveGuardRef = useRef(input.leaveGuard)
  const semanticRevisionRef = useRef(0)
  const listenersRef = useRef(new Set<() => void>())
  providerRef.current = input.provider
  synchronizeRef.current = input.synchronize
  leaveGuardRef.current = input.leaveGuard

  useEffect(() => {
    semanticRevisionRef.current += 1
    for (const listener of listenersRef.current) {
      listener()
    }
  }, [input.provider, input.semanticKey])

  const getSnapshot = useCallback(
    () =>
      buildBenchSurfaceContextSnapshot({
        target,
        directory: benchContext.state.directory,
        route: benchContext.state.route,
        semanticRevision: semanticRevisionRef.current,
        enrichment: providerRef.current.read({
          target,
          directory: benchContext.state.directory,
          route: benchContext.state.route,
        }),
      }),
    [benchContext.state.directory, benchContext.state.route, target],
  )
  const subscribe = useCallback((listener: () => void) => {
    listenersRef.current.add(listener)
    return () => {
      listenersRef.current.delete(listener)
    }
  }, [])
  const registeredLeaveGuard = useCallback(
    (input: BenchLeaveGuardInput) => leaveGuardRef.current?.(input) ?? allowBenchLeave(),
    [],
  )
  const registeredSynchronize = useCallback(
    async (
      reason: BenchSurfaceSynchronizationReason,
    ): Promise<BenchSurfaceSynchronizationResult> => {
      const synchronize = synchronizeRef.current
      if (!synchronize) return { changed: false }
      const result = await synchronize(reason)
      if (result.changed) {
        semanticRevisionRef.current += 1
        for (const listener of listenersRef.current) {
          listener()
        }
      }
      return result
    },
    [],
  )

  useEffect(() => {
    if (targetKey !== routeTargetKey) return
    const unregister = registerSurface({
      target,
      getSnapshot,
      subscribe,
      synchronize: input.synchronize ? registeredSynchronize : undefined,
      leaveGuard: registeredLeaveGuard,
    })
    return unregister
  }, [
    getSnapshot,
    input.synchronize,
    registerSurface,
    registeredLeaveGuard,
    registeredSynchronize,
    routeTargetKey,
    subscribe,
    target,
    targetKey,
  ])
}

export type {
  BenchContextProvider,
  BenchContextProviderRegistration,
  BenchFallbackContextProvider,
  BenchFloatingChatState,
  BenchReadContextOpenOutput,
  BenchReadContextOutput,
  BenchRouteContextValue,
  BenchRuntimeState,
  BenchSetModeRequest,
  BenchSurfaceSynchronizationReason,
  BenchSurfaceSynchronizationResult,
  BenchLeaveGuardInput,
  BenchLeaveGuardResult,
}
