import { z } from "zod"
import type { MessageWithParts, TFailure } from "./chat-types"
import { isRecord } from "./chat-types"
import {
  MessageInfoEventSchema,
  MessagePartEventSchema,
} from "../lib/directory-chat/chat-event-schemas"
import { getBuddyClient, requireBuddyData } from "../lib/buddy-client"
import { retry } from "../lib/retry"

export const INITIAL_TRANSCRIPT_MESSAGE_LIMIT = 2
export const HISTORY_TRANSCRIPT_MESSAGE_LIMIT = 200

const TRANSCRIPT_RETRY_ATTEMPTS = 4
const TRANSCRIPT_RETRY_DELAY_MS = 500
const TRANSCRIPT_RETRY_FACTOR = 2
const NEXT_CURSOR_HEADER = "x-next-cursor"

export type SessionMessagesPage = {
  messages: MessageWithParts[]
  nextCursor: string | undefined
  complete: boolean
}

class RetryableTranscriptReloadError extends Error {
  constructor(cause: unknown) {
    super("Retryable transcript reload")
    this.name = "RetryableTranscriptReloadError"
    this.cause = cause
  }
}

const messageWithPartsSchema = z.object({
  info: MessageInfoEventSchema,
  parts: z.array(MessagePartEventSchema),
}) satisfies z.ZodType<MessageWithParts>

const sessionMessagesPayloadSchema = z.union([
  z.array(messageWithPartsSchema),
  z.object({ messages: z.array(messageWithPartsSchema) }),
])

export function parseSessionMessagesPayload<TValue>(value: TValue): MessageWithParts[] {
  const parsed = sessionMessagesPayloadSchema.safeParse(value)
  if (!parsed.success) {
    throw new Error("Session messages payload must be an array of message parts.")
  }
  return Array.isArray(parsed.data) ? parsed.data : parsed.data.messages
}

export async function fetchSessionMessagesPage(
  directory: string,
  sessionID: string,
  input?: {
    limit?: number
    before?: string
  },
): Promise<SessionMessagesPage> {
  const result = await getBuddyClient(directory).session.messages(
    Object.assign(
      { sessionID },
      input?.limit === undefined ? undefined : { limit: input.limit },
      input?.before === undefined ? undefined : { before: input.before },
    ),
  )
  const payload = requireBuddyData(result)
  const nextCursor = result.response?.headers.get(NEXT_CURSOR_HEADER) ?? undefined

  return {
    messages: parseSessionMessagesPayload(payload),
    nextCursor,
    complete: nextCursor === undefined,
  }
}

export async function fetchSessionMessagesWithRetry(
  directory: string,
  sessionID: string,
  input?: {
    shouldRetryMissing?: (error: TFailure) => Promise<boolean>
    limit?: number
    before?: string
  },
): Promise<SessionMessagesPage> {
  return retry(
    async () => {
      try {
        return await fetchSessionMessagesPage(directory, sessionID, {
          limit: input?.limit ?? INITIAL_TRANSCRIPT_MESSAGE_LIMIT,
          before: input?.before,
        })
      } catch (error) {
        const failure = error instanceof Error ? error : String(error)
        const shouldRetry = input?.shouldRetryMissing
          ? await input.shouldRetryMissing(isRecord(error) ? error : failure)
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
