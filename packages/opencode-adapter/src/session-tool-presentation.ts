import type { MessageV2 } from "./message"
import { getRuntimeToolPresentationDescriptor } from "./core-tool-presentations"
import { isJsonObject, parseStringValue, type TJsonObject } from "./parse-external"
import { ToolRegistry } from "./registry"
import {
  resolveToolPresentationSnapshot,
  type ToolPresentationResolutionContext,
  type ToolPresentationSnapshot,
} from "./tool-presentation"
import { stripBuddyToolPresentation } from "./tool-presentation-strip"

type ToolPart = MessageV2.ToolPart
type ToolState = ToolPart["state"]

function isToolPart<TValue>(value: TValue): value is TValue & ToolPart {
  if (!isJsonObject(value)) return false
  if (value.type !== "tool") return false
  if (parseStringValue(value.callID) === undefined) return false
  if (parseStringValue(value.tool) === undefined) return false
  if (!isJsonObject(value.state)) return false
  return parseStringValue(value.state.status) !== undefined
}

function presentationContext(part: ToolPart): ToolPresentationResolutionContext {
  const state = part.state
  const metadata =
    state.status === "pending" || !isJsonObject(state.metadata) ? {} : state.metadata

  return Object.assign(
    {
      toolID: part.tool,
      phase: state.status,
      input: state.input,
      metadata,
    },
    state.status === "running" || state.status === "completed" ? { title: state.title } : undefined,
    state.status === "completed" ? { output: state.output } : undefined,
    state.status === "error" ? { error: state.error } : undefined,
  )
}

function metadataWithPresentation(
  metadata: TJsonObject | undefined,
  presentation: ToolPresentationSnapshot,
) {
  const stripped = stripBuddyToolPresentation(metadata)
  return {
    ...stripped,
    buddy: Object.assign({}, isJsonObject(stripped?.buddy) ? stripped.buddy : undefined, {
      presentation,
    }),
  }
}

function stripPresentationFromState(state: ToolState): ToolState {
  if (state.status === "pending") return state

  const metadata = stripBuddyToolPresentation(isJsonObject(state.metadata) ? state.metadata : undefined)
  if (state.status === "completed") {
    return {
      ...state,
      metadata: metadata ?? {},
    }
  }

  return Object.assign({ ...state }, metadata ? { metadata } : undefined)
}

export function withToolPresentationOnPart<T extends MessageV2.Part>(
  part: T,
  directory?: string,
): T {
  if (part.type !== "tool") return part

  const descriptor =
    ToolRegistry.getToolPresentationDescriptor(part.tool, directory) ??
    getRuntimeToolPresentationDescriptor()
  const state = stripPresentationFromState(part.state)

  const presentation = resolveToolPresentationSnapshot(descriptor, presentationContext(part))
  return {
    ...part,
    metadata: metadataWithPresentation(
      isJsonObject(part.metadata) ? part.metadata : undefined,
      presentation,
    ),
    state,
  }
}

export function withToolPresentationOnUnknownPart<TPart>(part: TPart, directory?: string): TPart {
  return isToolPart(part) ? withToolPresentationOnPart(part, directory) : part
}

export function withToolPresentationOnMessage<T extends MessageV2.WithParts>(
  message: T,
  directory?: string,
): T {
  return {
    ...message,
    parts: message.parts.map((part) => withToolPresentationOnPart(part, directory)),
  }
}

export function withToolPresentationOnMessages(
  messages: ReadonlyArray<MessageV2.WithParts>,
  directory?: string,
): MessageV2.WithParts[] {
  return messages.map((message) => withToolPresentationOnMessage(message, directory))
}

// Preserved as a no-op so bootstrap call sites can retain their sequencing while
// presentation is resolved only at Buddy-owned history and SSE boundaries.
export async function ensureSessionToolPresentationPatched() {
  return undefined
}

export { stripBuddyToolPresentation } from "./tool-presentation-strip"
