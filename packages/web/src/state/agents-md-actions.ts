import type { AgentsMdReadResponses, AgentsMdSaveResponses } from "@buddy/sdk"
import { buddyResultMessage, getBuddyClient, requireBuddyData } from "../lib/buddy-client"

export type NotebookAgentsMdState = AgentsMdReadResponses[200]

export type NotebookAgentsMdSaveResult = AgentsMdSaveResponses[200]

export class NotebookAgentsMdVersionConflictError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "NotebookAgentsMdVersionConflictError"
  }
}

export async function loadNotebookAgentsMd(directory: string) {
  const result = await getBuddyClient(directory).agentsMd.read()
  return requireBuddyData<NotebookAgentsMdState>(result)
}

export async function saveNotebookAgentsMd(input: {
  directory: string
  content: string
  expectedVersion?: string | null
}) {
  const result = await getBuddyClient(input.directory).agentsMd.save({
    content: input.content,
    expectedVersion: input.expectedVersion,
  })
  if (result.response.status === 409) {
    throw new NotebookAgentsMdVersionConflictError(buddyResultMessage(result))
  }
  return requireBuddyData<NotebookAgentsMdSaveResult>(result)
}
