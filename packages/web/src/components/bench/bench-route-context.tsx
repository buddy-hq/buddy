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
import type {
  BenchLayoutProfileID,
  BenchMode,
  BenchRect,
  BenchTarget,
} from "@/lib/bench-navigation"
import type {
  BenchReadContextOpenOutput,
  BenchReadContextOutput,
  BenchReadSurfaceContextOpenOutput,
  BenchSurfaceSnapshot,
} from "@/lib/directory-workspace-lifecycle"

type BenchContextProvider = {
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
  fallbackProvider: BenchContextProvider
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
      leaveGuard?: (
        input: BenchLeaveGuardInput,
      ) => BenchLeaveGuardResult | Promise<BenchLeaveGuardResult>
    }) =>
      workspace.lifecycle.registerSurface({
        target: input.target,
        getSnapshot: input.getSnapshot,
        subscribe: input.subscribe,
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
  }, [
    props.fallbackProvider,
    props.state,
    props.visible,
    workspace.lifecycle,
  ])

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

export function BenchClosedContextPublisher(props: {
  activeSessionID: string | undefined
}) {
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

export function useRegisterBenchContextProvider(
  provider: BenchContextProvider,
  leaveGuard?: (
    input: BenchLeaveGuardInput,
  ) => BenchLeaveGuardResult | Promise<BenchLeaveGuardResult>,
): void {
  const benchContext = useBenchRouteContext()
  const registerSurface = benchContext.registerSurface
  const target = benchContext.state.target
  const providerRef = useRef(provider)
  const leaveGuardRef = useRef(leaveGuard)
  const semanticRevisionRef = useRef(0)
  const listenersRef = useRef(new Set<() => void>())
  providerRef.current = provider
  leaveGuardRef.current = leaveGuard

  useEffect(() => {
    semanticRevisionRef.current += 1
    for (const listener of listenersRef.current) {
      listener()
    }
  }, [provider])

  const getSnapshot = useCallback(
    () => ({
      semanticRevision: semanticRevisionRef.current,
      context: providerRef.current.read(),
    }),
    [],
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

  useEffect(() => {
    const unregister = registerSurface({
      target,
      getSnapshot,
      subscribe,
      leaveGuard: registeredLeaveGuard,
    })
    return unregister
  }, [getSnapshot, registerSurface, registeredLeaveGuard, subscribe, target])
}

export type {
  BenchContextProvider,
  BenchFloatingChatState,
  BenchReadContextOpenOutput,
  BenchReadContextOutput,
  BenchRouteContextValue,
  BenchRuntimeState,
  BenchSetModeRequest,
  BenchLeaveGuardInput,
  BenchLeaveGuardResult,
}
