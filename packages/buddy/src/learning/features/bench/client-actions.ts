import path from "node:path"
import { ulid } from "ulid"
import z from "zod"
import {
  BenchClientLeaseIdentitySchema,
  BenchReadContextOutputSchema,
  BenchTargetSchema,
  publishSequencedBenchContext,
  type BenchClientLeaseIdentity,
} from "./context"

const BENCH_CLIENT_ACTION_VERSION = 1
const REQUIRED_ACTION_TIMEOUT_MS = 30_000
const TERMINAL_TOMBSTONE_TTL_MS = 5 * 60_000
const TERMINAL_TOMBSTONE_LIMIT = 512
const BENCH_CLIENT_ACTION_ID_PREFIX = "bench_action"
const SSE_EVENT_TYPE_CLIENT_ACTION = "bench.client_action"
const SSE_EVENT_TYPE_CLIENT_LEASE = "bench.client_lease"
const ACTION_STATE_PENDING = "pending"
const ACTION_STATE_DELIVERED = "delivered"
const ACTION_STATE_COMPLETED = "completed"
const ACTION_STATE_CANCELLED = "cancelled"
const ACTION_STATE_EXPIRED = "expired"

const BenchRouteSnapshotSchema = z.union([
  z
    .object({
      status: z.literal("closed"),
    })
    .strict(),
  z
    .object({
      status: z.literal("open"),
      target: BenchTargetSchema,
      mode: z.enum(["docked", "floating"]),
    })
    .strict(),
])

const BenchClientActionCommandSchema = z.union([
  z
    .object({
      type: z.literal("present"),
      target: BenchTargetSchema,
    })
    .strict(),
  z
    .object({
      type: z.literal("close"),
    })
    .strict(),
])

const BenchClientActionSchema = z
  .object({
    version: z.literal(BENCH_CLIENT_ACTION_VERSION),
    actionID: z.string().min(1),
    directory: z.string().min(1),
    sessionID: z.string().min(1),
    messageID: z.string().min(1),
    callID: z.string().min(1).nullable(),
    origin: z.enum(["agent", "auto-open"]),
    acknowledgement: z.enum(["required", "best-effort"]),
    expiresAt: z.number().int().positive(),
    command: BenchClientActionCommandSchema,
  })
  .strict()

const BenchClientLeaseSchema = z
  .object({
    instanceID: z.string().min(1),
    generation: z.number().int().nonnegative(),
    leaseEpoch: z.number().int().positive(),
    directory: z.string().min(1),
  })
  .strict()

const BenchClientActionCompletionCommittedSchema = z
  .object({
    outcome: z.literal("committed"),
    lease: BenchClientLeaseIdentitySchema,
    publicationSequence: z.number().int().positive(),
    observedRoute: BenchRouteSnapshotSchema,
    observedVisibility: z.enum(["visible", "parked", "closed"]),
    drawer: z.enum(["explorer", "library"]).nullable(),
    context: BenchReadContextOutputSchema,
    changed: z.boolean(),
  })
  .strict()

const BenchClientActionCompletionTerminalSchema = z
  .object({
    outcome: z.enum(["blocked", "failed", "inactive_session", "superseded"]),
    lease: BenchClientLeaseIdentitySchema,
    reason: z.enum([
      "leave_guard_blocked",
      "navigation_failed",
      "context_sync_failed",
      "session_inactive",
      "newer_command",
    ]),
  })
  .strict()

const BenchClientActionCompletionSchema = z.union([
  BenchClientActionCompletionCommittedSchema,
  BenchClientActionCompletionTerminalSchema,
])

const BenchClientActionCompletionResponseSchema = z
  .object({
    status: z.enum(["completed", "already_completed", "expired", "conflict"]),
  })
  .strict()

const BenchClientLeaseReleaseResponseSchema = z
  .object({
    released: z.boolean(),
  })
  .strict()

type BenchRouteSnapshot = z.infer<typeof BenchRouteSnapshotSchema>
type BenchClientActionCommand = z.infer<typeof BenchClientActionCommandSchema>
type BenchClientAction = z.infer<typeof BenchClientActionSchema>
type BenchClientLease = z.infer<typeof BenchClientLeaseSchema>
type BenchClientActionCompletion = z.infer<typeof BenchClientActionCompletionSchema>
type BenchClientActionCompletionResponse = z.infer<
  typeof BenchClientActionCompletionResponseSchema
>
type BenchClientLeaseReleaseResponse = z.infer<typeof BenchClientLeaseReleaseResponseSchema>

type BenchBrokerClockTimer = () => void

type BenchBrokerClock = {
  now(): number
  setTimeout(callback: () => void, delayMs: number): BenchBrokerClockTimer
  clearTimeout(timer: BenchBrokerClockTimer): void
}

type BenchClientActionState =
  | typeof ACTION_STATE_PENDING
  | typeof ACTION_STATE_DELIVERED
  | typeof ACTION_STATE_COMPLETED
  | typeof ACTION_STATE_CANCELLED
  | typeof ACTION_STATE_EXPIRED

type BenchClientActionListener = (event: BenchClientSseEvent) => void

type BenchClientSseEvent =
  | {
      directory: string
      payload: {
        type: typeof SSE_EVENT_TYPE_CLIENT_ACTION
        properties: {
          action: BenchClientAction
        }
      }
    }
  | {
      directory: string
      payload: {
        type: typeof SSE_EVENT_TYPE_CLIENT_LEASE
        properties: {
          lease: BenchClientLease
        }
      }
    }

type BenchBrokerTerminal =
  | {
      status: "completed"
      completion: BenchClientActionCompletion
    }
  | {
      status: "cancelled"
    }
  | {
      status: "expired"
      delivered: boolean
    }

type BenchClientActionEntry = {
  action: BenchClientAction
  state: BenchClientActionState
  delivered: boolean
  completionKey: string | null
  terminal: BenchBrokerTerminal | null
  expiryTimer: BenchBrokerClockTimer | null
  resolve: (terminal: BenchBrokerTerminal) => void
}

type BenchClientActionTombstone = {
  actionID: string
  sessionID: string
  completedAt: number
  expiresAt: number
  completionKey: string | null
  response: BenchClientActionCompletionResponse
}

type BenchBrokerDirectoryState = {
  directory: string
  lease: BenchClientLease | null
  nextLeaseEpoch: number
  subscribers: Map<string, BenchClientActionListener>
  actions: Map<string, BenchClientActionEntry>
  tombstones: Map<string, BenchClientActionTombstone>
}

type EnqueueRequiredActionInput = {
  directory: string
  sessionID: string
  messageID: string
  callID: string | null
  command: BenchClientActionCommand
}

type EnqueuedRequiredAction = {
  action: BenchClientAction
  completion: Promise<BenchBrokerTerminal>
}

type ConnectLeaseInput = {
  directory: string
  instanceID: string
  generation: number
}

type CompleteActionInput = {
  directory: string
  actionID: string
  completion: BenchClientActionCompletion
}

class BenchClientLeaseConflictError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "BenchClientLeaseConflictError"
  }
}

function defaultBenchBrokerClock(): BenchBrokerClock {
  return {
    now: () => Date.now(),
    setTimeout(callback, delayMs) {
      const timer = globalThis.setTimeout(callback, delayMs)
      return () => globalThis.clearTimeout(timer)
    },
    clearTimeout(timer) {
      timer()
    },
  }
}

function ignoreBenchBrokerTerminal(_terminal: BenchBrokerTerminal): void {
  return undefined
}

function createBenchBrokerDeferred(): {
  completion: Promise<BenchBrokerTerminal>
  resolve: (terminal: BenchBrokerTerminal) => void
} {
  let resolveCompletion: (terminal: BenchBrokerTerminal) => void = ignoreBenchBrokerTerminal
  const completion = new Promise<BenchBrokerTerminal>((resolve) => {
    resolveCompletion = resolve
  })
  return {
    completion,
    resolve: resolveCompletion,
  }
}

function directoryKey(directory: string): string {
  return path.resolve(directory)
}

function leaseIdentityKey(lease: BenchClientLeaseIdentity): string {
  return [lease.instanceID, String(lease.generation), String(lease.leaseEpoch)].join("\u0000")
}

function actionTombstoneKey(input: { sessionID: string; actionID: string }): string {
  return [input.sessionID, input.actionID].join("\u0000")
}

function completionKey(completion: BenchClientActionCompletion): string {
  return JSON.stringify(BenchClientActionCompletionSchema.parse(completion))
}

function isSameLeaseIdentity(left: BenchClientLease, right: BenchClientLeaseIdentity): boolean {
  return (
    left.instanceID === right.instanceID &&
    left.generation === right.generation &&
    left.leaseEpoch === right.leaseEpoch
  )
}

function isSameTarget(left: z.infer<typeof BenchTargetSchema>, right: z.infer<typeof BenchTargetSchema>): boolean {
  return JSON.stringify(BenchTargetSchema.parse(left)) === JSON.stringify(BenchTargetSchema.parse(right))
}

function commandMatchesCommittedCompletion(
  action: BenchClientAction,
  completion: Extract<BenchClientActionCompletion, { outcome: "committed" }>,
): boolean {
  if (action.command.type === "close") {
    return (
      completion.observedRoute.status === "closed" &&
      completion.observedVisibility === "closed" &&
      completion.context.status === "closed"
    )
  }

  if (completion.observedRoute.status !== "open") return false
  if (completion.observedVisibility !== "visible") return false
  if (completion.context.status !== "open") return false

  return (
    isSameTarget(completion.observedRoute.target, action.command.target) &&
    isSameTarget(
      action.command.target,
      completion.context.target.type === "workspace-file"
        ? {
            type: "workspace-file",
            path: completion.context.target.path,
            viewer: completion.context.target.path.toLowerCase().endsWith(".md") ? "markdown" : "file",
          }
        : {
            type: "object",
            ref: completion.context.target.ref,
            viewID: completion.context.target.viewID,
          },
    )
  )
}

function benchClientActionEvent(input: {
  directory: string
  action: BenchClientAction
}): BenchClientSseEvent {
  return {
    directory: input.directory,
    payload: {
      type: SSE_EVENT_TYPE_CLIENT_ACTION,
      properties: {
        action: input.action,
      },
    },
  }
}

function benchClientLeaseEvent(input: {
  directory: string
  lease: BenchClientLease
}): BenchClientSseEvent {
  return {
    directory: input.directory,
    payload: {
      type: SSE_EVENT_TYPE_CLIENT_LEASE,
      properties: {
        lease: input.lease,
      },
    },
  }
}

export class BenchClientActionBroker {
  readonly #clock: BenchBrokerClock
  #directories = new Map<string, BenchBrokerDirectoryState>()

  constructor(input?: { clock?: BenchBrokerClock }) {
    this.#clock = input?.clock ?? defaultBenchBrokerClock()
  }

  reset(): void {
    for (const state of this.#directories.values()) {
      for (const entry of state.actions.values()) {
        this.#clearExpiry(entry)
      }
    }
    this.#directories.clear()
  }

  connectLease(input: ConnectLeaseInput): BenchClientLease {
    const state = this.#state(input.directory)
    const current = state.lease
    if (
      current &&
      current.instanceID === input.instanceID &&
      input.generation <= current.generation
    ) {
      return current
    }

    state.nextLeaseEpoch += 1
    const lease = BenchClientLeaseSchema.parse({
      instanceID: input.instanceID,
      generation: input.generation,
      leaseEpoch: state.nextLeaseEpoch,
      directory: state.directory,
    })
    state.lease = lease
    this.#deliverEligibleActions(state)
    return lease
  }

  subscribe(input: {
    directory: string
    lease: BenchClientLease
    listener: BenchClientActionListener
  }): () => void {
    const state = this.#state(input.directory)
    if (!state.lease || !isSameLeaseIdentity(state.lease, input.lease)) {
      return () => undefined
    }

    const key = leaseIdentityKey(input.lease)
    state.subscribers.set(key, input.listener)
    input.listener(benchClientLeaseEvent({ directory: state.directory, lease: input.lease }))
    this.#deliverEligibleActions(state)

    return () => {
      const current = state.subscribers.get(key)
      if (current === input.listener) {
        state.subscribers.delete(key)
      }
    }
  }

  releaseLease(input: {
    directory: string
    instanceID: string
    generation: number
    leaseEpoch: number
  }): BenchClientLeaseReleaseResponse {
    const state = this.#state(input.directory)
    const current = state.lease
    if (
      current &&
      current.instanceID === input.instanceID &&
      current.generation === input.generation &&
      current.leaseEpoch === input.leaseEpoch
    ) {
      state.lease = null
      state.subscribers.delete(leaseIdentityKey(current))
      return { released: true }
    }
    return { released: false }
  }

  validateLease(input: {
    directory: string
    lease: BenchClientLeaseIdentity
  }): boolean {
    const state = this.#state(input.directory)
    return Boolean(state.lease && isSameLeaseIdentity(state.lease, input.lease))
  }

  enqueueRequiredAction(input: EnqueueRequiredActionInput): EnqueuedRequiredAction {
    const state = this.#state(input.directory)
    this.#evictTombstones(state)
    const action = BenchClientActionSchema.parse({
      version: BENCH_CLIENT_ACTION_VERSION,
      actionID: `${BENCH_CLIENT_ACTION_ID_PREFIX}_${ulid()}`,
      directory: state.directory,
      sessionID: input.sessionID,
      messageID: input.messageID,
      callID: input.callID,
      origin: "agent",
      acknowledgement: "required",
      expiresAt: this.#clock.now() + REQUIRED_ACTION_TIMEOUT_MS,
      command: input.command,
    })

    const deferred = createBenchBrokerDeferred()
    const entry: BenchClientActionEntry = {
      action,
      state: ACTION_STATE_PENDING,
      delivered: false,
      completionKey: null,
      terminal: null,
      expiryTimer: null,
      resolve: deferred.resolve,
    }
    entry.expiryTimer = this.#clock.setTimeout(() => {
      this.#expireAction(action.directory, action.actionID)
    }, Math.max(0, action.expiresAt - this.#clock.now()))

    state.actions.set(action.actionID, entry)
    this.#deliverEligibleActions(state)
    return { action, completion: deferred.completion }
  }

  enqueueBestEffortAction(input: EnqueueRequiredActionInput): BenchClientAction | null {
    const state = this.#state(input.directory)
    const lease = state.lease
    if (!lease) return null
    const subscriber = state.subscribers.get(leaseIdentityKey(lease))
    if (!subscriber) return null

    const action = BenchClientActionSchema.parse({
      version: BENCH_CLIENT_ACTION_VERSION,
      actionID: `${BENCH_CLIENT_ACTION_ID_PREFIX}_${ulid()}`,
      directory: state.directory,
      sessionID: input.sessionID,
      messageID: input.messageID,
      callID: input.callID,
      origin: "auto-open",
      acknowledgement: "best-effort",
      expiresAt: this.#clock.now() + REQUIRED_ACTION_TIMEOUT_MS,
      command: input.command,
    })
    subscriber(benchClientActionEvent({ directory: state.directory, action }))
    return action
  }

  completeAction(input: CompleteActionInput): BenchClientActionCompletionResponse {
    const state = this.#state(input.directory)
    this.#evictTombstones(state)
    const parsed = BenchClientActionCompletionSchema.parse(input.completion)
    const currentLease = state.lease
    if (!currentLease || !isSameLeaseIdentity(currentLease, parsed.lease)) {
      return { status: "conflict" }
    }

    const entry = state.actions.get(input.actionID)
    const key = completionKey(parsed)
    if (!entry) {
      return this.#completionResponseFromTombstone(state, input.actionID, key)
    }
    if (entry.terminal) {
      return entry.completionKey === key ? { status: "already_completed" } : { status: "conflict" }
    }
    if (parsed.outcome === "committed" && !commandMatchesCommittedCompletion(entry.action, parsed)) {
      return { status: "conflict" }
    }

    if (parsed.outcome === "committed") {
      try {
        publishSequencedBenchContext({
          directory: state.directory,
          sessionID: entry.action.sessionID,
          body: {
            lease: parsed.lease,
            publicationSequence: parsed.publicationSequence,
            idempotencyKey: entry.action.actionID,
            value: parsed.context,
          },
        })
      } catch {
        const failedCompletion = BenchClientActionCompletionSchema.parse({
          outcome: "failed",
          lease: parsed.lease,
          reason: "context_sync_failed",
        })
        this.#settleCompleted(state, entry, failedCompletion, completionKey(failedCompletion))
        return { status: "completed" }
      }
    }

    this.#settleCompleted(state, entry, parsed, key)
    return { status: "completed" }
  }

  cancelAction(input: { directory: string; actionID: string }): void {
    const state = this.#state(input.directory)
    const entry = state.actions.get(input.actionID)
    if (!entry || entry.terminal) return
    entry.state = ACTION_STATE_CANCELLED
    this.#settle(state, entry, {
      status: "cancelled",
    })
  }

  #state(directory: string): BenchBrokerDirectoryState {
    const key = directoryKey(directory)
    const current = this.#directories.get(key)
    if (current) return current
    const state: BenchBrokerDirectoryState = {
      directory: key,
      lease: null,
      nextLeaseEpoch: 0,
      subscribers: new Map(),
      actions: new Map(),
      tombstones: new Map(),
    }
    this.#directories.set(key, state)
    return state
  }

  #deliverEligibleActions(state: BenchBrokerDirectoryState): void {
    const lease = state.lease
    if (!lease) return
    const subscriber = state.subscribers.get(leaseIdentityKey(lease))
    if (!subscriber) return

    for (const entry of state.actions.values()) {
      if (entry.action.acknowledgement !== "required") continue
      if (entry.terminal) continue
      if (entry.action.expiresAt <= this.#clock.now()) {
        this.#expireEntry(state, entry)
        continue
      }
      entry.state = ACTION_STATE_DELIVERED
      entry.delivered = true
      subscriber(benchClientActionEvent({ directory: state.directory, action: entry.action }))
    }
  }

  #completionResponseFromTombstone(
    state: BenchBrokerDirectoryState,
    actionID: string,
    key: string,
  ): BenchClientActionCompletionResponse {
    for (const tombstone of state.tombstones.values()) {
      if (tombstone.actionID !== actionID) continue
      if (tombstone.response.status === "expired") return { status: "expired" }
      if (tombstone.completionKey === key) return { status: "already_completed" }
      return { status: "conflict" }
    }
    return { status: "conflict" }
  }

  #settleCompleted(
    state: BenchBrokerDirectoryState,
    entry: BenchClientActionEntry,
    completion: BenchClientActionCompletion,
    key: string,
  ): void {
    entry.state = ACTION_STATE_COMPLETED
    entry.completionKey = key
    this.#settle(state, entry, {
      status: "completed",
      completion,
    })
  }

  #expireAction(directory: string, actionID: string): void {
    const state = this.#state(directory)
    const entry = state.actions.get(actionID)
    if (!entry || entry.terminal) return
    this.#expireEntry(state, entry)
  }

  #expireEntry(state: BenchBrokerDirectoryState, entry: BenchClientActionEntry): void {
    entry.state = ACTION_STATE_EXPIRED
    this.#settle(state, entry, {
      status: "expired",
      delivered: entry.delivered,
    })
  }

  #settle(
    state: BenchBrokerDirectoryState,
    entry: BenchClientActionEntry,
    terminal: BenchBrokerTerminal,
  ): void {
    if (entry.terminal) return
    entry.terminal = terminal
    this.#clearExpiry(entry)
    state.actions.delete(entry.action.actionID)
    this.#recordTombstone(state, entry)
    entry.resolve(terminal)
  }

  #recordTombstone(state: BenchBrokerDirectoryState, entry: BenchClientActionEntry): void {
    const response: BenchClientActionCompletionResponse =
      entry.state === ACTION_STATE_EXPIRED ? { status: "expired" } : { status: "completed" }
    const key = actionTombstoneKey({
      sessionID: entry.action.sessionID,
      actionID: entry.action.actionID,
    })
    state.tombstones.delete(key)
    state.tombstones.set(key, {
      actionID: entry.action.actionID,
      sessionID: entry.action.sessionID,
      completedAt: this.#clock.now(),
      expiresAt: this.#clock.now() + TERMINAL_TOMBSTONE_TTL_MS,
      completionKey: entry.completionKey,
      response,
    })
    this.#evictTombstones(state)
  }

  #evictTombstones(state: BenchBrokerDirectoryState): void {
    const now = this.#clock.now()
    for (const [key, tombstone] of state.tombstones) {
      if (tombstone.expiresAt <= now) {
        state.tombstones.delete(key)
      }
    }
    while (state.tombstones.size > TERMINAL_TOMBSTONE_LIMIT) {
      const oldestKey = state.tombstones.keys().next().value
      if (typeof oldestKey !== "string") return
      state.tombstones.delete(oldestKey)
    }
  }

  #clearExpiry(entry: BenchClientActionEntry): void {
    if (!entry.expiryTimer) return
    this.#clock.clearTimeout(entry.expiryTimer)
    entry.expiryTimer = null
  }
}

const benchClientActionBroker = new BenchClientActionBroker()

export {
  BenchClientActionCompletionResponseSchema,
  BenchClientActionCompletionSchema,
  BenchClientActionSchema,
  BenchClientLeaseReleaseResponseSchema,
  BenchClientLeaseSchema,
  BenchClientLeaseConflictError,
  BenchRouteSnapshotSchema,
  SSE_EVENT_TYPE_CLIENT_ACTION,
  SSE_EVENT_TYPE_CLIENT_LEASE,
  benchClientActionBroker,
}

export type {
  BenchBrokerClock,
  BenchBrokerTerminal,
  BenchClientAction,
  BenchClientActionCommand,
  BenchClientActionCompletion,
  BenchClientActionCompletionResponse,
  BenchClientActionListener,
  BenchClientLease,
  BenchClientLeaseReleaseResponse,
  BenchClientSseEvent,
  BenchRouteSnapshot,
}
