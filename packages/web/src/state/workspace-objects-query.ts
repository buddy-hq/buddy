import { queryOptions, type QueryClient } from "@tanstack/react-query"
import type {
  ObjectFlashcardDeckQueuedCardsResponse,
  ObjectFlashcardDeckReadDeckResponse,
  ObjectMediaPresentationAvailabilityResponse,
  ObjectMermaidReadSourceResponse,
  ObjectQuestionSetReadQuestionsResponse,
  ObjectsListData,
  ObjectsListResponse,
  ObjectsReadData,
  ObjectsReadResponse,
  ObjectsViewData,
  ObjectsViewResponse,
} from "@buddy/sdk/types"
import { getBuddyClient, requireBuddyData } from "@/lib/buddy-client"
import { FLASHCARD_QUEUE_REFETCH_FLOOR_MS } from "@/lib/flashcard"

type WorkspaceObjectKind = NonNullable<NonNullable<ObjectsListData["query"]>["kind"]>
type ObjectViewKind = ObjectsViewData["path"]["kind"]
type ObjectReadKind = ObjectsReadData["path"]["kind"]
type ObjectReadQueryInput = {
  directory: string
  kind: ObjectReadKind
  objectID: string
}
type ObjectViewQueryInput = {
  directory: string
  kind: ObjectViewKind
  objectID: string
  viewID: string
  revisionID?: string
  itemID?: string
}
type ObjectPayloadQueryInput = {
  directory: string
  objectID: string
}
type ObjectMediaAvailabilityQueryInput = ObjectPayloadQueryInput & {
  itemID: string
}

const WORKSPACE_OBJECTS_QUERY_SCOPE = "workspace-objects" as const
const MERMAID_OBJECTS_QUERY_KEY = "mermaid" satisfies WorkspaceObjectKind
const QUESTION_SET_OBJECTS_QUERY_KEY = "question-set" satisfies WorkspaceObjectKind
const FLASHCARD_OBJECTS_QUERY_KEY = "flashcard-deck" satisfies WorkspaceObjectKind
const HTML_WIDGET_OBJECTS_QUERY_KEY = "html-widget" satisfies WorkspaceObjectKind
const MEDIA_PRESENTATION_OBJECTS_QUERY_KEY = "media-presentation" satisfies WorkspaceObjectKind
const FIGURE_OBJECTS_QUERY_KEY = "figure" satisfies WorkspaceObjectKind
const FREEFORM_FIGURE_OBJECTS_QUERY_KEY = "freeform-figure" satisfies WorkspaceObjectKind
const OBJECT_VIEW_QUERY_KEY = "view" as const
const OBJECT_READ_QUERY_KEY = "read" as const
const MERMAID_OBJECT_PAYLOAD_QUERY_KEY = "mermaid-payload" as const
const QUESTION_SET_OBJECT_PAYLOAD_QUERY_KEY = "question-set-payload" as const
const FLASHCARD_DECK_OBJECT_PAYLOAD_QUERY_KEY = "flashcard-deck-payload" as const
const FLASHCARD_DECK_QUEUE_QUERY_KEY = "flashcard-deck-queue" as const
const MEDIA_PRESENTATION_AVAILABILITY_QUERY_KEY = "media-availability" as const
const WORKSPACE_OBJECTS_STALE_TIME_MS = 0

function workspaceObjectKindQueryKey(directory: string, kind: WorkspaceObjectKind) {
  return [WORKSPACE_OBJECTS_QUERY_SCOPE, directory, kind] as const
}

export const workspaceObjectsQueryKeys = {
  all: (directory: string) => [WORKSPACE_OBJECTS_QUERY_SCOPE, directory] as const,
  kind: workspaceObjectKindQueryKey,
  mermaid: (directory: string) => workspaceObjectKindQueryKey(directory, MERMAID_OBJECTS_QUERY_KEY),
  questionSet: (directory: string) =>
    workspaceObjectKindQueryKey(directory, QUESTION_SET_OBJECTS_QUERY_KEY),
  flashcard: (directory: string) =>
    workspaceObjectKindQueryKey(directory, FLASHCARD_OBJECTS_QUERY_KEY),
  htmlWidget: (directory: string) =>
    workspaceObjectKindQueryKey(directory, HTML_WIDGET_OBJECTS_QUERY_KEY),
  mediaPresentation: (directory: string) =>
    workspaceObjectKindQueryKey(directory, MEDIA_PRESENTATION_OBJECTS_QUERY_KEY),
  figure: (directory: string) => workspaceObjectKindQueryKey(directory, FIGURE_OBJECTS_QUERY_KEY),
  freeformFigure: (directory: string) =>
    workspaceObjectKindQueryKey(directory, FREEFORM_FIGURE_OBJECTS_QUERY_KEY),
  view: (input: ObjectViewQueryInput) =>
    [
      WORKSPACE_OBJECTS_QUERY_SCOPE,
      input.directory,
      OBJECT_VIEW_QUERY_KEY,
      input.kind,
      input.objectID,
      input.viewID,
      input.revisionID ?? null,
      input.itemID ?? null,
    ] as const,
  read: (input: ObjectReadQueryInput) =>
    [
      WORKSPACE_OBJECTS_QUERY_SCOPE,
      input.directory,
      OBJECT_READ_QUERY_KEY,
      input.kind,
      input.objectID,
    ] as const,
  mermaidPayload: (input: ObjectPayloadQueryInput) =>
    [
      WORKSPACE_OBJECTS_QUERY_SCOPE,
      input.directory,
      MERMAID_OBJECT_PAYLOAD_QUERY_KEY,
      input.objectID,
    ] as const,
  questionSetPayload: (input: ObjectPayloadQueryInput) =>
    [
      WORKSPACE_OBJECTS_QUERY_SCOPE,
      input.directory,
      QUESTION_SET_OBJECT_PAYLOAD_QUERY_KEY,
      input.objectID,
    ] as const,
  flashcardDeckPayload: (input: ObjectPayloadQueryInput) =>
    [
      WORKSPACE_OBJECTS_QUERY_SCOPE,
      input.directory,
      FLASHCARD_DECK_OBJECT_PAYLOAD_QUERY_KEY,
      input.objectID,
    ] as const,
  flashcardDeckQueue: (input: ObjectPayloadQueryInput) =>
    [
      WORKSPACE_OBJECTS_QUERY_SCOPE,
      input.directory,
      FLASHCARD_DECK_QUEUE_QUERY_KEY,
      input.objectID,
    ] as const,
  mediaAvailability: (input: ObjectMediaAvailabilityQueryInput) =>
    [
      WORKSPACE_OBJECTS_QUERY_SCOPE,
      input.directory,
      MEDIA_PRESENTATION_AVAILABILITY_QUERY_KEY,
      input.objectID,
      input.itemID,
    ] as const,
}

export function refetchActiveWorkspaceObjectQueries(queryClient: QueryClient, directory: string) {
  return queryClient.refetchQueries({
    queryKey: workspaceObjectsQueryKeys.all(directory),
    type: "active",
  })
}

export async function loadWorkspaceObjects(
  directory: string,
  kind?: WorkspaceObjectKind,
): Promise<ObjectsListResponse> {
  return requireBuddyData(
    await getBuddyClient(directory).objects.list(
      Object.assign({ directory }, kind ? { kind } : undefined),
    ),
  )
}

export function workspaceObjectsQueryOptions(directory: string, kind?: WorkspaceObjectKind) {
  return queryOptions({
    queryKey: kind
      ? workspaceObjectsQueryKeys.kind(directory, kind)
      : workspaceObjectsQueryKeys.all(directory),
    queryFn: () => loadWorkspaceObjects(directory, kind),
    staleTime: WORKSPACE_OBJECTS_STALE_TIME_MS,
  })
}

export function workspaceMermaidObjectsQueryOptions(directory: string) {
  return workspaceObjectsQueryOptions(directory, MERMAID_OBJECTS_QUERY_KEY)
}

export function workspaceQuestionSetObjectsQueryOptions(directory: string) {
  return workspaceObjectsQueryOptions(directory, QUESTION_SET_OBJECTS_QUERY_KEY)
}

export function workspaceFlashcardDeckObjectsQueryOptions(directory: string) {
  return workspaceObjectsQueryOptions(directory, FLASHCARD_OBJECTS_QUERY_KEY)
}

export function workspaceHtmlWidgetObjectsQueryOptions(directory: string) {
  return workspaceObjectsQueryOptions(directory, HTML_WIDGET_OBJECTS_QUERY_KEY)
}

export async function loadObjectView(input: ObjectViewQueryInput): Promise<ObjectsViewResponse> {
  return requireBuddyData(
    await getBuddyClient(input.directory).objects.view(
      Object.assign(
        {
          directory: input.directory,
          kind: input.kind,
          objectID: input.objectID,
          viewID: input.viewID,
        },
        input.revisionID ? { revisionID: input.revisionID } : undefined,
        input.itemID ? { itemID: input.itemID } : undefined,
      ),
    ),
  )
}

export function objectViewQueryOptions(input: ObjectViewQueryInput) {
  return queryOptions({
    queryKey: workspaceObjectsQueryKeys.view(input),
    queryFn: () => loadObjectView(input),
    staleTime: WORKSPACE_OBJECTS_STALE_TIME_MS,
  })
}

export async function loadObjectRead(input: ObjectReadQueryInput): Promise<ObjectsReadResponse> {
  return requireBuddyData(
    await getBuddyClient(input.directory).objects.read({
      directory: input.directory,
      kind: input.kind,
      objectID: input.objectID,
    }),
  )
}

export function objectReadQueryOptions(input: ObjectReadQueryInput) {
  return queryOptions({
    queryKey: workspaceObjectsQueryKeys.read(input),
    queryFn: () => loadObjectRead(input),
    staleTime: WORKSPACE_OBJECTS_STALE_TIME_MS,
  })
}

export async function loadObjectMermaidPayload(
  input: ObjectPayloadQueryInput,
): Promise<ObjectMermaidReadSourceResponse> {
  return requireBuddyData(
    await getBuddyClient(input.directory).objectMermaid.readSource({
      directory: input.directory,
      objectID: input.objectID,
    }),
  )
}

export function objectMermaidPayloadQueryOptions(input: ObjectPayloadQueryInput) {
  return queryOptions({
    queryKey: workspaceObjectsQueryKeys.mermaidPayload(input),
    queryFn: () => loadObjectMermaidPayload(input),
    staleTime: WORKSPACE_OBJECTS_STALE_TIME_MS,
  })
}

export async function loadObjectQuestionSetPayload(
  input: ObjectPayloadQueryInput,
): Promise<ObjectQuestionSetReadQuestionsResponse> {
  return requireBuddyData(
    await getBuddyClient(input.directory).objectQuestionSet.readQuestions({
      directory: input.directory,
      objectID: input.objectID,
    }),
  )
}

export function objectQuestionSetPayloadQueryOptions(input: ObjectPayloadQueryInput) {
  return queryOptions({
    queryKey: workspaceObjectsQueryKeys.questionSetPayload(input),
    queryFn: () => loadObjectQuestionSetPayload(input),
    staleTime: WORKSPACE_OBJECTS_STALE_TIME_MS,
  })
}

export async function loadObjectFlashcardDeckPayload(
  input: ObjectPayloadQueryInput,
): Promise<ObjectFlashcardDeckReadDeckResponse> {
  return requireBuddyData(
    await getBuddyClient(input.directory).objectFlashcardDeck.readDeck({
      directory: input.directory,
      objectID: input.objectID,
    }),
  )
}

export function objectFlashcardDeckPayloadQueryOptions(input: ObjectPayloadQueryInput) {
  return queryOptions({
    queryKey: workspaceObjectsQueryKeys.flashcardDeckPayload(input),
    queryFn: () => loadObjectFlashcardDeckPayload(input),
    staleTime: WORKSPACE_OBJECTS_STALE_TIME_MS,
  })
}

export async function loadObjectFlashcardDeckQueue(
  input: ObjectPayloadQueryInput,
): Promise<ObjectFlashcardDeckQueuedCardsResponse> {
  return requireBuddyData(
    await getBuddyClient(input.directory).objectFlashcardDeck.queuedCards({
      directory: input.directory,
      objectID: input.objectID,
    }),
  )
}

export function objectFlashcardDeckQueueQueryOptions(input: ObjectPayloadQueryInput) {
  return queryOptions({
    queryKey: workspaceObjectsQueryKeys.flashcardDeckQueue(input),
    queryFn: () => loadObjectFlashcardDeckQueue(input),
    staleTime: WORKSPACE_OBJECTS_STALE_TIME_MS,
    refetchInterval: (query) => {
      const nextQueueAt = query.state.data?.completion.nextQueueAt
      return nextQueueAt === null || nextQueueAt === undefined
        ? false
        : Math.max(FLASHCARD_QUEUE_REFETCH_FLOOR_MS, nextQueueAt - Date.now())
    },
  })
}

export async function loadObjectMediaAvailability(
  input: ObjectMediaAvailabilityQueryInput,
): Promise<ObjectMediaPresentationAvailabilityResponse> {
  return requireBuddyData(
    await getBuddyClient(input.directory).objectMediaPresentation.availability({
      directory: input.directory,
      objectID: input.objectID,
      itemID: input.itemID,
    }),
  )
}

function objectMediaAvailabilityError(error: unknown): ObjectMediaPresentationAvailabilityResponse {
  return {
    status: "error",
    message: error instanceof Error ? error.message : String(error),
  }
}

export function objectMediaAvailabilityQueryOptions(input: ObjectMediaAvailabilityQueryInput) {
  return queryOptions({
    queryKey: workspaceObjectsQueryKeys.mediaAvailability(input),
    queryFn: () => loadObjectMediaAvailability(input).catch(objectMediaAvailabilityError),
    staleTime: WORKSPACE_OBJECTS_STALE_TIME_MS,
  })
}

export type { ObjectViewKind, WorkspaceObjectKind }
