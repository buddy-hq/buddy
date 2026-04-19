import { queryOptions, type QueryClient } from "@tanstack/react-query"
import { loadPermissions, loadQuestions, loadSessions } from "./chat-actions"
import type { PermissionRequest, QuestionRequest, SessionInfo } from "./chat-types"

const DIRECTORY_CHAT_QUERY_SCOPE = "directory-chat" as const
const DIRECTORY_CHAT_SESSIONS_QUERY_KEY = "sessions" as const
const DIRECTORY_CHAT_PERMISSIONS_QUERY_KEY = "permissions" as const
const DIRECTORY_CHAT_QUESTIONS_QUERY_KEY = "questions" as const
const GLOBAL_DIRECTORY_QUERY_KEY = "__global__" as const
const DIRECTORY_CHAT_QUERY_STALE_TIME_MS = 5_000

function resolveDirectoryQueryKey(directory: string) {
  const normalizedDirectory = directory.trim()
  return normalizedDirectory.length > 0 ? normalizedDirectory : GLOBAL_DIRECTORY_QUERY_KEY
}

function sessionUpdatedAt(session: SessionInfo) {
  return session.time.updated ?? session.time.created
}

function sortSessions(sessions: SessionInfo[]) {
  return sessions
    .filter((session) => !session.time.archived)
    .slice()
    .toSorted((left, right) => sessionUpdatedAt(right) - sessionUpdatedAt(left))
}

function upsertSession(sessions: SessionInfo[], session: SessionInfo) {
  if (session.time.archived) {
    return sortSessions(sessions.filter((entry) => entry.id !== session.id))
  }

  const existingIndex = sessions.findIndex((entry) => entry.id === session.id)
  if (existingIndex === -1) {
    return sortSessions([...sessions, session])
  }

  const nextSessions = sessions.slice()
  nextSessions[existingIndex] = session
  return sortSessions(nextSessions)
}

function upsertPermissionRequest(requests: PermissionRequest[], request: PermissionRequest) {
  const existingIndex = requests.findIndex((entry) => entry.id === request.id)
  if (existingIndex === -1) {
    return [...requests, request]
  }

  const nextRequests = requests.slice()
  nextRequests[existingIndex] = request
  return nextRequests
}

function upsertQuestionRequest(requests: QuestionRequest[], request: QuestionRequest) {
  const existingIndex = requests.findIndex((entry) => entry.id === request.id)
  if (existingIndex === -1) {
    return [...requests, request]
  }

  const nextRequests = requests.slice()
  nextRequests[existingIndex] = request
  return nextRequests
}

export const directoryChatQueryKeys = {
  sessions: (directory: string) =>
    [
      DIRECTORY_CHAT_QUERY_SCOPE,
      DIRECTORY_CHAT_SESSIONS_QUERY_KEY,
      resolveDirectoryQueryKey(directory),
    ] as const,
  permissions: (directory: string) =>
    [
      DIRECTORY_CHAT_QUERY_SCOPE,
      DIRECTORY_CHAT_PERMISSIONS_QUERY_KEY,
      resolveDirectoryQueryKey(directory),
    ] as const,
  questions: (directory: string) =>
    [
      DIRECTORY_CHAT_QUERY_SCOPE,
      DIRECTORY_CHAT_QUESTIONS_QUERY_KEY,
      resolveDirectoryQueryKey(directory),
    ] as const,
}

export function directorySessionsQueryOptions(directory: string) {
  return queryOptions({
    queryKey: directoryChatQueryKeys.sessions(directory),
    queryFn: () => loadSessions(directory),
    staleTime: DIRECTORY_CHAT_QUERY_STALE_TIME_MS,
  })
}

export function directoryPermissionsQueryOptions(directory: string) {
  return queryOptions({
    queryKey: directoryChatQueryKeys.permissions(directory),
    queryFn: () => loadPermissions(directory),
    staleTime: DIRECTORY_CHAT_QUERY_STALE_TIME_MS,
  })
}

export function directoryQuestionsQueryOptions(directory: string) {
  return queryOptions({
    queryKey: directoryChatQueryKeys.questions(directory),
    queryFn: () => loadQuestions(directory),
    staleTime: DIRECTORY_CHAT_QUERY_STALE_TIME_MS,
  })
}

export function setDirectorySessionsQueryData(
  queryClient: QueryClient,
  directory: string,
  sessions: SessionInfo[],
) {
  queryClient.setQueryData(directoryChatQueryKeys.sessions(directory), sortSessions(sessions))
}

export function upsertDirectorySessionQueryData(
  queryClient: QueryClient,
  directory: string,
  session: SessionInfo,
) {
  queryClient.setQueryData<SessionInfo[]>(directoryChatQueryKeys.sessions(directory), (current) =>
    upsertSession(current ?? [], session),
  )
}

export function setDirectoryPermissionsQueryData(
  queryClient: QueryClient,
  directory: string,
  requests: PermissionRequest[],
) {
  queryClient.setQueryData(directoryChatQueryKeys.permissions(directory), requests)
}

export function setDirectoryQuestionsQueryData(
  queryClient: QueryClient,
  directory: string,
  requests: QuestionRequest[],
) {
  queryClient.setQueryData(directoryChatQueryKeys.questions(directory), requests)
}

export function upsertDirectoryPermissionQueryData(
  queryClient: QueryClient,
  directory: string,
  request: PermissionRequest,
) {
  queryClient.setQueryData<PermissionRequest[]>(
    directoryChatQueryKeys.permissions(directory),
    (current) => upsertPermissionRequest(current ?? [], request),
  )
}

export function upsertDirectoryQuestionQueryData(
  queryClient: QueryClient,
  directory: string,
  request: QuestionRequest,
) {
  queryClient.setQueryData<QuestionRequest[]>(
    directoryChatQueryKeys.questions(directory),
    (current) => upsertQuestionRequest(current ?? [], request),
  )
}

export function removeDirectoryPermissionQueryData(
  queryClient: QueryClient,
  directory: string,
  requestID: string,
) {
  queryClient.setQueryData<PermissionRequest[]>(
    directoryChatQueryKeys.permissions(directory),
    (current) => current?.filter((request) => request.id !== requestID) ?? [],
  )
}

export function removeDirectoryQuestionQueryData(
  queryClient: QueryClient,
  directory: string,
  requestID: string,
) {
  queryClient.setQueryData<QuestionRequest[]>(
    directoryChatQueryKeys.questions(directory),
    (current) => current?.filter((request) => request.id !== requestID) ?? [],
  )
}

export async function removeDirectoryChatQueries(queryClient: QueryClient, directory: string) {
  await Promise.all([
    queryClient.removeQueries({
      queryKey: directoryChatQueryKeys.sessions(directory),
    }),
    queryClient.removeQueries({
      queryKey: directoryChatQueryKeys.permissions(directory),
    }),
    queryClient.removeQueries({
      queryKey: directoryChatQueryKeys.questions(directory),
    }),
  ])
}
