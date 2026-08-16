import { Instance as OpenCodeInstance } from "@buddy/opencode-adapter/instance"
import { Session as OpenCodeSession } from "@buddy/opencode-adapter/session"
import { readProjectConfig } from "../../../config/runtime"
import { internalLearnerMemorySession } from "./internal-session"
import { readLearnerMemorySettings } from "./settings"
import { extractLearnerMemoryFromSession } from "./session-extraction"
import type { SessionExtractionResult } from "./session-extraction"

const LEARNER_MEMORY_STARTUP_DISABLED_REASON = "learner_memory_startup_disabled"

type LearnerMemoryStartupResult = {
  scanned: number
  eligible: number
  attempted: number
  skippedReason?: string
  sessions: LearnerMemoryStartupSessionResult[]
}

type LearnerMemoryStartupSessionResult = {
  sessionID: string
  title?: string
  updatedAtMs: number
  extraction?: SessionExtractionResult
  error?: string
}

type LearnerMemoryStartupPlan = {
  scanned: number
  startupConcurrency: number
  eligible: OpenCodeSession.Info[]
  skippedReason?: string
}

type LearnerMemoryStartupObserver = {
  onPlan?: (plan: LearnerMemoryStartupPlan) => Promise<void> | void
  onSessionStart?: (session: LearnerMemoryStartupSessionResult) => Promise<void> | void
  onSessionComplete?: (session: LearnerMemoryStartupSessionResult) => Promise<void> | void
}

function eligibleSession(input: {
  session: OpenCodeSession.Info
  currentSessionID?: string
  now: number
  minIdleMs: number
  maxSessionAgeMs: number
}): boolean {
  if (input.currentSessionID && input.session.id === input.currentSessionID) return false
  if (
    internalLearnerMemorySession({
      sessionID: input.session.id,
      title: input.session.title,
      parentID: input.session.parentID,
    })
  ) {
    return false
  }
  if (input.session.time.archived !== undefined) return false
  if (input.session.time.updated < input.now - input.maxSessionAgeMs) return false
  if (input.session.time.updated > input.now - input.minIdleMs) return false
  return true
}

async function runWithConcurrency<T>(
  items: readonly T[],
  concurrency: number,
  fn: (item: T) => Promise<void>,
): Promise<void> {
  let nextIndex = 0
  const workerCount = Math.min(Math.max(1, concurrency), items.length)
  const workers = Array.from({ length: workerCount }, async () => {
    while (nextIndex < items.length) {
      const index = nextIndex
      nextIndex += 1
      const item = items[index]
      if (item) {
        await fn(item)
      }
    }
  })
  await Promise.all(workers)
}

function startupSessionSummary(
  session: OpenCodeSession.Info,
): Omit<LearnerMemoryStartupSessionResult, "extraction" | "error"> {
  return Object.assign(
    {
      sessionID: session.id,
      updatedAtMs: session.time.updated,
    },
    session.title ? { title: session.title } : undefined,
  )
}

async function buildLearnerMemoryStartupPlan(input: {
  directory: string
  currentSessionID?: string
}): Promise<LearnerMemoryStartupPlan> {
  const config = await readProjectConfig(input.directory)
  const settings = readLearnerMemorySettings(config)
  if (!settings.enabled || !settings.autoExtract) {
    return {
      scanned: 0,
      startupConcurrency: 1,
      eligible: [],
      skippedReason: LEARNER_MEMORY_STARTUP_DISABLED_REASON,
    }
  }

  const sessions = await OpenCodeInstance.provide({
    directory: input.directory,
    fn: async () => OpenCodeSession.list({ directory: input.directory }),
  })
  const now = Date.now()
  const eligible = sessions
    .filter((session) =>
      eligibleSession({
        session,
        currentSessionID: input.currentSessionID,
        now,
        minIdleMs: settings.minStartupIdleMs,
        maxSessionAgeMs: settings.maxStartupSessionAgeMs,
      }),
    )
    .toSorted((left, right) => right.time.updated - left.time.updated)
    .slice(0, settings.maxSessionsPerStartup)

  return {
    scanned: sessions.length,
    startupConcurrency: settings.startupConcurrency,
    eligible,
  }
}

async function runLearnerMemoryStartupSweep(input: {
  directory: string
  currentSessionID?: string
  observer?: LearnerMemoryStartupObserver
}): Promise<LearnerMemoryStartupResult> {
  const plan = await buildLearnerMemoryStartupPlan(input)
  await input.observer?.onPlan?.(plan)
  if (plan.skippedReason) {
    return {
      scanned: plan.scanned,
      eligible: 0,
      attempted: 0,
      skippedReason: plan.skippedReason,
      sessions: [],
    }
  }

  const sessions: LearnerMemoryStartupSessionResult[] = plan.eligible.map((session) =>
    startupSessionSummary(session),
  )
  const resultBySessionID = new Map(
    sessions.map((session) => [session.sessionID, session] as const),
  )

  await runWithConcurrency(plan.eligible, plan.startupConcurrency, async (session) => {
    const summary = startupSessionSummary(session)
    await input.observer?.onSessionStart?.(summary)
    try {
      const extraction = await extractLearnerMemoryFromSession({
        directory: input.directory,
        sessionID: session.id,
      })
      const current = resultBySessionID.get(session.id)
      if (current) {
        const updated = { ...current, extraction }
        resultBySessionID.set(session.id, updated)
        await input.observer?.onSessionComplete?.(updated)
      }
    } catch (error) {
      const current = resultBySessionID.get(session.id)
      if (current) {
        const updated = {
          ...current,
          error: error instanceof Error ? error.message : String(error),
        }
        resultBySessionID.set(session.id, updated)
        await input.observer?.onSessionComplete?.(updated)
      }
    }
  })

  return {
    scanned: plan.scanned,
    eligible: plan.eligible.length,
    attempted: plan.eligible.length,
    sessions: plan.eligible.map(
      (session) => resultBySessionID.get(session.id) ?? startupSessionSummary(session),
    ),
  }
}

async function runLearnerMemoryStartupPipeline(input: {
  directory: string
  currentSessionID?: string
}): Promise<LearnerMemoryStartupResult> {
  const plan = await buildLearnerMemoryStartupPlan(input)
  if (plan.skippedReason) {
    return {
      scanned: plan.scanned,
      eligible: 0,
      attempted: 0,
      skippedReason: plan.skippedReason,
      sessions: [],
    }
  }

  runWithConcurrency(plan.eligible, plan.startupConcurrency, async (session) => {
    await extractLearnerMemoryFromSession({
      directory: input.directory,
      sessionID: session.id,
    }).catch((error) => {
      console.warn("Learner memory startup extraction failed:", error)
    })
  }).catch((error) => {
    console.warn("Learner memory startup pipeline failed:", error)
  })

  return {
    scanned: plan.scanned,
    eligible: plan.eligible.length,
    attempted: plan.eligible.length,
    sessions: plan.eligible.map((session) => startupSessionSummary(session)),
  }
}

export {
  LEARNER_MEMORY_STARTUP_DISABLED_REASON,
  runLearnerMemoryStartupPipeline,
  runLearnerMemoryStartupSweep,
}
export type {
  LearnerMemoryStartupObserver,
  LearnerMemoryStartupPlan,
  LearnerMemoryStartupResult,
  LearnerMemoryStartupSessionResult,
}
