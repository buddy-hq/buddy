import type { SessionClient } from "@buddy/opencode-adapter/gateway/client"
import { getOpenCodeClient } from "../../../opencode-runtime/client"
import { isSessionNotFound as isSessionNotFoundError } from "@buddy/opencode-adapter/gateway/errors"
import { listMessages } from "@buddy/opencode-adapter/gateway/message"
import { parseJsonObject, parsePromptBoolean } from "../../prompt/utils"
import type { ConciseResponseChatState } from "../../shared/concise-responses"

const CONCISE_RESPONSES_BASE_METADATA_KEY = "buddy_concise_responses_base"
const CONCISE_RESPONSES_APPLIED_METADATA_KEY = "buddy_concise_responses_applied"

export async function readConciseResponseChatState(input: {
  directory: string
  sessionID: string
  configured: boolean
}, client?: SessionClient): Promise<ConciseResponseChatState> {
  try {
    const host = client ?? await getOpenCodeClient()
    const session = await host.session.get({ sessionID: input.sessionID })
    const metadata = parseJsonObject(session.metadata) ?? {}
    const storedBase = parsePromptBoolean(metadata[CONCISE_RESPONSES_BASE_METADATA_KEY])
    const storedApplied = parsePromptBoolean(metadata[CONCISE_RESPONSES_APPLIED_METADATA_KEY])
    if (storedBase !== undefined && storedApplied !== undefined) return { base: storedBase, applied: storedApplied }
    const messages = await listMessages(host, { sessionID: input.sessionID, directory: input.directory }, { limit: 1 })
    const base = messages.items.length > 0 ? true : input.configured
    return { base, applied: base }

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
}, client?: SessionClient): Promise<void> {
  try {
    const host = client ?? await getOpenCodeClient()
    const session = await host.session.get({ sessionID: input.sessionID })
    const metadata = session.metadata ?? {}
    if (metadata[CONCISE_RESPONSES_BASE_METADATA_KEY] === input.base && metadata[CONCISE_RESPONSES_APPLIED_METADATA_KEY] === input.applied) return
    await host.session.update({ sessionID: input.sessionID, metadata: {
      ...metadata,
      [CONCISE_RESPONSES_BASE_METADATA_KEY]: input.base,
      [CONCISE_RESPONSES_APPLIED_METADATA_KEY]: input.applied,
    } })

  } catch (error) {
    if (!isSessionNotFoundError(error)) throw error
  }
}
