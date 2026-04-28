import { Effect } from "effect"
import { makeRuntime } from "opencode/effect/run-service"
import { Plugin } from "opencode/plugin/index"
import * as OpenCodeLLM from "opencode/session/llm"
import * as OpenCodeSession from "opencode/session/session"
import type * as OpenCodeMessageV2 from "opencode/session/message-v2"
import { ToolRegistry } from "./registry"
import { cloneToolUiMetadata, type ToolUiMetadata } from "./tool-ui-metadata"

const sessionRuntime = makeRuntime(OpenCodeSession.Service, OpenCodeSession.defaultLayer)
const pluginRuntime = makeRuntime(Plugin.Service, Plugin.defaultLayer)
const llmRuntime = makeRuntime(OpenCodeLLM.Service, OpenCodeLLM.defaultLayer)
const patchedSessionServices = new WeakSet<OpenCodeSession.Interface>()
const patchedPluginServices = new WeakSet<Plugin.Interface>()
const patchedLLMServices = new WeakSet<OpenCodeLLM.Interface>()
let patchPromise: Promise<void> | undefined

type ToolPart = OpenCodeMessageV2.MessageV2.ToolPart
type ToolState = ToolPart["state"]
type MessageWithParts = OpenCodeMessageV2.MessageV2.WithParts
type ModelMessages = Parameters<OpenCodeLLM.Interface["stream"]>[0]["messages"]

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function readToolUiMetadata(value: unknown): ToolUiMetadata | undefined {
  if (!isRecord(value)) return undefined
  const presentation = value.presentation
  const labels = isRecord(value.labels) ? value.labels : undefined
  const idle = typeof labels?.idle === "string" ? labels.idle : undefined
  const running = typeof labels?.running === "string" ? labels.running : undefined

  if (
    presentation !== undefined &&
    presentation !== "hidden-summary" &&
    presentation !== "default"
  ) {
    return undefined
  }
  if (!presentation && !idle && !running) return undefined

  return cloneToolUiMetadata({
    ...(presentation ? { presentation } : {}),
    ...(idle || running
      ? {
          labels: {
            ...(idle ? { idle } : {}),
            ...(running ? { running } : {}),
          },
        }
      : {}),
  })
}

function mergeToolUiMetadata(
  metadata: Record<string, unknown> | undefined,
  toolUi: ToolUiMetadata,
) {
  return {
    ...metadata,
    buddy: {
      ...(isRecord(metadata?.buddy) ? metadata.buddy : {}),
      toolUi,
    },
  }
}

function toolUiForPart(part: ToolPart): ToolUiMetadata | undefined {
  const partToolUi = readToolUiMetadata(
    isRecord(part.metadata?.buddy) ? part.metadata.buddy.toolUi : undefined,
  )
  if (partToolUi) return partToolUi

  if (part.state.status !== "pending") {
    const stateToolUi = readToolUiMetadata(
      isRecord(part.state.metadata?.buddy) ? part.state.metadata.buddy.toolUi : undefined,
    )
    if (stateToolUi) return stateToolUi
  }

  return ToolRegistry.getToolUiMetadata(part.tool)
}

function withToolUiOnState(state: ToolState, toolUi: ToolUiMetadata | undefined): ToolState {
  if (!toolUi || state.status === "pending") return state

  const metadata = mergeToolUiMetadata(
    isRecord(state.metadata) ? state.metadata : undefined,
    toolUi,
  )

  if (state.status === "running") {
    return {
      ...state,
      metadata,
    }
  }

  if (state.status === "completed") {
    return {
      ...state,
      metadata,
    }
  }

  return {
    ...state,
    metadata,
  }
}

function withToolUiOnPart<T extends OpenCodeMessageV2.MessageV2.Part>(part: T): T {
  if (part.type !== "tool") return part

  const toolUi = toolUiForPart(part)
  if (!toolUi) return part

  return {
    ...part,
    metadata: mergeToolUiMetadata(isRecord(part.metadata) ? part.metadata : undefined, toolUi),
    state: withToolUiOnState(part.state, toolUi),
  }
}

function stripBuddyToolUi(
  metadata: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  if (!metadata || !isRecord(metadata)) return metadata
  if (!isRecord(metadata.buddy) || !("toolUi" in metadata.buddy)) return metadata

  const { toolUi: _toolUi, ...restBuddy } = metadata.buddy
  if (Object.keys(restBuddy).length === 0) {
    const { buddy: _buddy, ...restMetadata } = metadata
    return Object.keys(restMetadata).length > 0 ? restMetadata : undefined
  }

  return {
    ...metadata,
    buddy: restBuddy,
  }
}

function stripToolUiFromMessages(messages: MessageWithParts[]) {
  for (const message of messages) {
    for (let index = 0; index < message.parts.length; index++) {
      const part = message.parts[index]
      if (part.type !== "tool") continue

      part.metadata = stripBuddyToolUi(isRecord(part.metadata) ? part.metadata : undefined)

      if (part.state.status === "pending") {
        continue
      }

      if (part.state.status === "running") {
        part.state.metadata = stripBuddyToolUi(
          isRecord(part.state.metadata) ? part.state.metadata : undefined,
        )
        continue
      }

      if (part.state.status === "completed") {
        part.state.metadata =
          stripBuddyToolUi(isRecord(part.state.metadata) ? part.state.metadata : undefined) ?? {}
        continue
      }

      part.state.metadata = stripBuddyToolUi(
        isRecord(part.state.metadata) ? part.state.metadata : undefined,
      )
    }
  }
}

function stripToolUiFromModelMessageNode(value: unknown): void {
  if (Array.isArray(value)) {
    for (const item of value) {
      stripToolUiFromModelMessageNode(item)
    }
    return
  }

  if (!isRecord(value)) return

  if ("providerMetadata" in value) {
    const stripped = stripBuddyToolUi(
      isRecord(value.providerMetadata) ? value.providerMetadata : undefined,
    )
    if (stripped) {
      value.providerMetadata = stripped
    } else {
      delete value.providerMetadata
    }
  }

  if ("callProviderMetadata" in value) {
    const stripped = stripBuddyToolUi(
      isRecord(value.callProviderMetadata) ? value.callProviderMetadata : undefined,
    )
    if (stripped) {
      value.callProviderMetadata = stripped
    } else {
      delete value.callProviderMetadata
    }
  }

  for (const child of Object.values(value)) {
    stripToolUiFromModelMessageNode(child)
  }
}

function stripToolUiFromModelMessages(messages: ModelMessages): ModelMessages {
  const next = structuredClone(messages)
  stripToolUiFromModelMessageNode(next)
  return next
}

function ensureSessionPatched(service: OpenCodeSession.Interface) {
  if (patchedSessionServices.has(service)) return
  patchedSessionServices.add(service)

  const originalUpdatePart = service.updatePart.bind(service)

  const updatePart: OpenCodeSession.Interface["updatePart"] = (part) =>
    originalUpdatePart(withToolUiOnPart(part))

  Object.defineProperties(service, {
    updatePart: { value: updatePart },
  })
}

function ensurePluginPatched(service: Plugin.Interface) {
  if (patchedPluginServices.has(service)) return
  patchedPluginServices.add(service)

  const originalTrigger = service.trigger.bind(service)

  const trigger: Plugin.Interface["trigger"] = Effect.fn("BuddyPlugin.trigger")(
    function* (name, input, output) {
      if (name === "experimental.chat.messages.transform") {
        stripToolUiFromMessages((output as { messages: MessageWithParts[] }).messages)
      }

      return yield* originalTrigger(name, input, output)
    },
  )

  Object.defineProperties(service, {
    trigger: { value: trigger },
  })
}

function ensureLLMPatched(service: OpenCodeLLM.Interface) {
  if (patchedLLMServices.has(service)) return
  patchedLLMServices.add(service)

  const originalStream = service.stream.bind(service)

  const stream: OpenCodeLLM.Interface["stream"] = (input) =>
    originalStream({
      ...input,
      messages: stripToolUiFromModelMessages(input.messages),
    })

  Object.defineProperties(service, {
    stream: { value: stream },
  })
}

export async function ensureSessionToolUiPatched() {
  patchPromise ??= Promise.all([
    sessionRuntime.runPromise((svc) => Effect.sync(() => ensureSessionPatched(svc))),
    pluginRuntime.runPromise((svc) => Effect.sync(() => ensurePluginPatched(svc))),
    llmRuntime.runPromise((svc) => Effect.sync(() => ensureLLMPatched(svc))),
  ])
    .then(() => undefined)
    .catch((error) => {
      patchPromise = undefined
      throw error
    })

  await patchPromise
}

export { stripBuddyToolUi, withToolUiOnPart }
