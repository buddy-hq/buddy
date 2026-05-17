import type { SessionMessagesResponses } from "@buddy/sdk"
import type { MessageWithParts } from "./chat-types"
import { getBuddyClient, requireBuddyData } from "../lib/buddy-client"
import { retry } from "../lib/retry"

const TRANSCRIPT_RETRY_ATTEMPTS = 4
const TRANSCRIPT_RETRY_DELAY_MS = 500
const TRANSCRIPT_RETRY_FACTOR = 2

class RetryableTranscriptReloadError extends Error {
  constructor(cause: unknown) {
    super("Retryable transcript reload")
    this.name = "RetryableTranscriptReloadError"
    this.cause = cause
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

function isMessageWithParts(value: unknown): value is MessageWithParts {
  const record = isRecord(value) ? value : undefined
  if (!record) return false
  if (!("info" in record)) return false
  if (!Array.isArray(record.parts)) return false
  return true
}

function isMessageWithPartsArray(value: unknown): value is MessageWithParts[] {
  return Array.isArray(value) && value.every((entry) => isMessageWithParts(entry))
}

export function parseSessionMessagesPayload(value: unknown): MessageWithParts[] {
  if (isMessageWithPartsArray(value)) {
    return value
  }

  const record = isRecord(value) ? value : undefined
  if (record && isMessageWithPartsArray(record.messages)) {
    return record.messages
  }

  throw new Error("Session messages payload must be an array of message parts.")
}

export async function fetchSessionMessages(directory: string, sessionID: string) {
  const payload = requireBuddyData<SessionMessagesResponses[200]>(
    await getBuddyClient(directory).session.messages({
      sessionID,
    }),
  )

  return parseSessionMessagesPayload(payload)
}

export async function fetchSessionMessagesWithRetry(
  directory: string,
  sessionID: string,
  input?: {
    shouldRetryMissing?: (error: unknown) => Promise<boolean>
  },
) {
  return retry(
    async () => {
      try {
        return await fetchSessionMessages(directory, sessionID)
      } catch (error) {
        const shouldRetry = input?.shouldRetryMissing
          ? await input.shouldRetryMissing(error)
          : false
        if (!shouldRetry) {
          throw error
        }

        throw new RetryableTranscriptReloadError(error)
      }
    },
    {
      attempts: TRANSCRIPT_RETRY_ATTEMPTS,
      delay: TRANSCRIPT_RETRY_DELAY_MS,
      factor: TRANSCRIPT_RETRY_FACTOR,
      retryIf: (error) => error instanceof RetryableTranscriptReloadError,
    },
  )
}
