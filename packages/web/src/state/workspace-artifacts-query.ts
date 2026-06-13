import { queryOptions } from "@tanstack/react-query"
import {
  loadWorkspaceFlashcardDecks,
  loadWorkspaceMermaidArtifacts,
  loadWorkspaceQuestionSetArtifacts,
} from "./chat-actions"
import { loadWorkspaceHtmlWidgets } from "@/lib/html-widgets"

const WORKSPACE_ARTIFACTS_QUERY_SCOPE = "workspace-artifacts" as const
const MERMAID_ARTIFACTS_QUERY_KEY = "mermaid" as const
const QUESTION_SET_ARTIFACTS_QUERY_KEY = "question-set" as const
const FLASHCARD_ARTIFACTS_QUERY_KEY = "flashcard" as const
const HTML_WIDGET_ARTIFACTS_QUERY_KEY = "html-widget" as const
const WORKSPACE_ARTIFACTS_STALE_TIME_MS = 0

export const workspaceArtifactsQueryKeys = {
  mermaid: (directory: string) =>
    [WORKSPACE_ARTIFACTS_QUERY_SCOPE, MERMAID_ARTIFACTS_QUERY_KEY, directory] as const,
  questionSet: (directory: string) =>
    [WORKSPACE_ARTIFACTS_QUERY_SCOPE, QUESTION_SET_ARTIFACTS_QUERY_KEY, directory] as const,
  flashcard: (directory: string) =>
    [WORKSPACE_ARTIFACTS_QUERY_SCOPE, FLASHCARD_ARTIFACTS_QUERY_KEY, directory] as const,
  htmlWidget: (directory: string) =>
    [WORKSPACE_ARTIFACTS_QUERY_SCOPE, HTML_WIDGET_ARTIFACTS_QUERY_KEY, directory] as const,
}

export function workspaceMermaidArtifactsQueryOptions(directory: string) {
  return queryOptions({
    queryKey: workspaceArtifactsQueryKeys.mermaid(directory),
    queryFn: () => loadWorkspaceMermaidArtifacts(directory),
    staleTime: WORKSPACE_ARTIFACTS_STALE_TIME_MS,
  })
}

export function workspaceQuestionSetArtifactsQueryOptions(directory: string) {
  return queryOptions({
    queryKey: workspaceArtifactsQueryKeys.questionSet(directory),
    queryFn: () => loadWorkspaceQuestionSetArtifacts(directory),
    staleTime: WORKSPACE_ARTIFACTS_STALE_TIME_MS,
  })
}

export function workspaceFlashcardDecksQueryOptions(directory: string) {
  return queryOptions({
    queryKey: workspaceArtifactsQueryKeys.flashcard(directory),
    queryFn: () => loadWorkspaceFlashcardDecks(directory),
    staleTime: WORKSPACE_ARTIFACTS_STALE_TIME_MS,
  })
}

export function workspaceHtmlWidgetsQueryOptions(directory: string) {
  return queryOptions({
    queryKey: workspaceArtifactsQueryKeys.htmlWidget(directory),
    queryFn: () => loadWorkspaceHtmlWidgets(directory),
    staleTime: WORKSPACE_ARTIFACTS_STALE_TIME_MS,
  })
}
