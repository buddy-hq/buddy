import { queryOptions } from "@tanstack/react-query"
import type { ArtifactsListData, ArtifactsListResponse } from "@buddy/sdk/types"
import { getBuddyClient, requireBuddyData } from "@/lib/buddy-client"

type WorkspaceArtifactKind = NonNullable<NonNullable<ArtifactsListData["query"]>["kind"]>

const WORKSPACE_ARTIFACTS_QUERY_SCOPE = "workspace-artifacts" as const
const MERMAID_ARTIFACTS_QUERY_KEY = "mermaid" satisfies WorkspaceArtifactKind
const QUESTION_SET_ARTIFACTS_QUERY_KEY = "question-set" satisfies WorkspaceArtifactKind
const FLASHCARD_ARTIFACTS_QUERY_KEY = "flashcard-deck" satisfies WorkspaceArtifactKind
const HTML_WIDGET_ARTIFACTS_QUERY_KEY = "html-widget" satisfies WorkspaceArtifactKind
const MEDIA_PRESENTATION_ARTIFACTS_QUERY_KEY = "media-presentation" satisfies WorkspaceArtifactKind
const FIGURE_ARTIFACTS_QUERY_KEY = "figure" satisfies WorkspaceArtifactKind
const FREEFORM_FIGURE_ARTIFACTS_QUERY_KEY = "freeform-figure" satisfies WorkspaceArtifactKind
const WORKSPACE_ARTIFACTS_STALE_TIME_MS = 0

function workspaceArtifactKindQueryKey(directory: string, kind: WorkspaceArtifactKind) {
  return [WORKSPACE_ARTIFACTS_QUERY_SCOPE, directory, kind] as const
}

export const workspaceArtifactsQueryKeys = {
  all: (directory: string) => [WORKSPACE_ARTIFACTS_QUERY_SCOPE, directory] as const,
  kind: workspaceArtifactKindQueryKey,
  mermaid: (directory: string) => workspaceArtifactKindQueryKey(directory, MERMAID_ARTIFACTS_QUERY_KEY),
  questionSet: (directory: string) =>
    workspaceArtifactKindQueryKey(directory, QUESTION_SET_ARTIFACTS_QUERY_KEY),
  flashcard: (directory: string) =>
    workspaceArtifactKindQueryKey(directory, FLASHCARD_ARTIFACTS_QUERY_KEY),
  htmlWidget: (directory: string) =>
    workspaceArtifactKindQueryKey(directory, HTML_WIDGET_ARTIFACTS_QUERY_KEY),
  mediaPresentation: (directory: string) =>
    workspaceArtifactKindQueryKey(directory, MEDIA_PRESENTATION_ARTIFACTS_QUERY_KEY),
  figure: (directory: string) => workspaceArtifactKindQueryKey(directory, FIGURE_ARTIFACTS_QUERY_KEY),
  freeformFigure: (directory: string) =>
    workspaceArtifactKindQueryKey(directory, FREEFORM_FIGURE_ARTIFACTS_QUERY_KEY),
}

export async function loadWorkspaceArtifacts(
  directory: string,
  kind?: WorkspaceArtifactKind,
): Promise<ArtifactsListResponse> {
  return requireBuddyData(
    await getBuddyClient(directory).artifacts.list({
      directory,
      ...(kind ? { kind } : {}),
    }),
  )
}

export function workspaceArtifactsQueryOptions(directory: string, kind?: WorkspaceArtifactKind) {
  return queryOptions({
    queryKey: kind
      ? workspaceArtifactsQueryKeys.kind(directory, kind)
      : workspaceArtifactsQueryKeys.all(directory),
    queryFn: () => loadWorkspaceArtifacts(directory, kind),
    staleTime: WORKSPACE_ARTIFACTS_STALE_TIME_MS,
  })
}

export function workspaceMermaidArtifactsQueryOptions(directory: string) {
  return workspaceArtifactsQueryOptions(directory, MERMAID_ARTIFACTS_QUERY_KEY)
}

export function workspaceQuestionSetArtifactsQueryOptions(directory: string) {
  return workspaceArtifactsQueryOptions(directory, QUESTION_SET_ARTIFACTS_QUERY_KEY)
}

export function workspaceFlashcardDecksQueryOptions(directory: string) {
  return workspaceArtifactsQueryOptions(directory, FLASHCARD_ARTIFACTS_QUERY_KEY)
}

export function workspaceHtmlWidgetsQueryOptions(directory: string) {
  return workspaceArtifactsQueryOptions(directory, HTML_WIDGET_ARTIFACTS_QUERY_KEY)
}
