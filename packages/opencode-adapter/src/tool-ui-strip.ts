export type ToolUiStripToolPart = {
  type: "tool"
  metadata?: Record<string, unknown>
  state: {
    status: string
    metadata?: Record<string, unknown>
  }
}

export type ToolUiStripPart = ToolUiStripToolPart | { type: string }

export type ToolUiStripMessage = {
  parts: ToolUiStripPart[]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function isToolUiStripToolPart(part: ToolUiStripPart): part is ToolUiStripToolPart {
  return part.type === "tool" && "state" in part && part.state !== undefined
}

export function stripBuddyToolUi(
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

export function stripToolUiFromMessages(messages: ToolUiStripMessage[]) {
  for (const message of messages) {
    for (let index = 0; index < message.parts.length; index++) {
      const part = message.parts[index]
      if (!isToolUiStripToolPart(part)) continue

      const toolPart = part
      toolPart.metadata = stripBuddyToolUi(
        isRecord(toolPart.metadata) ? toolPart.metadata : undefined,
      )

      if (toolPart.state.status === "pending") {
        continue
      }

      if (toolPart.state.status === "running") {
        toolPart.state.metadata = stripBuddyToolUi(
          isRecord(toolPart.state.metadata) ? toolPart.state.metadata : undefined,
        )
        continue
      }

      if (toolPart.state.status === "completed") {
        toolPart.state.metadata =
          stripBuddyToolUi(
            isRecord(toolPart.state.metadata) ? toolPart.state.metadata : undefined,
          ) ?? {}
        continue
      }

      toolPart.state.metadata = stripBuddyToolUi(
        isRecord(toolPart.state.metadata) ? toolPart.state.metadata : undefined,
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

export function stripToolUiFromModelMessages<T>(messages: T): T {
  const next = structuredClone(messages)
  stripToolUiFromModelMessageNode(next)
  return next
}
