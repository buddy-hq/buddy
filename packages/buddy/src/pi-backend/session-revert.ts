import type { SessionEntry, SessionManager } from "@earendil-works/pi-coding-agent"
import type { PiAgentMessage } from "./types"
import { BUDDY_PROMPT_CUSTOM_TYPE } from "./contracts"

const TRANSCRIPT_ID_RADIX = 36
const REVERT_CUSTOM_ENTRY_TYPE = "buddy-session-revert-leaf"
const UNREVERT_CUSTOM_ENTRY_TYPE = "buddy-session-unrevert-leaf"

type ResolvedSessionMessage = {
  entry: SessionEntry
  message: PiAgentMessage
}

function parseIsoTimestamp(value: string) {
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? parsed : Date.now()
}

function createCompactionSummaryMessage(entry: Extract<SessionEntry, { type: "compaction" }>): PiAgentMessage {
  return {
    role: "compactionSummary",
    summary: entry.summary,
    tokensBefore: entry.tokensBefore,
    timestamp: parseIsoTimestamp(entry.timestamp),
  }
}

function createBranchSummaryMessage(
  entry: Extract<SessionEntry, { type: "branch_summary" }>,
): PiAgentMessage {
  return {
    role: "branchSummary",
    summary: entry.summary,
    fromId: entry.fromId,
    timestamp: parseIsoTimestamp(entry.timestamp),
  }
}

function createCustomMessage(entry: Extract<SessionEntry, { type: "custom_message" }>): PiAgentMessage {
  return {
    role: "custom",
    customType: entry.customType,
    content: entry.content,
    display: entry.display,
    details: entry.details,
    timestamp: parseIsoTimestamp(entry.timestamp),
  }
}

function appendResolvedMessage(messages: ResolvedSessionMessage[], entry: SessionEntry) {
  if (entry.type === "message") {
    messages.push({
      entry,
      message: entry.message,
    })
    return
  }

  if (entry.type === "custom_message") {
    messages.push({
      entry,
      message: createCustomMessage(entry),
    })
    return
  }

  if (entry.type === "branch_summary" && entry.summary) {
    messages.push({
      entry,
      message: createBranchSummaryMessage(entry),
    })
    return
  }
}

function branchPath(sessionManager: SessionManager) {
  return sessionManager.getBranch()
}

export function resolvedSessionMessages(sessionManager: SessionManager): ResolvedSessionMessage[] {
  const path = branchPath(sessionManager)
  let compaction: Extract<SessionEntry, { type: "compaction" }> | undefined

  for (const entry of path) {
    if (entry.type === "compaction") {
      compaction = entry
    }
  }

  const resolved: ResolvedSessionMessage[] = []
  if (!compaction) {
    for (const entry of path) {
      appendResolvedMessage(resolved, entry)
    }
    return resolved
  }

  resolved.push({
    entry: compaction,
    message: createCompactionSummaryMessage(compaction),
  })

  const compactionIndex = path.findIndex((entry) => entry.id === compaction.id)
  let foundFirstKept = false

  for (let index = 0; index < compactionIndex; index += 1) {
    const entry = path[index]
    if (!entry) continue
    if (entry.id === compaction.firstKeptEntryId) {
      foundFirstKept = true
    }
    if (foundFirstKept) {
      appendResolvedMessage(resolved, entry)
    }
  }

  for (let index = compactionIndex + 1; index < path.length; index += 1) {
    const entry = path[index]
    if (!entry) continue
    appendResolvedMessage(resolved, entry)
  }

  return resolved
}

function transcriptIndex(messageID: string): number | undefined {
  const separatorIndex = messageID.lastIndexOf("_")
  if (separatorIndex === -1) return undefined
  const rawIndex = messageID.slice(separatorIndex + 1)
  const parsed = Number.parseInt(rawIndex, TRANSCRIPT_ID_RADIX)
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : undefined
}

export function resolveRevertTarget(input: {
  messageID: string
  sessionManager: SessionManager
}) {
  const index = transcriptIndex(input.messageID)
  if (index === undefined) {
    throw new Error(`Unsupported session message id "${input.messageID}".`)
  }

  const message = resolvedSessionMessages(input.sessionManager)[index]
  if (!message) {
    throw new Error(`Session message "${input.messageID}" was not found.`)
  }

  const sourceMessage = message.message
  const snapshotKey =
    sourceMessage.role === "custom" &&
    sourceMessage.customType === BUDDY_PROMPT_CUSTOM_TYPE &&
    sourceMessage.details &&
    typeof sourceMessage.details === "object" &&
    "messageID" in sourceMessage.details &&
    typeof sourceMessage.details.messageID === "string"
      ? sourceMessage.details.messageID
      : input.messageID

  return {
    entry: message.entry,
    targetLeafId: message.entry.parentId,
    workspaceSnapshotKey: snapshotKey,
  }
}

export function persistSessionLeafPosition(input: {
  sessionManager: SessionManager
  targetLeafId: string | null
  reverted: boolean
}) {
  if (input.targetLeafId === null) {
    input.sessionManager.resetLeaf()
  } else {
    input.sessionManager.branch(input.targetLeafId)
  }

  input.sessionManager.appendCustomEntry(
    input.reverted ? REVERT_CUSTOM_ENTRY_TYPE : UNREVERT_CUSTOM_ENTRY_TYPE,
    {
      targetLeafId: input.targetLeafId,
    },
  )
}
