import type { AgentRuntime } from "@buddy/agent-runtime/runtime"
import { openCodeV1ImportReport } from "@buddy/opencode-adapter/host"
import { startOpenCodeRuntime } from "@buddy/opencode-adapter/runtime"
import {
  cleanupBenchCapturesForSession,
  initializeBenchCaptureStorage,
} from "../learning/features/bench/captures"
import { getBuddyToolPresentationDescriptor } from "./buddy-tool-presentation-catalog"
import { openCodeRuntimeEnvironment } from "./runtime-paths"
import {
  reportRuntimeUpgrade,
  runtimeUpgradeSeedPauseMs,
  type RuntimeV1ImportReport,
} from "./runtime-upgrade"

let runtimePromise:
  | Promise<{ readonly runtime: AgentRuntime; readonly close: () => Promise<void> }>
  | undefined
let closingPromise: Promise<void> | undefined
let shuttingDown = false

export function subscribeBenchCaptureCleanup(
  runtime: Pick<AgentRuntime, "events">,
): () => Promise<void> {
  const controller = new AbortController()
  const cleanups = new Set<Promise<void>>()
  const events = (async () => {
    for await (const event of runtime.events.signals({ signal: controller.signal })) {
      if (event.type !== "turn.finished") continue
      const cleanup = cleanupBenchCapturesForSession(event.sessionID).finally(() =>
        cleanups.delete(cleanup),
      )
      cleanups.add(cleanup)
    }
  })().catch((cause) => {
    if (!controller.signal.aborted)
      console.error("Buddy execution cleanup subscription failed", cause)
  })
  return async () => {
    controller.abort()
    await events
    await Promise.all(cleanups)
  }
}

async function createRuntime() {
  const [{ createBuddyRuntimeExtension }, { readOpenCodeHostConfig }] = await Promise.all([
    import("./buddy-extension"),
    import("../config/runtime/notebook-runtime-plan"),
  ])
  const started = await startOpenCodeRuntime({
    environment: openCodeRuntimeEnvironment(),
    extension: createBuddyRuntimeExtension(),
    initializeStorage: initializeBenchCaptureStorage,
    hostConfig: readOpenCodeHostConfig,
    presentation: (directory) => (toolID) => getBuddyToolPresentationDescriptor(directory, toolID),
    upgrade: { report: reportRuntimeUpgrade, seedPauseMs: runtimeUpgradeSeedPauseMs() },
  })
  const unsubscribe = subscribeBenchCaptureCleanup(started.runtime)
  return {
    runtime: started.runtime,
    async close() {
      await unsubscribe()
      await started.close()
    },
  }
}

export function agentRuntimeV1ImportReport(): RuntimeV1ImportReport | undefined {
  return openCodeV1ImportReport()
}

export function getAgentRuntime(): Promise<AgentRuntime> {
  if (shuttingDown) return Promise.reject(new Error("Buddy agent runtime is shutting down"))
  if (closingPromise) return closingPromise.then(getAgentRuntime)
  runtimePromise ??= createRuntime().catch((cause) => {
    runtimePromise = undefined
    throw cause
  })
  return runtimePromise.then((current) => {
    if (shuttingDown) throw new Error("Buddy agent runtime is shutting down")
    return current.runtime
  })
}

export function closeAgentRuntime(): Promise<void> {
  if (closingPromise) return closingPromise
  const current = runtimePromise
  closingPromise = (async () => {
    const started = await current?.catch(() => undefined)
    await started?.close()
  })().finally(() => {
    if (runtimePromise === current) runtimePromise = undefined
    closingPromise = undefined
  })
  return closingPromise
}

export function shutdownAgentRuntime(): Promise<void> {
  shuttingDown = true
  return closeAgentRuntime()
}
