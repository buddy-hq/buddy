import { queryOptions } from "@tanstack/react-query"
import { getBuddyClient, requireBuddyData } from "@/lib/buddy-client"

const WHITEBOARD_QUERY_SCOPE = "whiteboard" as const
const WHITEBOARD_QUERY_STALE_TIME_MS = 0

const whiteboardQueryKeys = {
  session: (directory: string, sessionID: string) =>
    [WHITEBOARD_QUERY_SCOPE, directory, sessionID] as const,
  sessionPeek: (directory: string, sessionID: string) =>
    [WHITEBOARD_QUERY_SCOPE, "peek", directory, sessionID] as const,
}

function whiteboardSessionQueryOptions(directory: string, sessionID: string) {
  return queryOptions({
    queryKey: whiteboardQueryKeys.session(directory, sessionID),
    queryFn: async () =>
      requireBuddyData(
        await getBuddyClient(directory).objectWhiteboard.session.read({
          directory,
          sessionID,
        }),
      ),
    staleTime: WHITEBOARD_QUERY_STALE_TIME_MS,
  })
}

function whiteboardSessionPeekQueryOptions(directory: string, sessionID: string) {
  return queryOptions({
    queryKey: whiteboardQueryKeys.sessionPeek(directory, sessionID),
    queryFn: async () =>
      requireBuddyData(
        await getBuddyClient(directory).objectWhiteboard.session.peek({
          directory,
          sessionID,
        }),
      ),
    staleTime: WHITEBOARD_QUERY_STALE_TIME_MS,
  })
}

export { whiteboardQueryKeys, whiteboardSessionPeekQueryOptions, whiteboardSessionQueryOptions }
