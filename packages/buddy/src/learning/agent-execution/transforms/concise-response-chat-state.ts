import type { Conversations } from "@buddy/agent-runtime/conversations"
import { getAgentRuntime } from "../../../runtime/agent-runtime"
import { isNotFound } from "@buddy/agent-runtime/errors"
import { parseJsonObject, parsePromptBoolean } from "../../prompt/utils"
import type { ConciseResponseChatState } from "../../shared/concise-responses"

const CONCISE_RESPONSES_BASE_METADATA_KEY = "buddy_concise_responses_base"
const CONCISE_RESPONSES_APPLIED_METADATA_KEY = "buddy_concise_responses_applied"

export async function readConciseResponseChatState(input: {
  directory: string
  sessionID: string
  configured: boolean
}, conversations?: Conversations): Promise<ConciseResponseChatState> {
  try {
    const chats = conversations ?? (await getAgentRuntime()).conversations
    const session = await chats.get(input.sessionID)
    const metadata = parseJsonObject(session.metadata) ?? {}
    const storedBase = parsePromptBoolean(metadata[CONCISE_RESPONSES_BASE_METADATA_KEY])
    const storedApplied = parsePromptBoolean(metadata[CONCISE_RESPONSES_APPLIED_METADATA_KEY])
    if (storedBase !== undefined && storedApplied !== undefined) return { base: storedBase, applied: storedApplied }
    const messages = await chats.history({ sessionID: input.sessionID, directory: input.directory }, { limit: 1 })
    const base = messages.items.length > 0 ? true : input.configured
    return { base, applied: base }

  } catch (error) {
    if (!isNotFound(error, "session")) throw error
    return {
      base: input.configured,
      applied: input.configured,
    }
  }
}

export async function persistConciseResponseChatState(input: {
  directory: string
  sessionID: string
  base: boolean
  applied: boolean
}, conversations?: Conversations): Promise<void> {
  try {
    const chats = conversations ?? (await getAgentRuntime()).conversations
    const session = await chats.get(input.sessionID)
    const metadata = session.metadata ?? {}
    if (metadata[CONCISE_RESPONSES_BASE_METADATA_KEY] === input.base && metadata[CONCISE_RESPONSES_APPLIED_METADATA_KEY] === input.applied) return
    await chats.patchMetadata(input.sessionID, {
      [CONCISE_RESPONSES_BASE_METADATA_KEY]: input.base,
      [CONCISE_RESPONSES_APPLIED_METADATA_KEY]: input.applied,
    })

  } catch (error) {
    if (!isNotFound(error, "session")) throw error
  }
}
