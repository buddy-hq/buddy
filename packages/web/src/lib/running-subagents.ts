import {
  readSubagentCompletion,
  readSubagentPresentation,
  type SubagentCompletion,
  type SubagentOutcome,
  type SubagentPresentation,
} from "@buddy/transcript-contract/subagent"
import type { MessagePart, MessageWithParts, SessionInfo, SessionStatusInfo } from "@/state/chat-types"
import { isSessionStatusActive } from "@/state/session-status"

export type SubagentRunStatus = "running" | "waiting" | SubagentOutcome

export type RunningSubagent = {
  childSessionID: string
  description?: string
  agentID?: string
  status: "running" | "waiting"
  blocking: boolean
}

export type RunningSubagentsInput = {
  ownerSessionID: string
  messages: readonly MessageWithParts[]
  sessions: readonly Pick<SessionInfo, "id" | "parentID" | "title">[]
  sessionStatusByID: Readonly<Record<string, SessionStatusInfo>>
}

type SubagentRun = { launch: SubagentPresentation; completion?: SubagentCompletion }

type SubagentTranscriptIndex = {
  completions: SubagentCompletion[]
  completionByLaunch: Map<string, SubagentCompletion>
  latestRunByChild: Map<string, SubagentRun>
}

const indexes = new WeakMap<readonly MessageWithParts[], SubagentTranscriptIndex>()

function launchKey(launch: Pick<SubagentPresentation, "messageID" | "callID">) {
  return `${launch.messageID}\u0000${launch.callID}`
}

export function readPartSubagent(part: MessagePart): SubagentPresentation | undefined {
  return part.type === "tool" ? readSubagentPresentation(part.subagent) : undefined
}

function readPartCompletion(part: MessagePart): SubagentCompletion | undefined {
  return part.type === "notice" ? readSubagentCompletion(part.completion) : undefined
}

function indexSubagentTranscript(messages: readonly MessageWithParts[]): SubagentTranscriptIndex {
  const cached = indexes.get(messages)
  if (cached) return cached
  const completions = new Map<string, SubagentCompletion>()
  const completionByLaunch = new Map<string, SubagentCompletion>()
  const latestRunByChild = new Map<string, SubagentRun>()
  const openLaunches = new Map<string, string[]>()
  for (const message of messages) {
    for (const part of message.parts) {
      const launch = readPartSubagent(part)
      if (launch?.childSessionID) {
        latestRunByChild.set(launch.childSessionID, { launch })
        if (launch.workerStatus === "running") {
          openLaunches.set(launch.childSessionID, [...(openLaunches.get(launch.childSessionID) ?? []), launchKey(launch)])
        }
        continue
      }
      const completion = readPartCompletion(part)
      if (!completion || completions.has(completion.messageID)) continue
      completions.set(completion.messageID, completion)
      for (const key of openLaunches.get(completion.childSessionID) ?? []) completionByLaunch.set(key, completion)
      openLaunches.delete(completion.childSessionID)
      const run = latestRunByChild.get(completion.childSessionID)
      if (run && !run.completion && run.launch.workerStatus === "running") run.completion = completion
    }
  }
  const index = { completions: [...completions.values()], completionByLaunch, latestRunByChild }
  indexes.set(messages, index)
  return index
}

export function subagentCompletions(messages: readonly MessageWithParts[]): SubagentCompletion[] {
  return indexSubagentTranscript(messages).completions
}

export function completionForSubagent(messages: readonly MessageWithParts[], launch: SubagentPresentation): SubagentCompletion | undefined {
  return indexSubagentTranscript(messages).completionByLaunch.get(launchKey(launch))
}

export function subagentRunStatus(launch: SubagentPresentation, completion: SubagentCompletion | undefined, childActive: boolean): SubagentRunStatus {
  if (launch.workerStatus !== "running") return launch.workerStatus
  if (childActive) return "running"
  if (completion) return completion.outcome
  return launch.background ? "waiting" : "running"
}

export function deriveRunningSubagents(input: RunningSubagentsInput): RunningSubagent[] {
  const work = new Map<string, RunningSubagent>()
  for (const [childSessionID, run] of indexSubagentTranscript(input.messages).latestRunByChild) {
    const active = isSessionStatusActive(input.sessionStatusByID[childSessionID])
    const status = subagentRunStatus(run.launch, run.completion, active)
    if (status === "waiting" || (status === "running" && active)) {
      work.set(childSessionID, { childSessionID, description: run.launch.description, agentID: run.launch.agentID, status, blocking: !run.launch.background })
    }
  }
  for (const session of input.sessions) {
    if (session.parentID !== input.ownerSessionID || work.has(session.id)) continue
    if (!isSessionStatusActive(input.sessionStatusByID[session.id])) continue
    work.set(session.id, { childSessionID: session.id, description: session.title || undefined, status: "running", blocking: false })
  }
  return [...work.values()]
}
