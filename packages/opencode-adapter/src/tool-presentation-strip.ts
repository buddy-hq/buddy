export type ToolPresentationStripToolPart = {
  type: "tool"
  metadata?: Record<string, unknown>
  state: {
    status: string
    metadata?: Record<string, unknown>
  }
}

export type ToolPresentationStripPart = ToolPresentationStripToolPart | { type: string }

export type ToolPresentationStripMessage = {
  parts: ToolPresentationStripPart[]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function isToolPart(part: ToolPresentationStripPart): part is ToolPresentationStripToolPart {
  return part.type === "tool" && "state" in part && part.state !== undefined
}

export function stripBuddyToolPresentation(
  metadata: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  if (!metadata || !isRecord(metadata)) return metadata
  if (!isRecord(metadata.buddy)) return metadata

  const { presentation: _presentation, ...restBuddy } = metadata.buddy
  if (_presentation === undefined) return metadata

  if (Object.keys(restBuddy).length === 0) {
    const { buddy: _buddy, ...restMetadata } = metadata
    return Object.keys(restMetadata).length > 0 ? restMetadata : undefined
  }

  return {
    ...metadata,
    buddy: restBuddy,
  }
}

export function stripToolPresentationFromMessages(messages: ToolPresentationStripMessage[]) {
  for (const message of messages) {
    for (const part of message.parts) {
      if (!isToolPart(part)) continue

      part.metadata = stripBuddyToolPresentation(
        isRecord(part.metadata) ? part.metadata : undefined,
      )

      if (part.state.status === "pending") continue

      const strippedStateMetadata = stripBuddyToolPresentation(
        isRecord(part.state.metadata) ? part.state.metadata : undefined,
      )
      part.state.metadata =
        part.state.status === "completed" ? (strippedStateMetadata ?? {}) : strippedStateMetadata
    }
  }
}

function stripToolPresentationFromModelMessageNode(value: unknown): void {
  if (Array.isArray(value)) {
    for (const item of value) {
      stripToolPresentationFromModelMessageNode(item)
    }
    return
  }

  if (!isRecord(value)) return

  if ("providerMetadata" in value) {
    const stripped = stripBuddyToolPresentation(
      isRecord(value.providerMetadata) ? value.providerMetadata : undefined,
    )
    if (stripped) {
      value.providerMetadata = stripped
    } else {
      delete value.providerMetadata
    }
  }

  if ("callProviderMetadata" in value) {
    const stripped = stripBuddyToolPresentation(
      isRecord(value.callProviderMetadata) ? value.callProviderMetadata : undefined,
    )
    if (stripped) {
      value.callProviderMetadata = stripped
    } else {
      delete value.callProviderMetadata
    }
  }

  for (const child of Object.values(value)) {
    stripToolPresentationFromModelMessageNode(child)
  }
}

export function stripToolPresentationFromModelMessages<T>(messages: T): T {
  const next = structuredClone(messages)
  stripToolPresentationFromModelMessageNode(next)
  return next
}
