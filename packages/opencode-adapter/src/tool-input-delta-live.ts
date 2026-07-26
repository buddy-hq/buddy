import { Effect } from "effect"
import * as Stream from "effect/Stream"
import * as OpenCodeEffectBridge from "opencode/effect/bridge"
import * as OpenCodeLLM from "opencode/session/llm"
import * as OpenCodeSession from "opencode/session/session"
import { withCurrentInstance } from "./effect-runtime"
import type { MessageV2 } from "./message"

const WHITEBOARD_CREATE_VIEW_TOOL_ID = "whiteboard_create_view" as const
const TOOL_INPUT_DELTA_EVENT_TYPE = "tool-input-delta" as const
const TOOL_RAW_DELTA_FIELD = "state.raw" as const
const MAX_PENDING_WHITEBOARD_TOOL_PARTS_PER_SESSION = 256
const MAX_PENDING_WHITEBOARD_TOOL_PART_SESSIONS = 64
const MAX_PENDING_WHITEBOARD_TOOL_PARTS =
  MAX_PENDING_WHITEBOARD_TOOL_PARTS_PER_SESSION * MAX_PENDING_WHITEBOARD_TOOL_PART_SESSIONS
const MAX_UNCONFIRMED_CALLBACK_DELTAS_PER_TOOL_PART = 4_096
const PENDING_WHITEBOARD_TOOL_PART_KEY_SEPARATOR = "\u0000"

type PartDelta = Parameters<OpenCodeSession.Interface["updatePartDelta"]>[0]
type LlmService = OpenCodeLLM.Interface
type LlmTool = OpenCodeLLM.StreamInput["tools"][string]
type ToolInputDeltaEvent = {
  type: typeof TOOL_INPUT_DELTA_EVENT_TYPE
  id: string
  name: string
  text: string
}
type CallbackDeltaReceipt = {
  delta: string
}
type PendingWhiteboardToolPartKey = {
  callID: string
  sessionID: string
}

const patchedSessionServices = new WeakSet<OpenCodeSession.Interface>()
const patchedLlmServices = new WeakSet<LlmService>()
const pendingWhiteboardToolParts = new Map<
  string,
  Map<string, Omit<PartDelta, "field" | "delta">>
>()
const pendingWhiteboardToolPartOrder = new Map<string, PendingWhiteboardToolPartKey>()
const callbackDeltaReceipts = new Map<string, CallbackDeltaReceipt[]>()
const queuedCallbackDeltas = new Map<string, CallbackDeltaReceipt[]>()

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

function sessionPendingToolParts(
  sessionID: string,
): Map<string, Omit<PartDelta, "field" | "delta">> {
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

  const key = pendingWhiteboardToolPartKey(input)
  pendingWhiteboardToolPartOrder.delete(key)
  callbackDeltaReceipts.delete(key)
  queuedCallbackDeltas.delete(key)
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

function trackPendingWhiteboardToolPart(part: MessageV2.Part): void {
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

function removeCallbackDeltaReceipt(
  queue: CallbackDeltaReceipt[] | undefined,
  receipt: CallbackDeltaReceipt,
): void {
  const index = queue?.indexOf(receipt) ?? -1
  if (index !== -1) queue?.splice(index, 1)
}

function deleteEmptyCallbackDeltaQueue(
  map: Map<string, CallbackDeltaReceipt[]>,
  key: string,
): void {
  if (map.get(key)?.length === 0) map.delete(key)
}

function reserveCallbackDelta(input: { callID: string; delta: string; sessionID: string }):
  | {
      part: Omit<PartDelta, "field" | "delta"> | undefined
      receipt: CallbackDeltaReceipt
    }
  | undefined {
  const key = pendingWhiteboardToolPartKey(input)
  const receipts = callbackDeltaReceipts.get(key) ?? []
  if (receipts.length >= MAX_UNCONFIRMED_CALLBACK_DELTAS_PER_TOOL_PART) return undefined

  const receipt = { delta: input.delta }
  receipts.push(receipt)
  callbackDeltaReceipts.set(key, receipts)

  const part = pendingWhiteboardToolParts.get(input.sessionID)?.get(input.callID)
  if (!part) {
    const queued = queuedCallbackDeltas.get(key) ?? []
    queued.push(receipt)
    queuedCallbackDeltas.set(key, queued)
  }

  return { part, receipt }
}

function rollbackCallbackDelta(
  input: PendingWhiteboardToolPartKey,
  receipt: CallbackDeltaReceipt,
): void {
  const key = pendingWhiteboardToolPartKey(input)
  removeCallbackDeltaReceipt(callbackDeltaReceipts.get(key), receipt)
  removeCallbackDeltaReceipt(queuedCallbackDeltas.get(key), receipt)
  deleteEmptyCallbackDeltaQueue(callbackDeltaReceipts, key)
  deleteEmptyCallbackDeltaQueue(queuedCallbackDeltas, key)
}

function consumeCallbackDeltaReceipt(input: { event: unknown; sessionID: string }): boolean {
  if (!isToolInputDeltaEvent(input.event)) return false

  const key = pendingWhiteboardToolPartKey({
    callID: input.event.id,
    sessionID: input.sessionID,
  })
  const receipts = callbackDeltaReceipts.get(key)
  if (receipts?.[0]?.delta !== input.event.text) return false

  receipts.shift()
  deleteEmptyCallbackDeltaQueue(callbackDeltaReceipts, key)
  return true
}

function takeQueuedCallbackPartDeltas(part: MessageV2.Part): PartDelta[] {
  if (
    part.type !== "tool" ||
    part.tool !== WHITEBOARD_CREATE_VIEW_TOOL_ID ||
    part.state.status !== "pending"
  ) {
    return []
  }

  const key = pendingWhiteboardToolPartKey({
    callID: part.callID,
    sessionID: part.sessionID,
  })
  const receipts = queuedCallbackDeltas.get(key)
  if (!receipts || receipts.length === 0) return []

  queuedCallbackDeltas.delete(key)
  return receipts.map((receipt) => ({
    sessionID: part.sessionID,
    messageID: part.messageID,
    partID: part.id,
    field: TOOL_RAW_DELTA_FIELD,
    delta: receipt.delta,
  }))
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

function withWhiteboardToolInputDeltaForwarding(input: {
  forwardPartDelta: (delta: PartDelta) => Promise<void>
  sessionID: string
  tools: OpenCodeLLM.StreamInput["tools"]
}): OpenCodeLLM.StreamInput["tools"] {
  const whiteboard = input.tools[WHITEBOARD_CREATE_VIEW_TOOL_ID]
  if (!whiteboard) return input.tools

  const originalOnInputDelta = whiteboard.onInputDelta
  const onInputDelta: NonNullable<LlmTool["onInputDelta"]> = async (options) => {
    await originalOnInputDelta?.(options)

    const reserved = reserveCallbackDelta({
      callID: options.toolCallId,
      delta: options.inputTextDelta,
      sessionID: input.sessionID,
    })
    if (!reserved?.part) return

    try {
      await input.forwardPartDelta({
        ...reserved.part,
        field: TOOL_RAW_DELTA_FIELD,
        delta: options.inputTextDelta,
      })
    } catch {
      rollbackCallbackDelta(
        {
          callID: options.toolCallId,
          sessionID: input.sessionID,
        },
        reserved.receipt,
      )
    }
  }

  return {
    ...input.tools,
    [WHITEBOARD_CREATE_VIEW_TOOL_ID]: {
      ...whiteboard,
      onInputDelta,
    },
  }
}

function patchSessionService(service: OpenCodeSession.Interface): void {
  if (patchedSessionServices.has(service)) return
  patchedSessionServices.add(service)

  const originalUpdatePart = service.updatePart.bind(service)
  const updatePart: OpenCodeSession.Interface["updatePart"] = (part) =>
    originalUpdatePart(part).pipe(
      Effect.tap((updated) => {
        trackPendingWhiteboardToolPart(updated)
        const queued = takeQueuedCallbackPartDeltas(updated)

        return Effect.forEach(queued, (delta) => service.updatePartDelta(delta), { discard: true })
      }),
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
    Stream.unwrap(
      Effect.gen(function* () {
        const bridge = yield* OpenCodeEffectBridge.make()
        const upstream = originalStream({
          ...input,
          tools: withWhiteboardToolInputDeltaForwarding({
            forwardPartDelta: (delta) => bridge.promise(session.updatePartDelta(delta)),
            sessionID: input.sessionID,
            tools: input.tools,
          }),
        })

        return upstream.pipe(
          Stream.tap((event) => {
            if (
              consumeCallbackDeltaReceipt({
                sessionID: input.sessionID,
                event,
              })
            ) {
              return Effect.void
            }

            const delta = toPendingWhiteboardToolPartDelta({
              sessionID: input.sessionID,
              event,
            })
            return delta ? session.updatePartDelta(delta) : Effect.void
          }),
        )
      }),
    )

  Object.defineProperties(service, {
    stream: { value: stream },
  })
}

async function ensureToolInputDeltaBridgePatched(): Promise<void> {
  patchPromise ??= runOpenCodeAppEffect(
    withCurrentInstance(
      Effect.gen(function* () {
        const session = yield* OpenCodeSession.Service
        const llm = yield* OpenCodeLLM.Service

        yield* Effect.sync(() => {
          patchSessionService(session)
          patchLlmService(llm, session)
        })
      }),
    ),
  ).catch((error) => {
    patchPromise = undefined
    throw error
  })

  await patchPromise
}

function resetPendingWhiteboardToolPartsForTest(): void {
  pendingWhiteboardToolParts.clear()
  pendingWhiteboardToolPartOrder.clear()
  callbackDeltaReceipts.clear()
  queuedCallbackDeltas.clear()
}

function pendingWhiteboardToolPartCountForTest(): number {
  return pendingWhiteboardToolPartOrder.size
}

function maxPendingWhiteboardToolPartsForTest(): number {
  return MAX_PENDING_WHITEBOARD_TOOL_PARTS
}

export {
  consumeCallbackDeltaReceipt as consumeCallbackDeltaReceiptForTest,
  ensureToolInputDeltaBridgePatched,
  maxPendingWhiteboardToolPartsForTest,
  pendingWhiteboardToolPartCountForTest,
  resetPendingWhiteboardToolPartsForTest,
  takeQueuedCallbackPartDeltas as takeQueuedCallbackPartDeltasForTest,
  toPendingWhiteboardToolPartDelta,
  trackPendingWhiteboardToolPart,
  withWhiteboardToolInputDeltaForwarding,
}
