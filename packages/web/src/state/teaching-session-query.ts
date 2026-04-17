import { queryOptions } from "@tanstack/react-query"
import { loadTeachingSessionState } from "./chat-actions"

const TEACHING_SESSION_QUERY_SCOPE = "teaching-session" as const
const STATE_QUERY_KEY = "state" as const
const TEACHING_SESSION_STATE_STALE_TIME_MS = 0

export const teachingSessionQueryKeys = {
  state: (directory: string, sessionID: string) =>
    [TEACHING_SESSION_QUERY_SCOPE, STATE_QUERY_KEY, directory, sessionID] as const,
}

export function teachingSessionStateQueryOptions(directory: string, sessionID: string) {
  return queryOptions({
    queryKey: teachingSessionQueryKeys.state(directory, sessionID),
    queryFn: async () => (await loadTeachingSessionState(directory, sessionID)) ?? null,
    staleTime: TEACHING_SESSION_STATE_STALE_TIME_MS,
  })
}
