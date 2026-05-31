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
const OPENCODE_APP_RUNTIME_MODULE_ID: string = "opencode/effect/app-runtime"
const MAX_PENDING_WHITEBOARD_TOOL_PARTS = 256

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

const sessionRuntime = makeRuntime(OpenCodeSession.Service, OpenCodeSession.defaultLayer)
const llmService = Context.Service<LlmService>(OPENCODE_LLM_SERVICE_TAG)
const patchedSessionServices = new WeakSet<OpenCodeSession.Interface>()
const patchedLlmServices = new WeakSet<LlmService>()
const pendingWhiteboardToolParts = new Map<string, Omit<PartDelta, "field" | "delta">>()

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
  // Loading by a non-literal keeps this adapter boundary from typechecking the
  // vendored LLM implementation while still validating the runtime contract.
  const appRuntimeModule: unknown = await import(OPENCODE_APP_RUNTIME_MODULE_ID)
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

function pendingToolKey(sessionID: string, callID: string): string {
  return `${sessionID}:${callID}`
}

function trackPendingWhiteboardToolPart(part: OpenCodeMessageV2.MessageV2.Part): void {
  if (part.type !== "tool" || part.tool !== WHITEBOARD_CREATE_VIEW_TOOL_ID) return

  const key = pendingToolKey(part.sessionID, part.callID)
  if (part.state.status !== "pending") {
    pendingWhiteboardToolParts.delete(key)
    return
  }

  if (
    !pendingWhiteboardToolParts.has(key) &&
    pendingWhiteboardToolParts.size >= MAX_PENDING_WHITEBOARD_TOOL_PARTS
  ) {
    const oldestKey = pendingWhiteboardToolParts.keys().next().value
    if (oldestKey) {
      pendingWhiteboardToolParts.delete(oldestKey)
    }
  }

  pendingWhiteboardToolParts.set(key, {
    sessionID: part.sessionID,
    messageID: part.messageID,
    partID: part.id,
  })
}

function toPendingWhiteboardToolPartDelta(input: {
  sessionID: string
  event: unknown
}): PartDelta | undefined {
  if (!isToolInputDeltaEvent(input.event) || input.event.name !== WHITEBOARD_CREATE_VIEW_TOOL_ID) {
    return undefined
  }

  const part = pendingWhiteboardToolParts.get(pendingToolKey(input.sessionID, input.event.id))
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
}

export {
  ensureToolInputDeltaBridgePatched,
  resetPendingWhiteboardToolPartsForTest,
  toPendingWhiteboardToolPartDelta,
  trackPendingWhiteboardToolPart,
}
