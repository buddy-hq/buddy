import type { MessagePart } from "@/state/chat-types"
import { parseToolState } from "../../../parse-tool-state"
import { isRecord, readNonEmptyString } from "../../../types"

type MermaidToolArtifactReference = {
  artifactID: string
  supersedesArtifactID?: string
}

type MermaidSupersessionMessage = {
  info: {
    role: string
  }
  parts: MessagePart[]
}

function parseMermaidToolArtifactReference(
  part: MessagePart,
): MermaidToolArtifactReference | undefined {
  if (part.type !== "tool") {
    return undefined
  }

  const state = parseToolState(part)
  if (readNonEmptyString(state.metadata.artifact) !== "RenderMermaidOutput") {
    return undefined
  }

  const value = isRecord(state.metadata.value) ? state.metadata.value : undefined
  if (!value || readNonEmptyString(value.kind) !== "mermaid.v2") {
    return undefined
  }

  const artifactID = readNonEmptyString(value.artifactID)
  if (!artifactID) {
    return undefined
  }

  const supersedesArtifactID = readNonEmptyString(value.supersedesArtifactID)
  return {
    artifactID,
    ...(supersedesArtifactID ? { supersedesArtifactID } : {}),
  }
}

function findSupersedingMermaidArtifactID(
  messages: MermaidSupersessionMessage[],
  artifactID: string,
): string | undefined {
  let replacementArtifactID: string | undefined

  for (const message of messages) {
    if (message.info.role !== "assistant") {
      continue
    }

    for (const part of message.parts) {
      const reference = parseMermaidToolArtifactReference(part)
      if (!reference || reference.artifactID === artifactID) {
        continue
      }
      if (reference.supersedesArtifactID === artifactID) {
        replacementArtifactID = reference.artifactID
      }
    }
  }

  return replacementArtifactID
}

export { findSupersedingMermaidArtifactID }
