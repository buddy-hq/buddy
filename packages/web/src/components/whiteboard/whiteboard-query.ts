import { queryOptions } from "@tanstack/react-query"
import { getBuddyClient, requireBuddyData } from "@/lib/buddy-client"

const WHITEBOARD_QUERY_SCOPE = "whiteboard" as const
const WHITEBOARD_QUERY_STALE_TIME_MS = 0

const whiteboardQueryKeys = {
  object: (directory: string, objectID: string) =>
    [WHITEBOARD_QUERY_SCOPE, directory, objectID] as const,
}

function whiteboardObjectQueryOptions(directory: string, objectID: string) {
  return queryOptions({
    queryKey: whiteboardQueryKeys.object(directory, objectID),
    queryFn: async () =>
      requireBuddyData(
        await getBuddyClient(directory).objectWhiteboard.object.read({
          directory,
          objectID,
        }),
      ),
    staleTime: WHITEBOARD_QUERY_STALE_TIME_MS,
  })
}

export { whiteboardObjectQueryOptions, whiteboardQueryKeys }
