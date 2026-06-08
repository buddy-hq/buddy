import type { MessageV2 } from "./message"
import { ToolRegistry } from "./registry"
import { cloneToolUiMetadata, type ToolUiMetadata } from "./tool-ui-metadata"

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

function toolUiForPart(part: ToolPart, directory?: string): ToolUiMetadata | undefined {
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

  return ToolRegistry.getToolUiMetadata(part.tool, directory)
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

export function withToolUiOnPart<T extends MessageV2.Part>(
  part: T,
  directory?: string,
): T {
  if (part.type !== "tool") return part

  const toolUi = toolUiForPart(part, directory)
  if (!toolUi) return part

  return {
    ...part,
    metadata: mergeToolUiMetadata(isRecord(part.metadata) ? part.metadata : undefined, toolUi),
    state: withToolUiOnState(part.state, toolUi),
  }
}

export function withToolUiOnUnknownPart(part: unknown, directory?: string): unknown {
  if (!isToolPart(part)) {
    return part
  }

  return withToolUiOnPart(part, directory)
}

export function withToolUiOnMessage<T extends MessageV2.WithParts>(
  message: T,
  directory?: string,
): T {
  return {
    ...message,
    parts: message.parts.map((part) => withToolUiOnPart(part, directory)),
  }
}

export function withToolUiOnMessages(
  messages: ReadonlyArray<MessageV2.WithParts>,
  directory?: string,
): MessageV2.WithParts[] {
  return messages.map((message) => withToolUiOnMessage(message, directory))
}

// Preserved as a no-op so existing bootstrap call sites can keep their wiring
// while tool UI presentation now lives on Buddy-owned HTTP/SSE boundaries.
export async function ensureSessionToolUiPatched() {
  return undefined
}

export { stripBuddyToolUi } from "./tool-ui-strip"
