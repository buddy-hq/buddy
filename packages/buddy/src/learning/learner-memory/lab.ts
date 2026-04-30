import fs from "node:fs/promises"
import path from "node:path"
import { ulid } from "ulid"
import { BUDDY_HOME_DIRECTORY_NAME, Global } from "../../storage"
import {
  runWithLearnerMemoryLabContext,
  type LearnerMemoryLabSettingsOverride,
} from "./lab-context"
import { runLearnerMemoryEvaluation } from "./evaluation"
import { extractLearnerMemoryFromSession } from "./session-extraction"
import { searchLearnerMemory } from "./retrieval"
import type { SessionExtractionResult } from "./session-extraction"
import {
  runLearnerMemoryStartupSweep,
  type LearnerMemoryStartupPlan,
  type LearnerMemoryStartupResult,
  type LearnerMemoryStartupSessionResult,
} from "./startup"
import type { AttentionDecision, EvaluationReport, RetrievalResult } from "./types"

const LAB_MEMORY_DIRECTORY_NAME = "learner-memory-lab"
const LAB_RUN_DIRECTORY_PREFIX = "run_"
const LAB_STATUS_FILE_NAME = "lab-status.json"
const LAB_TRACE_FILE_NAME = "lab-trace.jsonl"
const SEARCH_PROBE_LIMIT = 8
const SESSION_NOT_FOUND_ERROR_NAME = "NotFoundError"
const SESSION_NOT_FOUND_SKIP_REASON = "session_not_found"

const MEMORY_TEST_STEP_LABELS = {
  currentSessionExtraction: "Current session extraction",
  startupSweep: "Startup sweep",
  deterministicHarness: "Deterministic harness",
  modelHarness: "Model harness",
  searchProbe: "Search probe",
} as const

type LearnerMemoryLabSelection = {
  deterministicHarness: boolean
  modelHarness: boolean
  startupSweep: boolean
  currentSessionExtraction: boolean
  currentSessionExtractionForce: boolean
  searchProbe: boolean
}

type LearnerMemoryLabRunInput = {
  directory: string
  sessionID?: string
  probeQuery?: string
  selection: LearnerMemoryLabSelection
  settingsOverride: LearnerMemoryLabSettingsOverride
}

type LearnerMemoryLabRunResult = {
  runID: string
  memoryRoot: string
  ranAt: string
  deterministicReport?: EvaluationReport
  modelReport?: EvaluationReport
  startupPipeline?: LearnerMemoryStartupResult
  sessionExtraction?: SessionExtractionResult
  searchResults?: RetrievalResult[]
}

type LearnerMemoryLabRunStatus = "running" | "completed" | "failed"
type LearnerMemoryLabStepKey = keyof typeof MEMORY_TEST_STEP_LABELS
type LearnerMemoryLabStepStatus = "pending" | "running" | "completed" | "skipped" | "failed"
type LearnerMemoryLabTraceLevel = "info" | "warn" | "error"
type LearnerMemoryLabSessionScope = "current_session" | "startup_sweep"
type LearnerMemoryLabSessionStatus = "pending" | "running" | "completed" | "skipped" | "failed"

type LearnerMemoryLabStepTrace = {
  key: LearnerMemoryLabStepKey
  label: string
  status: LearnerMemoryLabStepStatus
  startedAt?: string
  completedAt?: string
  summary?: string
}

type LearnerMemoryLabTraceEvent = {
  id: string
  at: string
  level: LearnerMemoryLabTraceLevel
  step?: LearnerMemoryLabStepKey
  sessionID?: string
  message: string
  details?: Record<string, unknown>
}

type LearnerMemoryLabSessionTrace = {
  scope: LearnerMemoryLabSessionScope
  sessionID: string
  title?: string
  updatedAtMs?: number
  status: LearnerMemoryLabSessionStatus
  startedAt?: string
  completedAt?: string
  candidateCount?: number
  approvedCount?: number
  skippedReason?: string
  error?: string
  decision?: AttentionDecision
}

type LearnerMemoryLabProgress = {
  totalSteps: number
  completedSteps: number
  totalSessions: number
  completedSessions: number
  runningSessions: number
  skippedSessions: number
  failedSessions: number
  candidateCount: number
  approvedCount: number
}

type LearnerMemoryLabRunState = {
  runID: string
  directory: string
  memoryRoot: string
  statusPath: string
  tracePath: string
  startedAt: string
  completedAt?: string
  status: LearnerMemoryLabRunStatus
  selection: LearnerMemoryLabSelection
  settingsOverride: LearnerMemoryLabSettingsOverride
  sessionID?: string
  probeQuery?: string
  steps: LearnerMemoryLabStepTrace[]
  progress: LearnerMemoryLabProgress
  trace: LearnerMemoryLabTraceEvent[]
  sessions: LearnerMemoryLabSessionTrace[]
  result?: LearnerMemoryLabRunResult
  error?: string
}

type LearnerMemoryLabStateWriter = {
  snapshot: () => LearnerMemoryLabRunState
  log: (input: {
    level: LearnerMemoryLabTraceLevel
    message: string
    step?: LearnerMemoryLabStepKey
    sessionID?: string
    details?: Record<string, unknown>
  }) => Promise<void>
  update: (fn: (state: LearnerMemoryLabRunState) => void) => Promise<void>
  startStep: (key: LearnerMemoryLabStepKey, summary?: string) => Promise<void>
  finishStep: (
    key: LearnerMemoryLabStepKey,
    input: {
      status: Exclude<LearnerMemoryLabStepStatus, "pending" | "running">
      summary: string
    },
  ) => Promise<void>
  startSession: (session: LearnerMemoryLabSessionTrace) => Promise<void>
  finishSession: (session: LearnerMemoryLabSessionTrace) => Promise<void>
  completeRun: (result: LearnerMemoryLabRunResult) => Promise<void>
  failRun: (error: string) => Promise<void>
}

const learnerMemoryLabRunStates = new Map<string, LearnerMemoryLabRunState>()
const learnerMemoryLabRunTasks = new Map<string, Promise<void>>()

function makeLabMemoryRoot(runID: string): string {
  return path.join(
    Global.Path.home,
    BUDDY_HOME_DIRECTORY_NAME,
    LAB_MEMORY_DIRECTORY_NAME,
    `${LAB_RUN_DIRECTORY_PREFIX}${runID}`,
  )
}

function makeLabStatusPath(memoryRoot: string): string {
  return path.join(memoryRoot, LAB_STATUS_FILE_NAME)
}

function makeLabTracePath(memoryRoot: string): string {
  return path.join(memoryRoot, LAB_TRACE_FILE_NAME)
}

function isSessionNotFoundError(error: unknown): boolean {
  if (!(error instanceof Error)) return false
  if (error.name === SESSION_NOT_FOUND_ERROR_NAME) return true
  return error.message.includes(SESSION_NOT_FOUND_ERROR_NAME)
}

function nowIso(): string {
  return new Date().toISOString()
}

function buildLabRunSteps(selection: LearnerMemoryLabSelection): LearnerMemoryLabStepTrace[] {
  const steps: LearnerMemoryLabStepTrace[] = []
  if (selection.currentSessionExtraction) {
    steps.push({
      key: "currentSessionExtraction",
      label: MEMORY_TEST_STEP_LABELS.currentSessionExtraction,
      status: "pending",
    })
  }
  if (selection.startupSweep) {
    steps.push({
      key: "startupSweep",
      label: MEMORY_TEST_STEP_LABELS.startupSweep,
      status: "pending",
    })
  }
  if (selection.deterministicHarness) {
    steps.push({
      key: "deterministicHarness",
      label: MEMORY_TEST_STEP_LABELS.deterministicHarness,
      status: "pending",
    })
  }
  if (selection.modelHarness) {
    steps.push({
      key: "modelHarness",
      label: MEMORY_TEST_STEP_LABELS.modelHarness,
      status: "pending",
    })
  }
  if (selection.searchProbe) {
    steps.push({
      key: "searchProbe",
      label: MEMORY_TEST_STEP_LABELS.searchProbe,
      status: "pending",
    })
  }
  return steps
}

function buildInitialLabProgress(
  totalSteps: number,
  totalSessions: number,
): LearnerMemoryLabProgress {
  return {
    totalSteps,
    completedSteps: 0,
    totalSessions,
    completedSessions: 0,
    runningSessions: 0,
    skippedSessions: 0,
    failedSessions: 0,
    candidateCount: 0,
    approvedCount: 0,
  }
}

function buildInitialLabState(input: {
  runID: string
  memoryRoot: string
  directory: string
  selection: LearnerMemoryLabSelection
  settingsOverride: LearnerMemoryLabSettingsOverride
  sessionID?: string
  probeQuery?: string
}): LearnerMemoryLabRunState {
  const startedAt = nowIso()
  const steps = buildLabRunSteps(input.selection)
  const sessions: LearnerMemoryLabSessionTrace[] =
    input.selection.currentSessionExtraction && input.sessionID
      ? [
          {
            scope: "current_session",
            sessionID: input.sessionID,
            status: "pending",
          },
        ]
      : []

  return {
    runID: input.runID,
    directory: input.directory,
    memoryRoot: input.memoryRoot,
    statusPath: makeLabStatusPath(input.memoryRoot),
    tracePath: makeLabTracePath(input.memoryRoot),
    startedAt,
    status: "running",
    selection: input.selection,
    settingsOverride: input.settingsOverride,
    ...(input.sessionID ? { sessionID: input.sessionID } : {}),
    ...(input.probeQuery ? { probeQuery: input.probeQuery } : {}),
    steps,
    progress: buildInitialLabProgress(steps.length, sessions.length),
    trace: [],
    sessions,
  }
}

function recomputeLabProgress(state: LearnerMemoryLabRunState): LearnerMemoryLabProgress {
  const completedSteps = state.steps.filter(
    (step) => step.status === "completed" || step.status === "skipped" || step.status === "failed",
  ).length
  const runningSessions = state.sessions.filter((session) => session.status === "running").length
  const skippedSessions = state.sessions.filter((session) => session.status === "skipped").length
  const failedSessions = state.sessions.filter((session) => session.status === "failed").length
  const completedSessions = state.sessions.filter(
    (session) =>
      session.status === "completed" || session.status === "skipped" || session.status === "failed",
  ).length
  const candidateCount = state.sessions.reduce(
    (total, session) => total + (session.candidateCount ?? 0),
    0,
  )
  const approvedCount = state.sessions.reduce(
    (total, session) => total + (session.approvedCount ?? 0),
    0,
  )

  return {
    totalSteps: state.steps.length,
    completedSteps,
    totalSessions: state.sessions.length,
    completedSessions,
    runningSessions,
    skippedSessions,
    failedSessions,
    candidateCount,
    approvedCount,
  }
}

async function writeLabStateSnapshot(state: LearnerMemoryLabRunState): Promise<void> {
  const content = `${JSON.stringify(state, null, 2)}\n`
  const temporaryPath = `${state.statusPath}.tmp`
  await fs.writeFile(temporaryPath, content, "utf8")
  await fs.rename(temporaryPath, state.statusPath)
}

async function appendLabTraceEvent(
  tracePath: string,
  event: LearnerMemoryLabTraceEvent,
): Promise<void> {
  await fs.appendFile(tracePath, `${JSON.stringify(event)}\n`, "utf8")
}

function upsertSessionTrace(
  sessions: LearnerMemoryLabSessionTrace[],
  session: LearnerMemoryLabSessionTrace,
): LearnerMemoryLabSessionTrace[] {
  const index = sessions.findIndex(
    (current) => current.scope === session.scope && current.sessionID === session.sessionID,
  )
  if (index < 0) {
    return [...sessions, session]
  }
  return sessions.map((current, currentIndex) => (currentIndex === index ? session : current))
}

function sessionStatusFromExtraction(
  extraction: SessionExtractionResult,
): LearnerMemoryLabSessionStatus {
  if (extraction.consolidationError) {
    return "failed"
  }
  if (extraction.skippedReason) {
    return "skipped"
  }
  return "completed"
}

function summaryFromExtraction(extraction: SessionExtractionResult): string {
  if (extraction.consolidationError) {
    return `Extracted ${extraction.candidateCount} candidates, then consolidation failed.`
  }
  if (extraction.skippedReason) {
    return `Skipped: ${extraction.skippedReason}`
  }
  if (extraction.approvedCount > 0) {
    return `Completed with ${extraction.approvedCount} approved memories.`
  }
  if (extraction.candidateCount > 0) {
    return `Completed with ${extraction.candidateCount} candidates and no approved memories.`
  }
  return "Completed without generating candidate memories."
}

function startupSummary(result: LearnerMemoryStartupResult): string {
  if (result.skippedReason) {
    return `Skipped: ${result.skippedReason}`
  }
  const candidateCount = result.sessions.reduce(
    (total, session) => total + (session.extraction?.candidateCount ?? 0),
    0,
  )
  const approvedCount = result.sessions.reduce(
    (total, session) => total + (session.extraction?.approvedCount ?? 0),
    0,
  )
  const failedCount = result.sessions.filter(
    (session) => session.error || session.extraction?.consolidationError,
  ).length
  return `Scanned ${result.scanned} sessions, attempted ${result.attempted}, extracted ${candidateCount} candidates, approved ${approvedCount} memories${failedCount > 0 ? `, failures ${failedCount}` : ""}.`
}

function evaluationSummary(report: EvaluationReport): string {
  return `Fixtures ${report.fixtureCount}, candidates ${report.candidateCount}, approved ${report.approvedCount}, failures ${report.failures.length}.`
}

function searchSummary(results: readonly RetrievalResult[]): string {
  return `Retrieved ${results.length} matching memories.`
}

function createLabStateWriter(initialState: LearnerMemoryLabRunState): LearnerMemoryLabStateWriter {
  let state = initialState
  let writeQueue = Promise.resolve()

  learnerMemoryLabRunStates.set(state.runID, state)

  const enqueue = async (
    mutate?: (current: LearnerMemoryLabRunState) => void,
    event?: LearnerMemoryLabTraceEvent,
  ) => {
    if (mutate) {
      mutate(state)
    }
    if (event) {
      state = {
        ...state,
        trace: [...state.trace, event],
      }
    }
    state = {
      ...state,
      progress: recomputeLabProgress(state),
    }
    learnerMemoryLabRunStates.set(state.runID, state)

    writeQueue = writeQueue.then(async () => {
      await writeLabStateSnapshot(state)
      if (event) {
        await appendLabTraceEvent(state.tracePath, event)
      }
    })
    await writeQueue
  }

  return {
    snapshot: () => state,
    log: async (input) =>
      enqueue(undefined, {
        id: `trace_${ulid()}`,
        at: nowIso(),
        level: input.level,
        ...(input.step ? { step: input.step } : {}),
        ...(input.sessionID ? { sessionID: input.sessionID } : {}),
        message: input.message,
        ...(input.details ? { details: input.details } : {}),
      }),
    update: async (fn) => enqueue(fn),
    startStep: async (key, summary) =>
      enqueue((current) => {
        current.steps = current.steps.map((step) =>
          step.key === key
            ? {
                ...step,
                status: "running",
                startedAt: step.startedAt ?? nowIso(),
                ...(summary ? { summary } : {}),
              }
            : step,
        )
      }),
    finishStep: async (key, input) =>
      enqueue((current) => {
        current.steps = current.steps.map((step) =>
          step.key === key
            ? {
                ...step,
                status: input.status,
                startedAt: step.startedAt ?? nowIso(),
                completedAt: nowIso(),
                summary: input.summary,
              }
            : step,
        )
      }),
    startSession: async (session) =>
      enqueue((current) => {
        const nextSession: LearnerMemoryLabSessionTrace = {
          ...session,
          status: "running",
          startedAt: session.startedAt ?? nowIso(),
        }
        current.sessions = upsertSessionTrace(current.sessions, nextSession)
      }),
    finishSession: async (session) =>
      enqueue((current) => {
        const nextSession: LearnerMemoryLabSessionTrace = {
          ...session,
          completedAt: session.completedAt ?? nowIso(),
        }
        current.sessions = upsertSessionTrace(current.sessions, nextSession)
      }),
    completeRun: async (result) =>
      enqueue((current) => {
        current.status = "completed"
        current.completedAt = nowIso()
        current.result = result
      }),
    failRun: async (error) =>
      enqueue((current) => {
        current.status = "failed"
        current.completedAt = nowIso()
        current.error = error
      }),
  }
}

async function executeLearnerMemoryLabRun(
  input: LearnerMemoryLabRunInput,
  writer: LearnerMemoryLabStateWriter,
): Promise<LearnerMemoryLabRunResult> {
  const initialState = writer.snapshot()

  return runWithLearnerMemoryLabContext(
    {
      memoryRoot: initialState.memoryRoot,
      settingsOverride: input.settingsOverride,
    },
    async () => {
      const result: LearnerMemoryLabRunResult = {
        runID: initialState.runID,
        memoryRoot: initialState.memoryRoot,
        ranAt: initialState.startedAt,
      }

      await writer.log({
        level: "info",
        message: "Lab run started.",
        details: {
          directory: input.directory,
          selection: input.selection,
          settingsOverride: input.settingsOverride,
          sessionID: input.sessionID,
          probeQuery: input.probeQuery,
        },
      })

      if (input.selection.currentSessionExtraction && input.sessionID) {
        await writer.startStep("currentSessionExtraction")
        await writer.startSession({
          scope: "current_session",
          sessionID: input.sessionID,
          status: "pending",
        })
        await writer.log({
          level: "info",
          step: "currentSessionExtraction",
          sessionID: input.sessionID,
          message: input.selection.currentSessionExtractionForce
            ? "Starting forced current-session extraction."
            : "Starting current-session extraction.",
        })

        try {
          result.sessionExtraction = await extractLearnerMemoryFromSession({
            directory: input.directory,
            sessionID: input.sessionID,
            force: input.selection.currentSessionExtractionForce,
          })
        } catch (error) {
          if (!isSessionNotFoundError(error)) {
            const message = error instanceof Error ? error.message : String(error)
            await writer.finishSession({
              scope: "current_session",
              sessionID: input.sessionID,
              status: "failed",
              error: message,
            })
            await writer.finishStep("currentSessionExtraction", {
              status: "failed",
              summary: message,
            })
            await writer.log({
              level: "error",
              step: "currentSessionExtraction",
              sessionID: input.sessionID,
              message: "Current-session extraction failed.",
              details: { error: message },
            })
            throw error
          }
          result.sessionExtraction = {
            enabled: true,
            sessionID: input.sessionID,
            candidateCount: 0,
            approvedCount: 0,
            memoryIds: [],
            skippedReason: SESSION_NOT_FOUND_SKIP_REASON,
          }
        }

        const currentExtraction = result.sessionExtraction
        if (currentExtraction) {
          await writer.finishSession({
            scope: "current_session",
            sessionID: currentExtraction.sessionID,
            status: sessionStatusFromExtraction(currentExtraction),
            candidateCount: currentExtraction.candidateCount,
            approvedCount: currentExtraction.approvedCount,
            ...(currentExtraction.skippedReason
              ? { skippedReason: currentExtraction.skippedReason }
              : {}),
            ...(currentExtraction.consolidationError
              ? { error: currentExtraction.consolidationError }
              : {}),
            ...(currentExtraction.decision ? { decision: currentExtraction.decision } : {}),
          })
          await writer.finishStep("currentSessionExtraction", {
            status: currentExtraction.skippedReason ? "skipped" : "completed",
            summary: summaryFromExtraction(currentExtraction),
          })
          await writer.log({
            level: currentExtraction.skippedReason ? "warn" : "info",
            step: "currentSessionExtraction",
            sessionID: currentExtraction.sessionID,
            message: currentExtraction.skippedReason
              ? "Current-session extraction skipped."
              : "Current-session extraction completed.",
            details: {
              candidateCount: currentExtraction.candidateCount,
              approvedCount: currentExtraction.approvedCount,
              skippedReason: currentExtraction.skippedReason,
              consolidationError: currentExtraction.consolidationError,
              decision: currentExtraction.decision,
            },
          })
        }
      }

      if (input.selection.startupSweep) {
        await writer.startStep("startupSweep")
        await writer.log({
          level: "info",
          step: "startupSweep",
          message: "Starting startup sweep.",
        })
        result.startupPipeline = await runLearnerMemoryStartupSweep({
          directory: input.directory,
          currentSessionID: input.sessionID,
          observer: {
            onPlan: async (plan: LearnerMemoryStartupPlan) => {
              await writer.update((current) => {
                const startupSessions = plan.eligible.map(
                  (session): LearnerMemoryLabSessionTrace => ({
                    scope: "startup_sweep",
                    sessionID: session.id,
                    ...(session.title ? { title: session.title } : {}),
                    updatedAtMs: session.time.updated,
                    status: "pending",
                  }),
                )
                current.sessions = [
                  ...current.sessions.filter((session) => session.scope !== "startup_sweep"),
                  ...startupSessions,
                ]
              })
              await writer.log({
                level: plan.skippedReason ? "warn" : "info",
                step: "startupSweep",
                message: plan.skippedReason
                  ? "Startup sweep skipped before attempting sessions."
                  : "Startup sweep plan ready.",
                details: {
                  scanned: plan.scanned,
                  eligible: plan.eligible.length,
                  startupConcurrency: plan.startupConcurrency,
                  skippedReason: plan.skippedReason,
                },
              })
            },
            onSessionStart: async (session: LearnerMemoryStartupSessionResult) => {
              await writer.startSession({
                scope: "startup_sweep",
                sessionID: session.sessionID,
                ...(session.title ? { title: session.title } : {}),
                updatedAtMs: session.updatedAtMs,
                status: "pending",
              })
              await writer.log({
                level: "info",
                step: "startupSweep",
                sessionID: session.sessionID,
                message: "Startup sweep session started.",
                details: {
                  title: session.title,
                  updatedAtMs: session.updatedAtMs,
                },
              })
            },
            onSessionComplete: async (session: LearnerMemoryStartupSessionResult) => {
              const extraction = session.extraction
              const status: LearnerMemoryLabSessionStatus = session.error
                ? "failed"
                : extraction
                  ? sessionStatusFromExtraction(extraction)
                  : "failed"
              await writer.finishSession({
                scope: "startup_sweep",
                sessionID: session.sessionID,
                ...(session.title ? { title: session.title } : {}),
                updatedAtMs: session.updatedAtMs,
                status,
                ...(extraction ? { candidateCount: extraction.candidateCount } : {}),
                ...(extraction ? { approvedCount: extraction.approvedCount } : {}),
                ...(extraction?.skippedReason ? { skippedReason: extraction.skippedReason } : {}),
                ...(extraction?.decision ? { decision: extraction.decision } : {}),
                ...(session.error || extraction?.consolidationError
                  ? { error: session.error ?? extraction?.consolidationError }
                  : {}),
              })
              await writer.log({
                level:
                  session.error || extraction?.skippedReason || extraction?.consolidationError
                    ? "warn"
                    : "info",
                step: "startupSweep",
                sessionID: session.sessionID,
                message: session.error
                  ? "Startup sweep session failed."
                  : extraction?.consolidationError
                    ? "Startup sweep session extracted candidates, then consolidation failed."
                    : extraction?.skippedReason
                      ? "Startup sweep session skipped."
                      : "Startup sweep session completed.",
                details: {
                  title: session.title,
                  updatedAtMs: session.updatedAtMs,
                  candidateCount: extraction?.candidateCount,
                  approvedCount: extraction?.approvedCount,
                  skippedReason: extraction?.skippedReason,
                  consolidationError: extraction?.consolidationError,
                  decision: extraction?.decision,
                  error: session.error,
                },
              })
            },
          },
        })
        await writer.finishStep("startupSweep", {
          status: result.startupPipeline.skippedReason
            ? "skipped"
            : result.startupPipeline.sessions.some(
                  (session) => session.error || session.extraction?.consolidationError,
                )
              ? "failed"
              : "completed",
          summary: startupSummary(result.startupPipeline),
        })
        await writer.log({
          level: result.startupPipeline.skippedReason ? "warn" : "info",
          step: "startupSweep",
          message: result.startupPipeline.skippedReason
            ? "Startup sweep skipped."
            : "Startup sweep completed.",
          details: {
            scanned: result.startupPipeline.scanned,
            eligible: result.startupPipeline.eligible,
            attempted: result.startupPipeline.attempted,
            skippedReason: result.startupPipeline.skippedReason,
          },
        })
      }

      if (input.selection.deterministicHarness) {
        await writer.startStep("deterministicHarness")
        await writer.log({
          level: "info",
          step: "deterministicHarness",
          message: "Starting deterministic harness.",
        })
        result.deterministicReport = await runLearnerMemoryEvaluation({
          directory: input.directory,
          extractionMode: "deterministic",
        })
        await writer.finishStep("deterministicHarness", {
          status: "completed",
          summary: evaluationSummary(result.deterministicReport),
        })
        await writer.log({
          level: "info",
          step: "deterministicHarness",
          message: "Deterministic harness completed.",
          details: {
            fixtureCount: result.deterministicReport.fixtureCount,
            candidateCount: result.deterministicReport.candidateCount,
            approvedCount: result.deterministicReport.approvedCount,
            failures: result.deterministicReport.failures,
          },
        })
      }

      if (input.selection.modelHarness) {
        await writer.startStep("modelHarness")
        await writer.log({
          level: "info",
          step: "modelHarness",
          message: "Starting model harness.",
        })
        result.modelReport = await runLearnerMemoryEvaluation({
          directory: input.directory,
          extractionMode: "model",
        })
        await writer.finishStep("modelHarness", {
          status: "completed",
          summary: evaluationSummary(result.modelReport),
        })
        await writer.log({
          level: "info",
          step: "modelHarness",
          message: "Model harness completed.",
          details: {
            fixtureCount: result.modelReport.fixtureCount,
            candidateCount: result.modelReport.candidateCount,
            approvedCount: result.modelReport.approvedCount,
            failures: result.modelReport.failures,
          },
        })
      }

      if (input.selection.searchProbe && input.probeQuery && input.probeQuery.trim().length > 0) {
        await writer.startStep("searchProbe")
        await writer.log({
          level: "info",
          step: "searchProbe",
          message: "Starting search probe.",
          details: { query: input.probeQuery.trim() },
        })
        result.searchResults = await searchLearnerMemory({
          directory: input.directory,
          query: input.probeQuery.trim(),
          limit: SEARCH_PROBE_LIMIT,
          projectPath: input.directory,
          recordUsage: true,
        })
        await writer.finishStep("searchProbe", {
          status: "completed",
          summary: searchSummary(result.searchResults),
        })
        await writer.log({
          level: "info",
          step: "searchProbe",
          message: "Search probe completed.",
          details: {
            query: input.probeQuery.trim(),
            resultCount: result.searchResults.length,
          },
        })
      }

      await writer.log({
        level: "info",
        message: "Lab run completed.",
      })
      await writer.completeRun(result)
      return result
    },
  )
}

async function prepareLearnerMemoryLabRun(input: LearnerMemoryLabRunInput): Promise<{
  writer: LearnerMemoryLabStateWriter
  state: LearnerMemoryLabRunState
}> {
  const runID = ulid()
  const memoryRoot = makeLabMemoryRoot(runID)
  await fs.mkdir(memoryRoot, { recursive: true })
  const state = buildInitialLabState({
    runID,
    memoryRoot,
    directory: input.directory,
    selection: input.selection,
    settingsOverride: input.settingsOverride,
    sessionID: input.sessionID,
    probeQuery: input.probeQuery,
  })
  const writer = createLabStateWriter(state)
  await writer.update(() => {})
  return { writer, state }
}

async function runLearnerMemoryLab(
  input: LearnerMemoryLabRunInput,
): Promise<LearnerMemoryLabRunResult> {
  const { writer } = await prepareLearnerMemoryLabRun(input)
  try {
    return await executeLearnerMemoryLabRun(input, writer)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    await writer.log({
      level: "error",
      message: "Lab run failed.",
      details: { error: message },
    })
    await writer.failRun(message)
    throw error
  }
}

async function startLearnerMemoryLabRun(
  input: LearnerMemoryLabRunInput,
): Promise<LearnerMemoryLabRunState> {
  const { writer, state } = await prepareLearnerMemoryLabRun(input)
  const task = executeLearnerMemoryLabRun(input, writer)
    .then(() => undefined)
    .catch(async (error) => {
      const message = error instanceof Error ? error.message : String(error)
      await writer.log({
        level: "error",
        message: "Lab run failed.",
        details: { error: message },
      })
      await writer.failRun(message)
    })
    .finally(() => {
      learnerMemoryLabRunTasks.delete(state.runID)
    })
  learnerMemoryLabRunTasks.set(state.runID, task)
  return writer.snapshot()
}

function getLearnerMemoryLabRunState(runID: string): LearnerMemoryLabRunState | undefined {
  return learnerMemoryLabRunStates.get(runID)
}

export { getLearnerMemoryLabRunState, runLearnerMemoryLab, startLearnerMemoryLabRun }
export type {
  LearnerMemoryLabProgress,
  LearnerMemoryLabRunInput,
  LearnerMemoryLabRunResult,
  LearnerMemoryLabRunState,
  LearnerMemoryLabRunStatus,
  LearnerMemoryLabSelection,
  LearnerMemoryLabSessionTrace,
  LearnerMemoryLabStepKey,
  LearnerMemoryLabStepStatus,
  LearnerMemoryLabStepTrace,
  LearnerMemoryLabTraceEvent,
  LearnerMemoryLabTraceLevel,
}
