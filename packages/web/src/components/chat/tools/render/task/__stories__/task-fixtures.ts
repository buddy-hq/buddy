import type { ObjectsListResponse } from "@buddy/sdk/types"

type ObjectIndexItem = ObjectsListResponse["objects"][number]
type ObjectIndexItemOfKind<TKind extends ObjectIndexItem["kind"]> = ObjectIndexItem & {
  kind: TKind
}
type FlashcardDeckObject = ObjectIndexItemOfKind<"flashcard-deck">
type QuestionSetObject = ObjectIndexItemOfKind<"question-set">

export const STORY_DIRECTORY = "/home/user/project"
export const STORY_SESSION_ID = "01JTESTSESSION0000000000000001"
export const STORY_CALL_ID = "01JTESTCALL00000000000000000001"

function createObjectBase<TKind extends ObjectIndexItem["kind"]>(input: {
  objectID: string
  kind: TKind
  title: string
  updatedAt: string
  primaryViewID: string
}): ObjectIndexItemOfKind<TKind> {
  return {
    objectID: input.objectID,
    kind: input.kind,
    title: input.title,
    status: "ready",
    lifecycle: "revisioned",
    sourceRoot: null,
    primaryViewID: input.primaryViewID,
    surfaces: ["bench", "library"],
    hasLibraryView: true,
    updatedAt: input.updatedAt,
  }
}

export const FLASHCARD_DECK_NO_DUE: FlashcardDeckObject = {
  ...createObjectBase({
    objectID: "01JDECK00000000000000000001",
    kind: "flashcard-deck",
    title: "Photosynthesis Basics",
    updatedAt: "2025-04-20T10:00:00Z",
    primaryViewID: "review",
  }),
}

export const FLASHCARD_DECK_WITH_DUE: FlashcardDeckObject = {
  ...createObjectBase({
    objectID: "01JDECK00000000000000000002",
    kind: "flashcard-deck",
    title: "Cell Division & Mitosis",
    updatedAt: "2025-04-21T14:30:00Z",
    primaryViewID: "review",
  }),
}

export const FLASHCARD_DECK_SINGLE_CARD: FlashcardDeckObject = {
  ...createObjectBase({
    objectID: "01JDECK00000000000000000003",
    kind: "flashcard-deck",
    title: "Quick Review: DNA",
    updatedAt: "2025-04-22T09:00:00Z",
    primaryViewID: "review",
  }),
}

export const FLASHCARD_DECKS_ALL: ObjectsListResponse = {
  objects: [FLASHCARD_DECK_WITH_DUE, FLASHCARD_DECK_NO_DUE, FLASHCARD_DECK_SINGLE_CARD],
  loadErrors: [],
}

export const QUESTION_SET_QUIZ: QuestionSetObject = {
  ...createObjectBase({
    objectID: "01JQS000000000000000000001",
    kind: "question-set",
    title: "Fractions & Decimals Quiz",
    updatedAt: "2025-04-20T11:00:00Z",
    primaryViewID: "practice",
  }),
}

export const QUESTION_SET_PRACTICE: QuestionSetObject = {
  ...createObjectBase({
    objectID: "01JQS000000000000000000002",
    kind: "question-set",
    title: "Multiplication Practice",
    updatedAt: "2025-04-21T16:00:00Z",
    primaryViewID: "practice",
  }),
}

export const QUESTION_SET_ASSESSMENT: QuestionSetObject = {
  ...createObjectBase({
    objectID: "01JQS000000000000000000003",
    kind: "question-set",
    title: "Algebra Readiness Assessment",
    updatedAt: "2025-04-22T08:00:00Z",
    primaryViewID: "practice",
  }),
}

export const QUESTION_SETS_ALL: ObjectsListResponse = {
  objects: [QUESTION_SET_QUIZ, QUESTION_SET_PRACTICE, QUESTION_SET_ASSESSMENT],
  loadErrors: [],
}
