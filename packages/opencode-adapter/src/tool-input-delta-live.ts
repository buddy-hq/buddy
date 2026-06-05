import { Context, Effect } from "effect"
import * as Stream from "effect/Stream"
import { makeRuntime } from "opencode/effect/run-service"
import type * as OpenCodeMessageV2 from "opencode/session/message-v2"
import * as OpenCodeSession from "opencode/session/session"
import { withCurrentInstance } from "./effect-runtime"

const WHITEBOARD_CREATE_VIEW_TOOL_ID = "whiteboard_create_view" as const
const TOOL_INPUT_DELTA_EVENT_TYPE = "tool-input-delta" as const
const TOOL_RAW_DELTA_FIELD = "state.raw" as const
const OPENCODE_LLM_SERVICE_TAG = "@opencode/LLM" as const
const MAX_PENDING_WHITEBOARD_TOOL_PARTS_PER_SESSION = 256
const MAX_PENDING_WHITEBOARD_TOOL_PART_SESSIONS = 64
const MAX_PENDING_WHITEBOARD_TOOL_PARTS =
  MAX_PENDING_WHITEBOARD_TOOL_PARTS_PER_SESSION * MAX_PENDING_WHITEBOARD_TOOL_PART_SESSIONS
const PENDING_WHITEBOARD_TOOL_PART_KEY_SEPARATOR = "\u0000"

type PartDelta = Parameters<OpenCodeSession.Interface["updatePartDelta"]>[0]
type LlmService = {
  readonly stream: (input: { sessionID: string }) => Stream.Stream<unknown, unknown>
}
type ToolInputDeltaEvent = {
  type: typeof TOOL_INPUT_DELTA_EVENT_TYPE
  id: string
  name: string
  text: string
}
type PendingWhiteboardToolPartKey = {
  callID: string
  sessionID: string
}

const sessionRuntime = makeRuntime(OpenCodeSession.Service, OpenCodeSession.defaultLayer)
const llmService = Context.Service<LlmService>(OPENCODE_LLM_SERVICE_TAG)
const patchedSessionServices = new WeakSet<OpenCodeSession.Interface>()
const patchedLlmServices = new WeakSet<LlmService>()
const pendingWhiteboardToolParts = new Map<
  string,
  Map<string, Omit<PartDelta, "field" | "delta">>
>()
const pendingWhiteboardToolPartOrder = new Map<string, PendingWhiteboardToolPartKey>()

let patchPromise: Promise<void> | undefined

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
  return isRecord(value) && typeof value.then === "function"
}

function isToolInputDeltaEvent(event: unknown): event is ToolInputDeltaEvent {
  return (
    isRecord(event) &&
    event.type === TOOL_INPUT_DELTA_EVENT_TYPE &&
    typeof event.id === "string" &&
    typeof event.name === "string" &&
    typeof event.text === "string"
  )
}

async function runOpenCodeAppEffect<E, R>(effect: Effect.Effect<void, E, R>): Promise<void> {
  // Keep this as a literal local import so Bun bundles the vendored runtime into
  // compiled sidecars. Non-literal package imports are left unresolved at runtime.
  const appRuntimeModule: unknown = await import("./app-runtime")
  if (!isRecord(appRuntimeModule) || !isRecord(appRuntimeModule.AppRuntime)) {
    throw new Error("OpenCode AppRuntime module is missing")
  }

  const runPromise = appRuntimeModule.AppRuntime.runPromise
  if (typeof runPromise !== "function") {
    throw new Error("OpenCode AppRuntime.runPromise is missing")
  }

  const result: unknown = Reflect.apply(runPromise, appRuntimeModule.AppRuntime, [effect])
  if (!isPromiseLike(result)) {
    throw new Error("OpenCode AppRuntime.runPromise did not return a promise")
  }
  await result
}

function sessionPendingToolParts(sessionID: string): Map<
  string,
  Omit<PartDelta, "field" | "delta">
> {
  const existing = pendingWhiteboardToolParts.get(sessionID)
  if (existing) return existing

  const next = new Map<string, Omit<PartDelta, "field" | "delta">>()
  pendingWhiteboardToolParts.set(sessionID, next)
  return next
}

function pendingWhiteboardToolPartKey(input: PendingWhiteboardToolPartKey): string {
  return `${input.sessionID}${PENDING_WHITEBOARD_TOOL_PART_KEY_SEPARATOR}${input.callID}`
}

function deletePendingWhiteboardToolPart(input: PendingWhiteboardToolPartKey): void {
  const sessionParts = pendingWhiteboardToolParts.get(input.sessionID)
  sessionParts?.delete(input.callID)
  if (sessionParts?.size === 0) {
    pendingWhiteboardToolParts.delete(input.sessionID)
  }

  pendingWhiteboardToolPartOrder.delete(pendingWhiteboardToolPartKey(input))
}

function trackPendingWhiteboardToolPartOrder(input: PendingWhiteboardToolPartKey): void {
  const key = pendingWhiteboardToolPartKey(input)
  pendingWhiteboardToolPartOrder.delete(key)
  pendingWhiteboardToolPartOrder.set(key, input)
}

function evictOldestPendingWhiteboardToolPart(): void {
  const oldest = pendingWhiteboardToolPartOrder.values().next().value
  if (!oldest) return

  deletePendingWhiteboardToolPart(oldest)
}

function prunePendingWhiteboardToolParts(): void {
  while (pendingWhiteboardToolPartOrder.size > MAX_PENDING_WHITEBOARD_TOOL_PARTS) {
    evictOldestPendingWhiteboardToolPart()
  }
}

function trackPendingWhiteboardToolPart(part: OpenCodeMessageV2.MessageV2.Part): void {
  if (part.type !== "tool" || part.tool !== WHITEBOARD_CREATE_VIEW_TOOL_ID) return

  const sessionParts = pendingWhiteboardToolParts.get(part.sessionID)
  if (part.state.status !== "pending") {
    deletePendingWhiteboardToolPart({
      callID: part.callID,
      sessionID: part.sessionID,
    })
    return
  }

  const nextSessionParts = sessionParts ?? sessionPendingToolParts(part.sessionID)
  if (
    !nextSessionParts.has(part.callID) &&
    nextSessionParts.size >= MAX_PENDING_WHITEBOARD_TOOL_PARTS_PER_SESSION
  ) {
    const oldestCallID = nextSessionParts.keys().next().value
    if (oldestCallID !== undefined) {
      deletePendingWhiteboardToolPart({
        callID: oldestCallID,
        sessionID: part.sessionID,
      })
    }
  }

  nextSessionParts.set(part.callID, {
    sessionID: part.sessionID,
    messageID: part.messageID,
    partID: part.id,
  })
  trackPendingWhiteboardToolPartOrder({
    callID: part.callID,
    sessionID: part.sessionID,
  })
  prunePendingWhiteboardToolParts()
}

function toPendingWhiteboardToolPartDelta(input: {
  sessionID: string
  event: unknown
}): PartDelta | undefined {
  if (!isToolInputDeltaEvent(input.event) || input.event.name !== WHITEBOARD_CREATE_VIEW_TOOL_ID) {
    return undefined
  }

  const part = pendingWhiteboardToolParts.get(input.sessionID)?.get(input.event.id)
  if (!part) return undefined

  return {
    ...part,
    field: TOOL_RAW_DELTA_FIELD,
    delta: input.event.text,
  }
}

function patchSessionService(service: OpenCodeSession.Interface): void {
  if (patchedSessionServices.has(service)) return
  patchedSessionServices.add(service)

  const originalUpdatePart = service.updatePart.bind(service)
  const updatePart: OpenCodeSession.Interface["updatePart"] = (part) =>
    originalUpdatePart(part).pipe(
      Effect.tap((updated) =>
        Effect.sync(() => {
          trackPendingWhiteboardToolPart(updated)
        }),
      ),
    )

  Object.defineProperties(service, {
    updatePart: { value: updatePart },
  })
}

function patchLlmService(service: LlmService, session: OpenCodeSession.Interface): void {
  if (patchedLlmServices.has(service)) return
  patchedLlmServices.add(service)

  const originalStream = service.stream.bind(service)
  const stream: LlmService["stream"] = (input) =>
    originalStream(input).pipe(
      Stream.tap((event) => {
        const delta = toPendingWhiteboardToolPartDelta({
          sessionID: input.sessionID,
          event,
        })
        return delta ? session.updatePartDelta(delta) : Effect.void
      }),
    )

  Object.defineProperties(service, {
    stream: { value: stream },
  })
}

async function ensureToolInputDeltaBridgePatched(): Promise<void> {
  patchPromise ??= sessionRuntime
    .runPromise((session) =>
      withCurrentInstance(
        Effect.sync(() => {
          patchSessionService(session)
          return session
        }),
      ),
    )
    .then((session) =>
      runOpenCodeAppEffect(
        llmService.use((llm) =>
          withCurrentInstance(
            Effect.sync(() => {
              patchLlmService(llm, session)
            }),
          ),
        ),
      ),
    )
    .catch((error) => {
      patchPromise = undefined
      throw error
    })

  await patchPromise
}

function resetPendingWhiteboardToolPartsForTest(): void {
  pendingWhiteboardToolParts.clear()
  pendingWhiteboardToolPartOrder.clear()
}

function pendingWhiteboardToolPartCountForTest(): number {
  return pendingWhiteboardToolPartOrder.size
}

function maxPendingWhiteboardToolPartsForTest(): number {
  return MAX_PENDING_WHITEBOARD_TOOL_PARTS
}

export {
  ensureToolInputDeltaBridgePatched,
  maxPendingWhiteboardToolPartsForTest,
  pendingWhiteboardToolPartCountForTest,
  resetPendingWhiteboardToolPartsForTest,
  toPendingWhiteboardToolPartDelta,
  trackPendingWhiteboardToolPart,
}
