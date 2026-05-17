import { queryOptions, type QueryClient } from "@tanstack/react-query"
import { fetchSessionMessages } from "./session-messages"
import type { MessageWithParts } from "./chat-types"

const DIRECTORY_CHAT_QUERY_SCOPE = "directory-chat" as const
const DIRECTORY_CHAT_MESSAGES_QUERY_KEY = "messages" as const
const GLOBAL_DIRECTORY_QUERY_KEY = "__global__" as const
const DIRECTORY_CHAT_MESSAGES_STALE_TIME_MS = 60_000

function resolveDirectoryQueryKey(directory: string) {
  const normalizedDirectory = directory.trim()
  return normalizedDirectory.length > 0 ? normalizedDirectory : GLOBAL_DIRECTORY_QUERY_KEY
}

export const sessionMessagesQueryKeys = {
  messages: (directory: string, sessionID: string) =>
    [
      DIRECTORY_CHAT_QUERY_SCOPE,
      DIRECTORY_CHAT_MESSAGES_QUERY_KEY,
      resolveDirectoryQueryKey(directory),
      sessionID,
    ] as const,
}

export function directorySessionMessagesQueryOptions(directory: string, sessionID: string) {
  return queryOptions({
    queryKey: sessionMessagesQueryKeys.messages(directory, sessionID),
    queryFn: () => fetchSessionMessages(directory, sessionID),
    staleTime: DIRECTORY_CHAT_MESSAGES_STALE_TIME_MS,
  })
}

export function setDirectorySessionMessagesQueryData(
  queryClient: QueryClient,
  directory: string,
  sessionID: string,
  messages: MessageWithParts[],
) {
  queryClient.setQueryData(sessionMessagesQueryKeys.messages(directory, sessionID), messages)
}
