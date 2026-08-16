import { queryOptions } from "@tanstack/react-query"
import type { ObjectWhiteboardObjectReadResponse } from "@buddy/sdk"
import { getBuddyClient, requireBuddyData } from "@/lib/buddy-client"

const WHITEBOARD_QUERY_SCOPE = "whiteboard" as const
const WHITEBOARD_QUERY_STALE_TIME_MS = 0

const whiteboardQueryKeys = {
  object: (directory: string, objectID: string) =>
    [WHITEBOARD_QUERY_SCOPE, directory, objectID] as const,
}

type TWhiteboardObjectQueryKey = ReturnType<typeof whiteboardQueryKeys.object>
type TWhiteboardObjectQueryOptions = ReturnType<
  typeof queryOptions<
    ObjectWhiteboardObjectReadResponse,
    Error,
    ObjectWhiteboardObjectReadResponse,
    TWhiteboardObjectQueryKey
  >
>

async function loadWhiteboardObject(
  directory: string,
  objectID: string,
): Promise<ObjectWhiteboardObjectReadResponse> {
  return requireBuddyData(
    await getBuddyClient(directory).objectWhiteboard.object.read({
      directory,
      objectID,
    }),
  )
}

function whiteboardObjectQueryOptions(
  directory: string,
  objectID: string,
): TWhiteboardObjectQueryOptions {
  return queryOptions({
    queryKey: whiteboardQueryKeys.object(directory, objectID),
    queryFn: () => loadWhiteboardObject(directory, objectID),
    staleTime: WHITEBOARD_QUERY_STALE_TIME_MS,
  })
}

export { whiteboardObjectQueryOptions, whiteboardQueryKeys }
