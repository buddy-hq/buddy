import type { MessagePart } from "@/state/chat-types"
import { parseToolState } from "../../../../chat/tools/parse-tool-state"
import { readBuddyObjectResult } from "../../../../chat/tools/render/buddy-object-result"

type MermaidToolObjectReference = {
  objectID: string
  revisionID: string | null
}

type MermaidSupersessionMessage = {
  info: {
    role: string
  }
  parts: MessagePart[]
}

function parseMermaidToolObjectReference(
  part: MessagePart,
): MermaidToolObjectReference | undefined {
  if (part.type !== "tool") {
    return undefined
  }

  const state = parseToolState(part)
  const result = readBuddyObjectResult(state.metadata)
  const presentation = result?.presentations.find(
    (item) => item.ref.kind === "mermaid" && item.data?.renderer === "mermaid",
  )
  if (!presentation) return undefined
  return {
    objectID: presentation.ref.objectID,
    revisionID: presentation.ref.revisionID,
  }
}

function findSupersedingMermaidRevisionID(
  messages: MermaidSupersessionMessage[],
  objectID: string,
  revisionID: string | null,
): string | undefined {
  if (revisionID === null) return undefined

  let sawCurrentRevision = false
  let replacementRevisionID: string | undefined

  for (const message of messages) {
    if (message.info.role !== "assistant") {
      continue
    }

    for (const part of message.parts) {
      const reference = parseMermaidToolObjectReference(part)
      if (!reference || reference.objectID !== objectID || reference.revisionID === null) {
        continue
      }

      if (reference.revisionID === revisionID) {
        sawCurrentRevision = true
        replacementRevisionID = undefined
        continue
      }

      if (!sawCurrentRevision) {
        continue
      }

      replacementRevisionID = reference.revisionID
    }
  }

  return replacementRevisionID
}

export { findSupersedingMermaidRevisionID }
