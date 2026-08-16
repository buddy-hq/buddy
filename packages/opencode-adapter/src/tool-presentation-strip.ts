import { isJsonObject, parseJsonObject, type TJsonObject, type TJsonValue } from "./parse-external"

export type ToolPresentationStripToolPart = {
  type: "tool"
  metadata?: TJsonObject
  state: {
    status: string
    metadata?: TJsonObject
  }
}

export type ToolPresentationStripPart = ToolPresentationStripToolPart | { type: string }

export type ToolPresentationStripMessage = {
  parts: ToolPresentationStripPart[]
}

function isToolPart(part: ToolPresentationStripPart): part is ToolPresentationStripToolPart {
  return part.type === "tool" && "state" in part && part.state !== undefined
}

export function stripBuddyToolPresentation(
  metadata: TJsonObject | undefined,
): TJsonObject | undefined {
  if (!metadata || !isJsonObject(metadata)) return metadata
  const buddy = parseJsonObject(metadata.buddy)
  if (buddy === undefined) return metadata
  if (buddy.presentation === undefined) return metadata

  const restBuddy: TJsonObject = { ...buddy }
  delete restBuddy.presentation

  if (Object.keys(restBuddy).length === 0) {
    const restMetadata: TJsonObject = { ...metadata }
    delete restMetadata.buddy
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
        isJsonObject(part.metadata) ? part.metadata : undefined,
      )

      if (part.state.status === "pending") continue

      const strippedStateMetadata = stripBuddyToolPresentation(
        isJsonObject(part.state.metadata) ? part.state.metadata : undefined,
      )
      part.state.metadata =
        part.state.status === "completed" ? (strippedStateMetadata ?? {}) : strippedStateMetadata
    }
  }
}

function isJsonObjectValue(value: TJsonValue | TJsonValue[] | undefined): value is TJsonObject {
  return !Array.isArray(value) && isJsonObject(value)
}

function stripToolPresentationFromModelMessageNode(value: TJsonObject | TJsonValue[]): void {
  if (Array.isArray(value)) {
    for (const item of value) {
      if (Array.isArray(item)) {
        stripToolPresentationFromModelMessageNode(item)
        continue
      }
      if (isJsonObjectValue(item)) {
        stripToolPresentationFromModelMessageNode(item)
      }
    }
    return
  }

  if ("providerMetadata" in value) {
    const stripped = stripBuddyToolPresentation(
      isJsonObjectValue(value.providerMetadata) ? value.providerMetadata : undefined,
    )
    if (stripped) {
      value.providerMetadata = stripped
    } else {
      delete value.providerMetadata
    }
  }

  if ("callProviderMetadata" in value) {
    const stripped = stripBuddyToolPresentation(
      isJsonObjectValue(value.callProviderMetadata) ? value.callProviderMetadata : undefined,
    )
    if (stripped) {
      value.callProviderMetadata = stripped
    } else {
      delete value.callProviderMetadata
    }
  }

  for (const child of Object.values(value)) {
    if (Array.isArray(child)) {
      stripToolPresentationFromModelMessageNode(child)
      continue
    }
    if (isJsonObjectValue(child)) {
      stripToolPresentationFromModelMessageNode(child)
    }
  }
}

export function stripToolPresentationFromModelMessages<T>(messages: T): T {
  const next = structuredClone(messages)
  if (Array.isArray(next)) {
    stripToolPresentationFromModelMessageNode(next)
  } else if (isJsonObject(next)) {
    stripToolPresentationFromModelMessageNode(next)
  }
  return next
}
