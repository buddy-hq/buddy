import { queryOptions } from "@tanstack/react-query"
import { loadLearnerSnapshotViews, type LearnerSnapshotInput } from "./chat-actions"

const LEARNER_QUERY_SCOPE = "learner" as const
const SNAPSHOT_QUERY_KEY = "snapshot" as const
const UNKNOWN_PERSONA_QUERY_KEY = "__auto-persona__" as const
const UNKNOWN_SESSION_QUERY_KEY = "__no-session__" as const

function resolvePersonaQueryKey(persona: string | undefined) {
  const normalizedPersona = persona?.trim()
  return normalizedPersona && normalizedPersona.length > 0
    ? normalizedPersona
    : UNKNOWN_PERSONA_QUERY_KEY
}

function resolveSessionQueryKey(sessionID: string | undefined) {
  const normalizedSessionID = sessionID?.trim()
  return normalizedSessionID && normalizedSessionID.length > 0
    ? normalizedSessionID
    : UNKNOWN_SESSION_QUERY_KEY
}

export const learnerQueryKeys = {
  snapshotViews: (directory: string, input?: LearnerSnapshotInput) =>
    [
      LEARNER_QUERY_SCOPE,
      SNAPSHOT_QUERY_KEY,
      directory,
      resolvePersonaQueryKey(input?.persona),
      resolveSessionQueryKey(input?.sessionID),
    ] as const,
}

export function learnerSnapshotViewsQueryOptions(directory: string, input?: LearnerSnapshotInput) {
  return queryOptions({
    queryKey: learnerQueryKeys.snapshotViews(directory, input),
    queryFn: () => loadLearnerSnapshotViews(directory, input),
  })
}
