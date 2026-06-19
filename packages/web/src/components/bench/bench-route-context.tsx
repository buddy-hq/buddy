import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react"
import { getBuddyClient, requireBuddyData } from "@/lib/buddy-client"
import {
  allowBenchLeave,
  registerBenchLeaveGuard,
  type BenchLeaveGuardInput,
  type BenchLeaveGuardResult,
} from "@/lib/bench-leave-guard"
import type {
  BenchLayoutProfileID,
  BenchMode,
  BenchRect,
  BenchTarget,
} from "@/lib/bench-navigation"
import type { BenchContextPublishData } from "@buddy/sdk/types"

type BenchReadContextOutput = BenchContextPublishData["body"]
type BenchReadContextOpenOutput = Extract<BenchReadContextOutput, { status: "open" }>

type BenchContextProvider = {
  read(): BenchReadContextOpenOutput | Promise<BenchReadContextOpenOutput>
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

type BenchSurfaceRegistration = {
  target: BenchTarget
  provider: BenchContextProvider
  leaveGuard?: (
    input: BenchLeaveGuardInput,
  ) => BenchLeaveGuardResult | Promise<BenchLeaveGuardResult>
}

type BenchRouteContextValue = {
  state: BenchRuntimeState
  setMode(input: BenchSetModeRequest): void
  setFloatingChatState(input: { state: BenchFloatingChatState; origin: "user" }): void
  registerSurface(input: {
    target: BenchTarget
    contextProvider: BenchContextProvider
    leaveGuard?: (
      input: BenchLeaveGuardInput,
    ) => BenchLeaveGuardResult | Promise<BenchLeaveGuardResult>
  }): () => void
  flushContext(input: { sessionID: string }): Promise<void>
  publishCurrent(): Promise<void>
}

type BenchPromptFlushRegistration = {
  directory: string
  flush(input: { sessionID: string }): Promise<void>
}

const BenchRouteContext = createContext<BenchRouteContextValue | undefined>(undefined)
const promptFlushRegistrations = new Map<string, BenchPromptFlushRegistration>()
const benchContextPublishQueues = new Map<string, Promise<void>>()

function registerBenchPromptContextFlush(input: BenchPromptFlushRegistration): () => void {
  promptFlushRegistrations.set(input.directory, input)
  return () => {
    if (promptFlushRegistrations.get(input.directory) === input) {
      promptFlushRegistrations.delete(input.directory)
    }
  }
}

async function flushBenchContextBeforePrompt(input: {
  directory: string
  sessionID: string
}): Promise<void> {
  const registration = promptFlushRegistrations.get(input.directory)
  if (!registration) {
    throw new Error("Bench context publisher is not registered for this directory.")
  }
  await registration.flush({ sessionID: input.sessionID })
}

async function publishBenchContext(input: {
  directory: string
  sessionID: string
  value: BenchReadContextOutput
}): Promise<void> {
  const queueKey = `${input.directory}\u0000${input.sessionID}`
  const currentQueue = benchContextPublishQueues.get(queueKey) ?? Promise.resolve()
  const nextPublish = currentQueue.then(
    async () => {
      requireBuddyData(
        await getBuddyClient(input.directory).bench.context.publish({
          sessionID: input.sessionID,
          body: input.value,
        }),
      )
    },
    async () => {
      requireBuddyData(
        await getBuddyClient(input.directory).bench.context.publish({
          sessionID: input.sessionID,
          body: input.value,
        }),
      )
    },
  )
  const nextQueue = nextPublish.then(
    () => undefined,
    () => undefined,
  )
  benchContextPublishQueues.set(queueKey, nextQueue)

  try {
    await nextPublish
  } finally {
    if (benchContextPublishQueues.get(queueKey) === nextQueue) {
      benchContextPublishQueues.delete(queueKey)
    }
  }
}

export function BenchRouteContextProvider(props: {
  state: BenchRuntimeState
  visible: boolean
  activeSessionID: string | undefined
  fallbackProvider: BenchContextProvider
  setMode(input: BenchSetModeRequest): void
  setFloatingChatState(input: { state: BenchFloatingChatState; origin: "user" }): void
  children: ReactNode
}) {
  const [registration, setRegistration] = useState<BenchSurfaceRegistration | undefined>(undefined)
  const registrationRef = useRef(registration)
  const fallbackProviderRef = useRef(props.fallbackProvider)
  const activeSessionIDRef = useRef(props.activeSessionID)
  const visibleRef = useRef(props.visible)

  registrationRef.current = registration
  fallbackProviderRef.current = props.fallbackProvider
  activeSessionIDRef.current = props.activeSessionID
  visibleRef.current = props.visible

  const publishValue = useCallback(
    async (input: { sessionID: string; value: BenchReadContextOutput }) =>
      publishBenchContext({
        directory: props.state.directory,
        sessionID: input.sessionID,
        value: input.value,
      }),
    [props.state.directory],
  )

  const flushContext = useCallback(
    async (input: { sessionID: string }) => {
      if (!visibleRef.current) {
        await publishValue({
          sessionID: input.sessionID,
          value: { status: "closed" },
        })
        return
      }

      const provider = registrationRef.current?.provider ?? fallbackProviderRef.current
      const value = await provider.read()
      await publishValue({
        sessionID: input.sessionID,
        value,
      })
    },
    [publishValue],
  )

  const publishCurrent = useCallback(async () => {
    const sessionID = activeSessionIDRef.current
    if (!sessionID) return
    await flushContext({ sessionID })
  }, [flushContext])

  const registerSurface = useCallback(
    (input: {
      target: BenchTarget
      contextProvider: BenchContextProvider
      leaveGuard?: (
        input: BenchLeaveGuardInput,
      ) => BenchLeaveGuardResult | Promise<BenchLeaveGuardResult>
    }) => {
      const nextRegistration = {
        target: input.target,
        provider: input.contextProvider,
        ...(input.leaveGuard ? { leaveGuard: input.leaveGuard } : {}),
      } satisfies BenchSurfaceRegistration
      setRegistration(nextRegistration)
      return () => {
        setRegistration((current) => (current === nextRegistration ? undefined : current))
      }
    },
    [],
  )

  useEffect(() => {
    return registerBenchPromptContextFlush({
      directory: props.state.directory,
      flush: flushContext,
    })
  }, [flushContext, props.state.directory])

  useEffect(() => {
    return registerBenchLeaveGuard({
      directory: props.state.directory,
      guard: async (input) => registrationRef.current?.leaveGuard?.(input) ?? allowBenchLeave(),
    })
  }, [props.state.directory])

  useEffect(() => {
    if (!props.activeSessionID) return
    void flushContext({ sessionID: props.activeSessionID })
  }, [flushContext, props.activeSessionID, props.fallbackProvider, props.visible, registration])

  useEffect(() => {
    return () => {
      const sessionID = activeSessionIDRef.current
      if (!sessionID) return
      void publishValue({
        sessionID,
        value: { status: "closed" },
      })
    }
  }, [publishValue])

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
  directory: string
  activeSessionID: string | undefined
}) {
  const publishClosed = useCallback(
    async (sessionID: string) =>
      publishBenchContext({
        directory: props.directory,
        sessionID,
        value: { status: "closed" },
      }),
    [props.directory],
  )

  useEffect(() => {
    return registerBenchPromptContextFlush({
      directory: props.directory,
      flush: async (input) => {
        await publishClosed(input.sessionID)
      },
    })
  }, [props.directory, publishClosed])

  useEffect(() => {
    if (!props.activeSessionID) return
    void publishClosed(props.activeSessionID)
  }, [props.activeSessionID, publishClosed])

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
  providerRef.current = provider
  leaveGuardRef.current = leaveGuard

  const registeredProvider = useMemo<BenchContextProvider>(
    () => ({
      read: () => providerRef.current.read(),
    }),
    [],
  )
  const registeredLeaveGuard = useCallback(
    (input: BenchLeaveGuardInput) => leaveGuardRef.current?.(input) ?? allowBenchLeave(),
    [],
  )

  useEffect(() => {
    const unregister = registerSurface({
      target,
      contextProvider: registeredProvider,
      leaveGuard: registeredLeaveGuard,
    })
    return unregister
  }, [registerSurface, registeredLeaveGuard, registeredProvider, target])
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

export { flushBenchContextBeforePrompt }
