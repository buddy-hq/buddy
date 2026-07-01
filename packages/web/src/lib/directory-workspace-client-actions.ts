import {
  BENCH_AUTO_OPEN_POLICY_FULLSCREEN_HTML_WIDGET,
  BENCH_AUTO_OPEN_POLICY_WHITEBOARD,
  BENCH_MODE_REQUEST_POLICY,
  benchTargetKey,
  type BenchAutoOpenIdentity,
  type BenchTarget,
} from "@/lib/bench-navigation"
import type {
  BenchClientActionCompletionDraft,
  BenchClientLease,
} from "@/lib/directory-workspace-lifecycle"
import type {
  DirectoryWorkspaceCommand,
  DirectoryWorkspaceCommandResult,
} from "@/state/directory-workspace-store"
import { logBenchToggleStep } from "@/lib/bench-toggle-diagnostics"

const BENCH_CLIENT_ACTION_VERSION = 1
const BENCH_CLIENT_ACTION_LEDGER_LIMIT = 512
const BENCH_CLIENT_ACTION_TYPE = "bench.client_action"
const BENCH_CLIENT_LEASE_TYPE = "bench.client_lease"
const LEDGER_STATUS_EXECUTING = "executing"
const LEDGER_STATUS_PENDING_COMPLETION_SESSION = "pending-completion-session"
const LEDGER_STATUS_PENDING_SESSION = "pending-session"
const LEDGER_STATUS_TERMINAL = "terminal"
const BEST_EFFORT_COALESCING_KEY_SEPARATOR = "\0"

type UnknownRecord = Record<string, unknown>

type BenchClientActionV1 = {
  version: typeof BENCH_CLIENT_ACTION_VERSION
  actionID: string
  directory: string
  sessionID: string
  messageID: string
  callID: string | null
  origin: "agent" | "auto-open"
  acknowledgement: "required" | "best-effort"
  expiresAt: number
  command: { type: "present"; target: BenchTarget } | { type: "close" }
}

type BenchObjectKind = Extract<BenchTarget, { type: "object" }>["ref"]["kind"]

type LedgerEntry =
  | {
      status: typeof LEDGER_STATUS_EXECUTING
    }
  | {
      status: typeof LEDGER_STATUS_PENDING_SESSION
      action: BenchClientActionV1
    }
  | {
      status: typeof LEDGER_STATUS_PENDING_COMPLETION_SESSION
      action: BenchClientActionV1
      completion: BenchClientActionCompletionDraft
    }
  | {
      status: typeof LEDGER_STATUS_TERMINAL
      completion: BenchClientActionCompletionDraft
      usedAt: number
    }

type PendingSessionDrainEntry =
  | {
      type: "action"
      action: BenchClientActionV1
    }
  | {
      type: "completion"
      action: BenchClientActionV1
      completion: BenchClientActionCompletionDraft
    }

type DirectoryWorkspaceClientActionLedgerInput = {
  directory: string
  controller: DirectoryWorkspaceCommandExecutor
  lifecycle: DirectoryWorkspaceActionCompletionSink
  getActiveSessionID: () => string | undefined
}

type DirectoryWorkspaceCommandExecutor = {
  execute(
    command: DirectoryWorkspaceCommand,
    options?: { origin: "agent" | "user" | "auto-open"; autoOpen?: BenchAutoOpenIdentity | null },
  ): DirectoryWorkspaceCommandResult | Promise<DirectoryWorkspaceCommandResult>
}

type DirectoryWorkspaceActionCompletionSink = {
  completeClientAction(input: {
    actionID: string
    sessionID: string
    completion: BenchClientActionCompletionDraft
    getActiveSessionID: () => string | undefined
  }): Promise<boolean>
}

function isRecord(value: unknown): value is UnknownRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value ? value : undefined
}

function readNullableString(value: unknown): string | null | undefined {
  if (value === null) return null
  return readString(value)
}

function isBenchObjectKind(value: unknown): value is BenchObjectKind {
  return (
    value === "resource" ||
    value === "whiteboard" ||
    value === "html-widget" ||
    value === "mermaid" ||
    value === "figure" ||
    value === "freeform-figure" ||
    value === "media-presentation" ||
    value === "question-set" ||
    value === "flashcard-deck"
  )
}

function readBenchTarget(value: unknown): BenchTarget | undefined {
  if (!isRecord(value)) return undefined
  if (value.type === "workspace-file") {
    const filepath = readString(value.path)
    const viewer = value.viewer === "markdown" || value.viewer === "file" ? value.viewer : undefined
    if (!filepath || !viewer) return undefined
    return {
      type: "workspace-file",
      path: filepath,
      viewer,
    }
  }
  if (value.type !== "object" || !isRecord(value.ref)) return undefined
  const kind = value.ref.kind
  const objectID = readString(value.ref.objectID)
  const revisionID = readNullableString(value.ref.revisionID)
  const itemID = readNullableString(value.ref.itemID)
  const viewID = readString(value.viewID)
  if (
    !isBenchObjectKind(kind) ||
    !objectID ||
    revisionID === undefined ||
    itemID === undefined ||
    !viewID
  ) {
    return undefined
  }
  return {
    type: "object",
    ref: {
      kind,
      objectID,
      revisionID,
      itemID,
    },
    viewID,
  }
}

function readBenchClientAction(value: unknown): BenchClientActionV1 | undefined {
  if (!isRecord(value)) return undefined
  if (value.version !== BENCH_CLIENT_ACTION_VERSION) return undefined
  const actionID = readString(value.actionID)
  const directory = readString(value.directory)
  const sessionID = readString(value.sessionID)
  const messageID = readString(value.messageID)
  const callID = readNullableString(value.callID)
  const origin = value.origin === "agent" || value.origin === "auto-open" ? value.origin : undefined
  const acknowledgement =
    value.acknowledgement === "required" || value.acknowledgement === "best-effort"
      ? value.acknowledgement
      : undefined
  const expiresAt = typeof value.expiresAt === "number" ? value.expiresAt : undefined
  if (
    !actionID ||
    !directory ||
    !sessionID ||
    !messageID ||
    callID === undefined ||
    !origin ||
    !acknowledgement ||
    !expiresAt ||
    !isRecord(value.command)
  ) {
    return undefined
  }
  if (value.command.type === "close") {
    return {
      version: BENCH_CLIENT_ACTION_VERSION,
      actionID,
      directory,
      sessionID,
      messageID,
      callID,
      origin,
      acknowledgement,
      expiresAt,
      command: { type: "close" },
    }
  }
  if (value.command.type !== "present") return undefined
  const target = readBenchTarget(value.command.target)
  if (!target) return undefined
  return {
    version: BENCH_CLIENT_ACTION_VERSION,
    actionID,
    directory,
    sessionID,
    messageID,
    callID,
    origin,
    acknowledgement,
    expiresAt,
    command: {
      type: "present",
      target,
    },
  }
}

function readBenchClientLease(value: unknown): BenchClientLease | undefined {
  if (!isRecord(value)) return undefined
  const instanceID = readString(value.instanceID)
  const generation = typeof value.generation === "number" ? value.generation : undefined
  const leaseEpoch = typeof value.leaseEpoch === "number" ? value.leaseEpoch : undefined
  const directory = readString(value.directory)
  if (!instanceID || generation === undefined || leaseEpoch === undefined || !directory) {
    return undefined
  }
  return {
    instanceID,
    generation,
    leaseEpoch,
    directory,
  }
}

function readEventProperties(input: unknown, type: string): UnknownRecord | undefined {
  if (!isRecord(input)) return undefined
  if (input.type !== type) return undefined
  return isRecord(input.properties) ? input.properties : undefined
}

function readBenchClientActionEvent(input: unknown): BenchClientActionV1 | undefined {
  const properties = readEventProperties(input, BENCH_CLIENT_ACTION_TYPE)
  return properties ? readBenchClientAction(properties.action) : undefined
}

function readBenchClientLeaseEvent(input: unknown): BenchClientLease | undefined {
  const properties = readEventProperties(input, BENCH_CLIENT_LEASE_TYPE)
  return properties ? readBenchClientLease(properties.lease) : undefined
}

function completionFromResult(
  result: DirectoryWorkspaceCommandResult,
): BenchClientActionCompletionDraft {
  const observedState = {
    observedRoute: result.projection.route,
    observedVisibility: result.projection.bench.visibility,
    drawer: result.projection.drawer,
  }
  if (result.outcome === "committed") {
    return {
      outcome: "committed",
      ...observedState,
      changed: result.changed,
    }
  }
  if (result.outcome === "blocked") {
    return {
      outcome: "blocked",
      reason: result.reason,
      ...observedState,
    }
  }
  if (result.outcome === "failed") {
    return {
      outcome: "failed",
      reason: result.reason,
      ...observedState,
    }
  }
  if (result.outcome === "inactive") {
    return {
      outcome: "inactive_session",
      reason: result.reason,
      ...observedState,
    }
  }
  return {
    outcome: "superseded",
    reason: result.reason,
    ...observedState,
  }
}

function inactiveSessionCompletion(): BenchClientActionCompletionDraft {
  return {
    outcome: "inactive_session",
    reason: "session_inactive",
  }
}

function contextSyncFailedCompletion(): BenchClientActionCompletionDraft {
  return {
    outcome: "failed",
    reason: "context_sync_failed",
  }
}

function isActionExpired(action: BenchClientActionV1): boolean {
  return action.expiresAt <= Date.now()
}

function bestEffortAutoOpenIdentity(
  action: BenchClientActionV1,
): BenchAutoOpenIdentity | undefined {
  if (action.acknowledgement !== "best-effort") return undefined
  if (action.command.type !== "present") return undefined
  if (action.command.target.type !== "object") return undefined
  if (action.command.target.ref.kind === "whiteboard") {
    return {
      policyID: BENCH_AUTO_OPEN_POLICY_WHITEBOARD,
      eventKey: action.actionID,
    }
  }
  if (action.command.target.ref.kind === "html-widget") {
    return {
      policyID: BENCH_AUTO_OPEN_POLICY_FULLSCREEN_HTML_WIDGET,
      eventKey: action.actionID,
    }
  }
  return undefined
}

function bestEffortCoalescingKey(action: BenchClientActionV1): string | undefined {
  const identity = bestEffortAutoOpenIdentity(action)
  if (!identity || action.command.type !== "present") return undefined
  return [
    identity.policyID,
    action.messageID,
    action.callID ?? "",
    benchTargetKey(action.command.target),
  ].join(BEST_EFFORT_COALESCING_KEY_SEPARATOR)
}

export class DirectoryWorkspaceClientActionLedger {
  readonly #directory: string
  readonly #controller: DirectoryWorkspaceCommandExecutor
  readonly #lifecycle: DirectoryWorkspaceActionCompletionSink
  readonly #getActiveSessionID: () => string | undefined
  #entries = new Map<string, LedgerEntry>()
  #pendingBestEffortActionIDByKey = new Map<string, string>()
  #terminalSequence = 0

  constructor(input: DirectoryWorkspaceClientActionLedgerInput) {
    this.#directory = input.directory
    this.#controller = input.controller
    this.#lifecycle = input.lifecycle
    this.#getActiveSessionID = input.getActiveSessionID
    logBenchToggleStep("client-action-ledger-create", {
      directory: input.directory,
    })
  }

  dispose(): void {
    logBenchToggleStep("client-action-ledger-dispose", {
      directory: this.#directory,
      entryCount: this.#entries.size,
      pendingBestEffortCount: this.#pendingBestEffortActionIDByKey.size,
    })
    this.#entries.clear()
    this.#pendingBestEffortActionIDByKey.clear()
  }

  async handle(action: BenchClientActionV1): Promise<void> {
    logBenchToggleStep("client-action-ledger-handle-entry", {
      ledgerDirectory: this.#directory,
      action,
      activeSessionID: this.#getActiveSessionID(),
      existing: this.#entries.get(action.actionID),
    })
    if (action.directory !== this.#directory) {
      logBenchToggleStep("client-action-ledger-handle-directory-mismatch", {
        ledgerDirectory: this.#directory,
        action,
      })
      return
    }
    const existing = this.#entries.get(action.actionID)
    if (existing?.status === LEDGER_STATUS_EXECUTING) {
      logBenchToggleStep("client-action-ledger-handle-existing-executing", {
        action,
      })
      return
    }
    if (existing?.status === LEDGER_STATUS_TERMINAL) {
      existing.usedAt = this.#nextTerminalSequence()
      logBenchToggleStep("client-action-ledger-handle-existing-terminal", {
        action,
        completion: existing.completion,
      })
      if (action.acknowledgement === "required") {
        await this.#complete(action, existing.completion)
      }
      return
    }
    if (existing?.status === LEDGER_STATUS_PENDING_COMPLETION_SESSION) {
      logBenchToggleStep("client-action-ledger-handle-existing-pending-completion", {
        action,
        completion: existing.completion,
      })
      await this.#finishCompletion(existing.action, existing.completion)
      return
    }
    if (isActionExpired(action)) {
      logBenchToggleStep("client-action-ledger-handle-expired", {
        action,
        now: Date.now(),
      })
      this.#entries.delete(action.actionID)
      this.#removePendingBestEffort(action)
      return
    }
    const activeSessionID = this.#getActiveSessionID()
    if (activeSessionID === undefined) {
      logBenchToggleStep("client-action-ledger-handle-no-active-session", {
        action,
      })
      this.#queuePendingSessionAction(action)
      return
    }
    if (
      action.acknowledgement === "best-effort" &&
      action.command.type === "present" &&
      !bestEffortAutoOpenIdentity(action)
    ) {
      logBenchToggleStep("client-action-ledger-handle-best-effort-dropped", {
        action,
      })
      return
    }

    this.#entries.set(action.actionID, { status: LEDGER_STATUS_EXECUTING })
    logBenchToggleStep("client-action-ledger-handle-execute-start", {
      action,
      activeSessionID,
    })
    const completion = await this.#execute(action, activeSessionID)
    logBenchToggleStep("client-action-ledger-handle-execute-completion", {
      action,
      completion,
    })
    await this.#finishCompletion(action, completion)
  }

  async drainPendingSessionActions(): Promise<void> {
    logBenchToggleStep("client-action-ledger-drain-pending-entry", {
      directory: this.#directory,
      activeSessionID: this.#getActiveSessionID(),
      entryCount: this.#entries.size,
    })
    const pendingEntries: PendingSessionDrainEntry[] = []
    for (const entry of this.#entries.values()) {
      if (entry.status === LEDGER_STATUS_PENDING_SESSION) {
        pendingEntries.push({ type: "action", action: entry.action })
        continue
      }
      if (entry.status === LEDGER_STATUS_PENDING_COMPLETION_SESSION) {
        pendingEntries.push({
          type: "completion",
          action: entry.action,
          completion: entry.completion,
        })
      }
    }
    logBenchToggleStep("client-action-ledger-drain-pending-collected", {
      directory: this.#directory,
      pendingEntries,
    })
    for (const entry of pendingEntries) {
      if (entry.type === "action") {
        await this.handle(entry.action)
        continue
      }
      await this.#finishCompletion(entry.action, entry.completion)
    }
  }

  async #finishCompletion(
    action: BenchClientActionV1,
    completion: BenchClientActionCompletionDraft,
  ): Promise<void> {
    logBenchToggleStep("client-action-ledger-finish-completion-entry", {
      action,
      completion,
      activeSessionID: this.#getActiveSessionID(),
    })
    if (isActionExpired(action)) {
      logBenchToggleStep("client-action-ledger-finish-completion-expired", {
        action,
        completion,
        now: Date.now(),
      })
      this.#entries.delete(action.actionID)
      this.#removePendingBestEffort(action)
      return
    }
    if (action.acknowledgement === "best-effort") {
      logBenchToggleStep("client-action-ledger-finish-completion-best-effort-terminal", {
        action,
        completion,
      })
      this.#removePendingBestEffort(action)
      this.#recordTerminal(action.actionID, completion)
      return
    }
    let baseCompletion = completion
    while (!isActionExpired(action)) {
      const completionSessionID = this.#getActiveSessionID()
      if (completionSessionID === undefined) {
        logBenchToggleStep("client-action-ledger-finish-completion-no-session", {
          action,
          completion: baseCompletion,
        })
        this.#entries.set(action.actionID, {
          status: LEDGER_STATUS_PENDING_COMPLETION_SESSION,
          action,
          completion: baseCompletion,
        })
        return
      }
      const finalCompletion =
        completionSessionID === action.sessionID ? baseCompletion : inactiveSessionCompletion()
      logBenchToggleStep("client-action-ledger-finish-completion-before-complete", {
        action,
        completion: baseCompletion,
        completionSessionID,
        finalCompletion,
      })

      let completed: boolean
      try {
        completed = await this.#complete(action, finalCompletion)
      } catch {
        if (
          baseCompletion.outcome === "failed" &&
          baseCompletion.reason === "context_sync_failed"
        ) {
          completed = false
        } else {
          baseCompletion = contextSyncFailedCompletion()
          continue
        }
      }
      if (completed) {
        logBenchToggleStep("client-action-ledger-finish-completion-terminal", {
          action,
          completionToRecord: finalCompletion,
        })
        this.#recordTerminal(action.actionID, finalCompletion)
        return
      }
      if (this.#getActiveSessionID() !== completionSessionID) continue

      logBenchToggleStep("client-action-ledger-finish-completion-pending-after-failed-complete", {
        action,
        completionToRecord: baseCompletion,
      })
      this.#entries.set(action.actionID, {
        status: LEDGER_STATUS_PENDING_COMPLETION_SESSION,
        action,
        completion: baseCompletion,
      })
      return
    }

    this.#entries.delete(action.actionID)
    this.#removePendingBestEffort(action)
  }

  async #execute(
    action: BenchClientActionV1,
    activeSessionID: string,
  ): Promise<BenchClientActionCompletionDraft> {
    logBenchToggleStep("client-action-ledger-execute-entry", {
      action,
      activeSessionID,
    })
    if (action.sessionID !== activeSessionID) {
      logBenchToggleStep("client-action-ledger-execute-inactive-session", {
        action,
        activeSessionID,
      })
      return inactiveSessionCompletion()
    }
    if (action.command.type === "close") {
      const result = await this.#controller.execute(
        { type: "close" },
        { origin: action.acknowledgement === "best-effort" ? "auto-open" : "agent" },
      )
      logBenchToggleStep("client-action-ledger-execute-close-result", {
        action,
        result,
      })
      return completionFromResult(result)
    }
    const autoOpen = bestEffortAutoOpenIdentity(action)
    logBenchToggleStep("client-action-ledger-execute-present-before-controller", {
      action,
      autoOpen,
    })
    const result = await this.#controller.execute(
      {
        type: "present",
        directory: action.directory,
        target: action.command.target,
        mode: BENCH_MODE_REQUEST_POLICY,
      },
      {
        origin: action.acknowledgement === "best-effort" ? "auto-open" : "agent",
        autoOpen,
      },
    )
    logBenchToggleStep("client-action-ledger-execute-present-result", {
      action,
      autoOpen,
      result,
    })
    return completionFromResult(result)
  }

  async #complete(
    action: BenchClientActionV1,
    completion: BenchClientActionCompletionDraft,
  ): Promise<boolean> {
    logBenchToggleStep("client-action-ledger-complete-entry", {
      action,
      completion,
    })
    const completed = await this.#lifecycle.completeClientAction({
      actionID: action.actionID,
      sessionID: action.sessionID,
      completion,
      getActiveSessionID: this.#getActiveSessionID,
    })
    logBenchToggleStep("client-action-ledger-complete-result", {
      action,
      completion,
      completed,
    })
    return completed
  }

  #recordTerminal(actionID: string, completion: BenchClientActionCompletionDraft): void {
    logBenchToggleStep("client-action-ledger-record-terminal", {
      actionID,
      completion,
    })
    this.#entries.set(actionID, {
      status: LEDGER_STATUS_TERMINAL,
      completion,
      usedAt: this.#nextTerminalSequence(),
    })
    this.#evictTerminalEntries()
  }

  #queuePendingSessionAction(action: BenchClientActionV1): void {
    logBenchToggleStep("client-action-ledger-queue-pending-session-entry", {
      action,
    })
    if (action.acknowledgement === "best-effort") {
      const key = bestEffortCoalescingKey(action)
      if (!key) {
        logBenchToggleStep("client-action-ledger-queue-pending-session-best-effort-no-key", {
          action,
        })
        return
      }
      const previousActionID = this.#pendingBestEffortActionIDByKey.get(key)
      if (previousActionID) this.#entries.delete(previousActionID)
      this.#pendingBestEffortActionIDByKey.set(key, action.actionID)
      logBenchToggleStep("client-action-ledger-queue-pending-session-best-effort-key", {
        action,
        key,
        previousActionID,
      })
    }
    this.#entries.set(action.actionID, {
      status: LEDGER_STATUS_PENDING_SESSION,
      action,
    })
    logBenchToggleStep("client-action-ledger-queue-pending-session-exit", {
      action,
      entryCount: this.#entries.size,
    })
  }

  #removePendingBestEffort(action: BenchClientActionV1): void {
    const key = bestEffortCoalescingKey(action)
    if (!key) return
    if (this.#pendingBestEffortActionIDByKey.get(key) === action.actionID) {
      this.#pendingBestEffortActionIDByKey.delete(key)
      logBenchToggleStep("client-action-ledger-remove-pending-best-effort", {
        action,
        key,
      })
    }
  }

  #nextTerminalSequence(): number {
    this.#terminalSequence += 1
    return this.#terminalSequence
  }

  #evictTerminalEntries(): void {
    const terminalEntries = Array.from(this.#entries.entries()).filter(
      (entry): entry is [string, Extract<LedgerEntry, { status: typeof LEDGER_STATUS_TERMINAL }>] =>
        entry[1].status === LEDGER_STATUS_TERMINAL,
    )
    if (terminalEntries.length <= BENCH_CLIENT_ACTION_LEDGER_LIMIT) return
    const evicted = terminalEntries
      .toSorted((left, right) => left[1].usedAt - right[1].usedAt)
      .slice(0, terminalEntries.length - BENCH_CLIENT_ACTION_LEDGER_LIMIT)
    logBenchToggleStep("client-action-ledger-evict-terminal-entries", {
      terminalEntryCount: terminalEntries.length,
      evictedActionIDs: evicted.map(([actionID]) => actionID),
    })
    for (const [actionID] of evicted) {
      this.#entries.delete(actionID)
    }
  }
}

export { readBenchClientActionEvent, readBenchClientLeaseEvent }
export type { BenchClientActionV1 }
