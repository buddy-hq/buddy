import { SessionID } from "@buddy/opencode-adapter/id"
import { Instance as OpenCodeInstance } from "@buddy/opencode-adapter/instance"
import { Session as OpenCodeSession } from "@buddy/opencode-adapter/session"
import { isSessionNotFoundError } from "../../../session"
import { parseJsonObject, parsePromptBoolean } from "../../prompt/utils"
import type { ConciseResponseChatState } from "../../shared/concise-responses"

const CONCISE_RESPONSES_BASE_METADATA_KEY = "buddy_concise_responses_base"
const CONCISE_RESPONSES_APPLIED_METADATA_KEY = "buddy_concise_responses_applied"

export async function readConciseResponseChatState(input: {
  directory: string
  sessionID: string
  configured: boolean
}): Promise<ConciseResponseChatState> {
  try {
    return await OpenCodeInstance.provide({
      directory: input.directory,
      fn: async () => {
        const sessionID = SessionID.make(input.sessionID)
        const session = await OpenCodeSession.get(sessionID)
        const metadata = parseJsonObject(session.metadata) ?? {}
        const storedBase = parsePromptBoolean(metadata[CONCISE_RESPONSES_BASE_METADATA_KEY])
        const storedApplied = parsePromptBoolean(metadata[CONCISE_RESPONSES_APPLIED_METADATA_KEY])
        if (storedBase !== undefined && storedApplied !== undefined) {
          return { base: storedBase, applied: storedApplied }
        }

        const messages = await OpenCodeSession.messages({ sessionID, limit: 1 })
        const legacyExistingChat = messages.length > 0
        const base = legacyExistingChat ? true : input.configured
        return {
          base,
          applied: legacyExistingChat ? true : base,
        }
      },
    })
  } catch (error) {
    if (!isSessionNotFoundError(error)) throw error
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
}): Promise<void> {
  try {
    await OpenCodeInstance.provide({
      directory: input.directory,
      fn: async () => {
        const sessionID = SessionID.make(input.sessionID)
        const session = await OpenCodeSession.get(sessionID)
        const metadata = parseJsonObject(session.metadata) ?? {}
        const baseMatches =
          parsePromptBoolean(metadata[CONCISE_RESPONSES_BASE_METADATA_KEY]) === input.base
        const appliedMatches =
          parsePromptBoolean(metadata[CONCISE_RESPONSES_APPLIED_METADATA_KEY]) === input.applied
        if (baseMatches && appliedMatches) return

        await OpenCodeSession.setMetadata({
          sessionID,
          metadata: {
            ...metadata,
            [CONCISE_RESPONSES_BASE_METADATA_KEY]: input.base,
            [CONCISE_RESPONSES_APPLIED_METADATA_KEY]: input.applied,
          },
        })
      },
    })
  } catch (error) {
    if (!isSessionNotFoundError(error)) throw error
  }
}
