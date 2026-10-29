import type { Part, ToolPart, MessageWithParts } from "@buddy/transcript-contract/message"
import {
  getCoreToolPresentationDescriptor,
  getRuntimeToolPresentationDescriptor,
} from "@buddy/transcript-contract/core-tool-presentations"
import { parseJsonObject } from "@buddy/transcript-contract/parse-external"
import {
  resolveToolPresentationSnapshot,
  type ToolPresentationDescriptor,
} from "@buddy/transcript-contract/tool-presentation"
import { stripBuddyToolPresentation } from "@buddy/transcript-contract/tool-presentation-strip"

export type ToolPresentationLookup = (toolID: string) => ToolPresentationDescriptor | undefined

export function withToolPresentationOnPart<T extends Part>(part: T, lookup?: ToolPresentationLookup, detail?: string): T {
  if (part.type !== "tool") return part
  const state = part.state
  const descriptor = lookup?.(part.tool) ?? getCoreToolPresentationDescriptor(state.summary?.kind ?? "") ?? getRuntimeToolPresentationDescriptor()
  const stateMetadata = stripBuddyToolPresentation(parseJsonObject(state.metadata)) ?? (state.status === "running" || state.status === "completed" ? {} : undefined)
  const metadata = stripBuddyToolPresentation(parseJsonObject(part.metadata))
  const presentation = resolveToolPresentationSnapshot(descriptor, {
    toolID: part.tool,
    phase: state.status,
    detail,
    outcome: state.outcome,
    input: parseJsonObject(state.input) ?? {},
    metadata: stateMetadata ?? {},
    title: "title" in state ? state.title : undefined,
    output: "output" in state ? state.output : undefined,
    error: "error" in state ? state.error : undefined,
    errorType: "errorType" in state ? state.errorType : undefined,
  })
  return {
    ...part,
    state: { ...state, metadata: stateMetadata },
    metadata: { ...metadata, buddy: { ...parseJsonObject(metadata?.buddy), presentation } },
  }
}

export function withToolPresentationOnMessage(message: MessageWithParts, lookup?: ToolPresentationLookup): MessageWithParts {
  return { ...message, parts: message.parts.map((part) => withToolPresentationOnPart(part, lookup)) }
}

export function withToolPresentationOnMessages(messages: readonly MessageWithParts[], lookup?: ToolPresentationLookup): MessageWithParts[] {
  return messages.map((message) => withToolPresentationOnMessage(message, lookup))
}

export type { ToolPart }
export { stripBuddyToolPresentation } from "@buddy/transcript-contract/tool-presentation-strip"
