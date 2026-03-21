import type { GlobalAgentsMdReadResponses, GlobalAgentsMdSaveResponses } from "@buddy/sdk"
import { buddyResultMessage, getBuddyClient, requireBuddyData } from "../lib/buddy-client"

export type GlobalAgentsMdState = GlobalAgentsMdReadResponses[200]

export type GlobalAgentsMdSaveResult = GlobalAgentsMdSaveResponses[200]

export class GlobalAgentsMdVersionConflictError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "GlobalAgentsMdVersionConflictError"
  }
}

export async function loadGlobalAgentsMd() {
  const result = await getBuddyClient().global.agentsMd.read()
  return requireBuddyData<GlobalAgentsMdState>(result)
}

export async function saveGlobalAgentsMd(input: { content: string; expectedVersion?: string | null }) {
  const result = await getBuddyClient().global.agentsMd.save({
    content: input.content,
    expectedVersion: input.expectedVersion,
  })
  if (result.response.status === 409) {
    throw new GlobalAgentsMdVersionConflictError(buddyResultMessage(result))
  }
  return requireBuddyData<GlobalAgentsMdSaveResult>(result)
}
