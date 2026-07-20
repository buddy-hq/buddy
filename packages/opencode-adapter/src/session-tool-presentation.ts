import type { MessageV2 } from "./message"
import { getRuntimeToolPresentationDescriptor } from "./core-tool-presentations"
import { ToolRegistry } from "./registry"
import {
  resolveToolPresentationSnapshot,
  type ToolPresentationResolutionContext,
  type ToolPresentationSnapshot,
} from "./tool-presentation"
import { stripBuddyToolPresentation } from "./tool-presentation-strip"

type ToolPart = MessageV2.ToolPart
type ToolState = ToolPart["state"]

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function isToolPart(value: unknown): value is ToolPart {
  return (
    isRecord(value) &&
    value.type === "tool" &&
    typeof value.callID === "string" &&
    typeof value.tool === "string" &&
    isRecord(value.state) &&
    typeof value.state.status === "string"
  )
}

function presentationContext(part: ToolPart): ToolPresentationResolutionContext {
  const state = part.state
  const metadata = state.status === "pending" || !isRecord(state.metadata) ? {} : state.metadata

  return {
    toolID: part.tool,
    phase: state.status,
    input: state.input,
    metadata,
    ...(state.status === "running" || state.status === "completed" ? { title: state.title } : {}),
    ...(state.status === "completed" ? { output: state.output } : {}),
    ...(state.status === "error" ? { error: state.error } : {}),
  }
}

function metadataWithPresentation(
  metadata: Record<string, unknown> | undefined,
  presentation: ToolPresentationSnapshot,
) {
  const stripped = stripBuddyToolPresentation(metadata)
  return {
    ...stripped,
    buddy: {
      ...(isRecord(stripped?.buddy) ? stripped.buddy : {}),
      presentation,
    },
  }
}

function stripPresentationFromState(state: ToolState): ToolState {
  if (state.status === "pending") return state

  const metadata = stripBuddyToolPresentation(isRecord(state.metadata) ? state.metadata : undefined)
  if (state.status === "completed") {
    return {
      ...state,
      metadata: metadata ?? {},
    }
  }

  return {
    ...state,
    ...(metadata ? { metadata } : {}),
  }
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
      isRecord(part.metadata) ? part.metadata : undefined,
      presentation,
    ),
    state,
  }
}

export function withToolPresentationOnUnknownPart(part: unknown, directory?: string): unknown {
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
