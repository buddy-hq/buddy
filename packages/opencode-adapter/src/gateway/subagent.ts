import type { OpenCodeEvent, SessionMessageAssistantTool, SessionMessageInfo, SessionMessageSynthetic } from "@opencode/client"
import type { SubagentCompletion, SubagentPresentation, SubagentWorkerStatus } from "@buddy/transcript-contract/subagent"
import { parseStringValue } from "@buddy/transcript-contract/parse-external"

const LegacyTitleSuffix = /\s+\(@[^()]+? subagent\)$/u
const CancelledFailure = /^Subagent cancelled\b/u

type SettledToolState = Exclude<SessionMessageAssistantTool["state"], { status: "streaming" }>

function resultBody(text: string, legacy: boolean): string {
  const open = text.indexOf(legacy ? "<task_result>" : "<subagent")
  const start = open < 0 ? -1 : legacy ? open + "<task_result>".length : text.indexOf("\n", open) + 1
  const end = text.lastIndexOf(legacy ? "</task_result>" : "</subagent>")
  return start > 0 && end >= start ? text.slice(start, end).trim() : text.trim()
}

function workerStatus(state: SettledToolState): SubagentWorkerStatus {
  if (state.status === "running" || (state.status === "completed" && state.metadata?.status === "running")) return "running"
  if (state.status === "completed") return "completed"
  return state.error.type === "aborted" || state.error.type === "tool.interrupted" || CancelledFailure.test(state.error.message) ? "cancelled" : "error"
}

function workerResult(state: SettledToolState, status: SubagentWorkerStatus, legacy: boolean): string | undefined {
  if (status === "running" || state.status === "running") return undefined
  if (state.status === "error") return state.error.message
  const text = state.content.flatMap((content) => content.type === "text" ? [content.text] : []).join("\n")
  return text ? resultBody(text, legacy) : undefined
}

export function toBuddySubagentPresentation(part: SessionMessageAssistantTool, messageID: string, ownerSessionID: string): SubagentPresentation | undefined {
  if ((part.name !== "subagent" && part.name !== "task") || part.state.status === "streaming") return undefined
  const legacy = part.name === "task"
  const state = part.state
  const status = workerStatus(state)
  return {
    ownerSessionID,
    messageID,
    callID: part.id,
    childSessionID: parseStringValue(state.metadata?.sessionID) ?? (legacy ? parseStringValue(state.metadata?.sessionId) : parseStringValue(state.input.sessionID)),
    agentID: parseStringValue(legacy ? state.input.subagent_type : state.input.agent),
    description: parseStringValue(state.input.description)?.replace(LegacyTitleSuffix, "").trim() || undefined,
    background: !legacy && (state.input.background === true || (state.status === "completed" && status === "running")),
    workerStatus: status,
    startedAt: part.time.ran ?? part.time.created,
    result: workerResult(state, status, legacy),
  }
}

export function toBuddySubagentCompletion(message: SessionMessageInfo, ownerSessionID: string): SubagentCompletion | undefined {
  if (message.type !== "synthetic" || message.metadata?.source !== "subagent") return undefined
  const childSessionID = parseStringValue(message.metadata.childID)
  const outcome = message.metadata.state
  if (!childSessionID || (outcome !== "completed" && outcome !== "error" && outcome !== "cancelled")) return undefined
  return {
    ownerSessionID,
    childSessionID,
    messageID: message.id,
    createdAt: message.time.created,
    description: message.description,
    agentName: parseStringValue(message.metadata.agent),
    outcome,
    result: resultBody(message.text, false),
  }
}

export function subagentInboxMessage(event: OpenCodeEvent): SessionMessageSynthetic | undefined {
  if (event.type !== "session.inbox.enqueued" || event.data.item.type !== "synthetic") return undefined
  const payload = event.data.item.payload
  const message: SessionMessageSynthetic = {
    type: "synthetic", id: event.data.inboxID, time: { created: event.created },
    text: payload.text, description: payload.description, metadata: payload.metadata,
  }
  return toBuddySubagentCompletion(message, event.data.sessionID) ? message : undefined
}
