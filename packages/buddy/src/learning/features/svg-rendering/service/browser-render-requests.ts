import { createHash } from "node:crypto"
import { ulid } from "ulid"
import { publishGlobalEvent } from "@buddy/opencode-adapter/global-event"
import { resolveDirectory } from "@buddy/backend/project"
import {
  BrowserSvgRenderCompletionSchema,
  BrowserSvgRenderRequestSchema,
  SVG_RENDER_MAX_PENDING_REQUESTS_PER_DIRECTORY,
  SVG_RENDER_MAX_PENDING_REQUESTS_TOTAL,
  SVG_RENDER_REQUEST_EVENT_TYPE,
  SVG_RENDER_REQUEST_ID_PREFIX,
  SVG_RENDER_REQUEST_TIMEOUT_MS,
  SVG_RENDER_REQUEST_VERSION,
  SVG_RENDER_TERMINAL_TOMBSTONE_LIMIT,
  SVG_RENDER_TERMINAL_TOMBSTONE_TOTAL_LIMIT,
  SVG_RENDER_TERMINAL_TOMBSTONE_TTL_MS,
  type BrowserSvgRenderCompletion,
  type BrowserSvgRenderCompletionResponse,
  type BrowserSvgRenderRequest,
  type BrowserSvgSourceFormat,
} from "./contracts"

type BrowserSvgRenderRequestTimer = () => void

type BrowserSvgRenderRequestClock = {
  now(): number
  setTimeout(callback: () => void, delayMs: number): BrowserSvgRenderRequestTimer
  clearTimeout(timer: BrowserSvgRenderRequestTimer): void
}

type BrowserSvgRenderEvent = {
  directory: string
  payload: {
    type: typeof SVG_RENDER_REQUEST_EVENT_TYPE
    properties: {
      requestID: string
    }
  }
}

type BrowserSvgRenderTerminal =
  | {
      status: "completed"
      svg: string
      warnings: string[]
    }
  | {
      status: "failed"
      error: string
    }
  | {
      status: "expired"
    }
  | {
      status: "cancelled"
    }

type BrowserSvgRenderRequestEntry = {
  request: BrowserSvgRenderRequest
  completionKey: string | null
  terminal: BrowserSvgRenderTerminal | null
  expiryTimer: BrowserSvgRenderRequestTimer | null
  abortSignal: AbortSignal | null
  abortListener: (() => void) | null
  resolve: (terminal: BrowserSvgRenderTerminal) => void
}

type BrowserSvgRenderRequestTombstone = {
  completionKey: string | null
  response: BrowserSvgRenderCompletionResponse
  expiresAt: number
}

type BrowserSvgRenderRequestDirectoryState = {
  directory: string
  requests: Map<string, BrowserSvgRenderRequestEntry>
  tombstones: Map<string, BrowserSvgRenderRequestTombstone>
  cleanupTimer: BrowserSvgRenderRequestTimer | null
}

type EnqueueBrowserSvgRenderInput = {
  directory: string
  format: BrowserSvgSourceFormat
  source: string
  sourceHash: string
  signal?: AbortSignal
}

type EnqueuedBrowserSvgRender = {
  request: BrowserSvgRenderRequest
  completion: Promise<BrowserSvgRenderTerminal>
}

function defaultBrowserSvgRenderRequestClock(): BrowserSvgRenderRequestClock {
  return {
    now: () => Date.now(),
    setTimeout(callback, delayMs) {
      const timer = globalThis.setTimeout(callback, delayMs)
      timer.unref?.()
      return () => globalThis.clearTimeout(timer)
    },
    clearTimeout(timer) {
      timer()
    },
  }
}

function ignoreBrowserSvgRenderTerminal(_terminal: BrowserSvgRenderTerminal): void {
  return undefined
}

function createBrowserSvgRenderDeferred(): {
  completion: Promise<BrowserSvgRenderTerminal>
  resolve: (terminal: BrowserSvgRenderTerminal) => void
} {
  let resolveCompletion: (terminal: BrowserSvgRenderTerminal) => void =
    ignoreBrowserSvgRenderTerminal
  const completion = new Promise<BrowserSvgRenderTerminal>((resolve) => {
    resolveCompletion = resolve
  })
  return {
    completion,
    resolve: resolveCompletion,
  }
}

function requestEvent(request: BrowserSvgRenderRequest): BrowserSvgRenderEvent {
  return {
    directory: request.directory,
    payload: {
      type: SVG_RENDER_REQUEST_EVENT_TYPE,
      properties: { requestID: request.requestID },
    },
  }
}

function completionKey(completion: BrowserSvgRenderCompletion): string {
  return createHash("sha256").update(JSON.stringify(completion)).digest("hex")
}

export class BrowserSvgRenderRequests {
  readonly #clock: BrowserSvgRenderRequestClock
  #directories = new Map<string, BrowserSvgRenderRequestDirectoryState>()
  #pendingRequestCount = 0
  #tombstoneOrder = new Map<
    string,
    { state: BrowserSvgRenderRequestDirectoryState; requestID: string }
  >()

  constructor(input?: { clock?: BrowserSvgRenderRequestClock }) {
    this.#clock = input?.clock ?? defaultBrowserSvgRenderRequestClock()
  }

  reset(): void {
    for (const state of this.#directories.values()) {
      for (const entry of state.requests.values()) {
        this.#settle(state, entry, { status: "cancelled" }, null)
      }
      if (state.cleanupTimer) {
        this.#clock.clearTimeout(state.cleanupTimer)
        state.cleanupTimer = null
      }
    }
    this.#directories.clear()
    this.#pendingRequestCount = 0
    this.#tombstoneOrder.clear()
  }

  enqueue(input: EnqueueBrowserSvgRenderInput): EnqueuedBrowserSvgRender {
    input.signal?.throwIfAborted()
    if (this.#pendingRequestCount >= SVG_RENDER_MAX_PENDING_REQUESTS_TOTAL) {
      throw new Error("The browser SVG renderer has too many pending requests globally.")
    }
    const state = this.#state(input.directory)
    this.#evictTombstones(state)
    if (state.requests.size >= SVG_RENDER_MAX_PENDING_REQUESTS_PER_DIRECTORY) {
      throw new Error("The browser SVG renderer has too many pending requests.")
    }

    const request = BrowserSvgRenderRequestSchema.parse({
      version: SVG_RENDER_REQUEST_VERSION,
      requestID: `${SVG_RENDER_REQUEST_ID_PREFIX}_${ulid()}`,
      directory: state.directory,
      sourceHash: input.sourceHash,
      format: input.format,
      source: input.source,
      expiresAt: this.#clock.now() + SVG_RENDER_REQUEST_TIMEOUT_MS,
    })
    const deferred = createBrowserSvgRenderDeferred()
    const entry: BrowserSvgRenderRequestEntry = {
      request,
      completionKey: null,
      terminal: null,
      expiryTimer: null,
      abortSignal: input.signal ?? null,
      abortListener: null,
      resolve: deferred.resolve,
    }
    entry.expiryTimer = this.#clock.setTimeout(
      () => this.#expireRequest(state.directory, request.requestID),
      Math.max(0, request.expiresAt - this.#clock.now()),
    )
    if (input.signal) {
      entry.abortListener = () =>
        this.cancel({
          directory: state.directory,
          requestID: request.requestID,
        })
      input.signal.addEventListener("abort", entry.abortListener, { once: true })
    }

    state.requests.set(request.requestID, entry)
    this.#pendingRequestCount += 1
    if (input.signal?.aborted) {
      this.cancel({ directory: state.directory, requestID: request.requestID })
    } else {
      this.#deliver(state, entry)
    }

    return {
      request,
      completion: deferred.completion,
    }
  }

  complete(input: {
    directory: string
    requestID: string
    completion: BrowserSvgRenderCompletion
  }): BrowserSvgRenderCompletionResponse {
    const parsed = BrowserSvgRenderCompletionSchema.parse(input.completion)
    const state = this.#directories.get(resolveDirectory(input.directory))
    if (!state) return { status: "conflict" }
    this.#evictTombstones(state)
    const key = completionKey(parsed)
    const entry = state.requests.get(input.requestID)
    if (!entry) {
      const response = this.#completionFromTombstone(state, input.requestID, key)
      this.#releaseStateIfEmpty(state)
      return response
    }
    if (entry.request.sourceHash !== parsed.sourceHash) {
      return { status: "conflict" }
    }

    const terminal: BrowserSvgRenderTerminal =
      parsed.outcome === "rendered"
        ? {
            status: "completed",
            svg: parsed.svg,
            warnings: [...parsed.warnings],
          }
        : {
            status: "failed",
            error: parsed.error,
          }
    this.#settle(state, entry, terminal, key)
    return { status: "completed" }
  }

  cancel(input: { directory: string; requestID: string }): void {
    const state = this.#directories.get(resolveDirectory(input.directory))
    if (!state) return
    const entry = state.requests.get(input.requestID)
    if (!entry) return
    this.#settle(state, entry, { status: "cancelled" }, null)
  }

  listPending(directory: string): BrowserSvgRenderRequest[] {
    const state = this.#directories.get(resolveDirectory(directory))
    if (!state) return []
    this.#evictTombstones(state)
    const requests: BrowserSvgRenderRequest[] = []
    for (const entry of state.requests.values()) {
      if (entry.request.expiresAt <= this.#clock.now()) {
        this.#expireEntry(state, entry)
        continue
      }
      requests.push(entry.request)
    }
    this.#releaseStateIfEmpty(state)
    return requests
  }

  #state(directory: string): BrowserSvgRenderRequestDirectoryState {
    const key = resolveDirectory(directory)
    const current = this.#directories.get(key)
    if (current) return current
    const state: BrowserSvgRenderRequestDirectoryState = {
      directory: key,
      requests: new Map(),
      tombstones: new Map(),
      cleanupTimer: null,
    }
    this.#directories.set(key, state)
    return state
  }

  #deliver(
    state: BrowserSvgRenderRequestDirectoryState,
    entry: BrowserSvgRenderRequestEntry,
  ): void {
    if (entry.terminal) return
    if (entry.request.expiresAt <= this.#clock.now()) {
      this.#expireEntry(state, entry)
      return
    }
    publishGlobalEvent(requestEvent(entry.request))
  }

  #expireRequest(directory: string, requestID: string): void {
    const state = this.#directories.get(resolveDirectory(directory))
    if (!state) return
    const entry = state.requests.get(requestID)
    if (!entry) return
    this.#expireEntry(state, entry)
  }

  #expireEntry(
    state: BrowserSvgRenderRequestDirectoryState,
    entry: BrowserSvgRenderRequestEntry,
  ): void {
    this.#settle(state, entry, { status: "expired" }, null)
  }

  #settle(
    state: BrowserSvgRenderRequestDirectoryState,
    entry: BrowserSvgRenderRequestEntry,
    terminal: BrowserSvgRenderTerminal,
    key: string | null,
  ): void {
    if (entry.terminal) return
    entry.terminal = terminal
    entry.completionKey = key
    this.#clearLifecycle(entry)
    if (state.requests.delete(entry.request.requestID)) {
      this.#pendingRequestCount -= 1
    }
    this.#recordTombstone(state, entry)
    entry.resolve(terminal)
  }

  #clearLifecycle(entry: BrowserSvgRenderRequestEntry): void {
    if (entry.expiryTimer) {
      this.#clock.clearTimeout(entry.expiryTimer)
      entry.expiryTimer = null
    }
    if (entry.abortSignal && entry.abortListener) {
      entry.abortSignal.removeEventListener("abort", entry.abortListener)
      entry.abortListener = null
    }
  }

  #recordTombstone(
    state: BrowserSvgRenderRequestDirectoryState,
    entry: BrowserSvgRenderRequestEntry,
  ): void {
    const response: BrowserSvgRenderCompletionResponse =
      entry.terminal?.status === "completed" || entry.terminal?.status === "failed"
        ? { status: "completed" }
        : { status: "expired" }
    this.#deleteTombstone(state, entry.request.requestID)
    state.tombstones.set(entry.request.requestID, {
      completionKey: entry.completionKey,
      response,
      expiresAt: this.#clock.now() + SVG_RENDER_TERMINAL_TOMBSTONE_TTL_MS,
    })
    this.#tombstoneOrder.set(entry.request.requestID, {
      state,
      requestID: entry.request.requestID,
    })
    this.#evictTombstones(state)
    this.#evictGlobalTombstones()
  }

  #completionFromTombstone(
    state: BrowserSvgRenderRequestDirectoryState,
    requestID: string,
    key: string,
  ): BrowserSvgRenderCompletionResponse {
    const tombstone = state.tombstones.get(requestID)
    if (!tombstone) return { status: "conflict" }
    if (tombstone.response.status === "expired") return { status: "expired" }
    if (tombstone.completionKey === key) return { status: "already_completed" }
    return { status: "conflict" }
  }

  #evictTombstones(state: BrowserSvgRenderRequestDirectoryState, releaseEmptyState = false): void {
    const now = this.#clock.now()
    for (const [requestID, tombstone] of state.tombstones) {
      if (tombstone.expiresAt <= now) {
        this.#deleteTombstone(state, requestID)
      }
    }
    while (state.tombstones.size > SVG_RENDER_TERMINAL_TOMBSTONE_LIMIT) {
      const oldestRequestID = state.tombstones.keys().next().value
      if (typeof oldestRequestID !== "string") return
      this.#deleteTombstone(state, oldestRequestID)
    }
    this.#scheduleStateCleanup(state, releaseEmptyState)
  }

  #deleteTombstone(state: BrowserSvgRenderRequestDirectoryState, requestID: string): void {
    state.tombstones.delete(requestID)
    this.#tombstoneOrder.delete(requestID)
  }

  #evictGlobalTombstones(): void {
    while (this.#tombstoneOrder.size > SVG_RENDER_TERMINAL_TOMBSTONE_TOTAL_LIMIT) {
      const oldestRequestID = this.#tombstoneOrder.keys().next().value
      if (typeof oldestRequestID !== "string") return
      const oldest = this.#tombstoneOrder.get(oldestRequestID)
      if (!oldest) {
        this.#tombstoneOrder.delete(oldestRequestID)
        continue
      }
      this.#deleteTombstone(oldest.state, oldest.requestID)
      this.#scheduleStateCleanup(oldest.state, true)
    }
  }

  #scheduleStateCleanup(
    state: BrowserSvgRenderRequestDirectoryState,
    releaseEmptyState: boolean,
  ): void {
    if (state.cleanupTimer) {
      this.#clock.clearTimeout(state.cleanupTimer)
      state.cleanupTimer = null
    }
    const earliestExpiry = Math.min(
      ...Array.from(state.tombstones.values(), (tombstone) => tombstone.expiresAt),
    )
    if (!Number.isFinite(earliestExpiry)) {
      if (releaseEmptyState) this.#releaseStateIfEmpty(state)
      return
    }
    state.cleanupTimer = this.#clock.setTimeout(
      () => {
        state.cleanupTimer = null
        if (this.#directories.get(state.directory) !== state) return
        this.#evictTombstones(state, true)
      },
      Math.max(0, earliestExpiry - this.#clock.now()),
    )
  }

  #releaseStateIfEmpty(state: BrowserSvgRenderRequestDirectoryState): void {
    if (
      state.requests.size === 0 &&
      state.tombstones.size === 0 &&
      this.#directories.get(state.directory) === state
    ) {
      this.#directories.delete(state.directory)
    }
  }
}

const browserSvgRenderRequests = new BrowserSvgRenderRequests()

export { browserSvgRenderRequests }
export type {
  BrowserSvgRenderRequestClock,
  BrowserSvgRenderTerminal,
  BrowserSvgRenderEvent,
  EnqueuedBrowserSvgRender,
}
