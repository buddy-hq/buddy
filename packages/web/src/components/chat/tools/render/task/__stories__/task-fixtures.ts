import type { ArtifactsListResponse } from "@buddy/sdk"

type ArtifactIndexItem = ArtifactsListResponse["artifacts"][number]
type FlashcardDeckArtifact = Extract<ArtifactIndexItem, { kind: "flashcard-deck" }>
type QuestionSetArtifact = Extract<ArtifactIndexItem, { kind: "question-set" }>

export const STORY_DIRECTORY = "/home/user/project"
export const STORY_SESSION_ID = "01JTESTSESSION0000000000000001"
export const STORY_CALL_ID = "01JTESTCALL00000000000000000001"

export const FLASHCARD_DECK_NO_DUE: FlashcardDeckArtifact = {
  artifactID: "01JDECK00000000000000000001",
  kind: "flashcard-deck",
  title: "Photosynthesis Basics",
  createdAt: "2025-04-20T10:00:00Z",
  updatedAt: "2025-04-20T10:00:00Z",
  origin: {
    kind: "tool",
    sessionID: STORY_SESSION_ID,
    messageID: "01JMSG00000000000000000001",
    callID: STORY_CALL_ID,
    subagent: "flashcard-author",
  },
  summary: {
    noteCount: 5,
    cardCount: 8,
    dueCounts: { new: 0, learning: 0, review: 0 },
    reviewAvailable: false,
  },
}

export const FLASHCARD_DECK_WITH_DUE: FlashcardDeckArtifact = {
  artifactID: "01JDECK00000000000000000002",
  kind: "flashcard-deck",
  title: "Cell Division & Mitosis",
  createdAt: "2025-04-21T14:30:00Z",
  updatedAt: "2025-04-21T14:30:00Z",
  origin: {
    kind: "tool",
    sessionID: STORY_SESSION_ID,
    messageID: "01JMSG00000000000000000002",
    callID: STORY_CALL_ID,
    subagent: "flashcard-author",
  },
  summary: {
    noteCount: 10,
    cardCount: 15,
    dueCounts: { new: 3, learning: 2, review: 1 },
    reviewAvailable: true,
  },
}

export const FLASHCARD_DECK_SINGLE_CARD: FlashcardDeckArtifact = {
  artifactID: "01JDECK00000000000000000003",
  kind: "flashcard-deck",
  title: "Quick Review: DNA",
  createdAt: "2025-04-22T09:00:00Z",
  updatedAt: "2025-04-22T09:00:00Z",
  origin: {
    kind: "tool",
    sessionID: STORY_SESSION_ID,
    messageID: "01JMSG00000000000000000003",
    callID: STORY_CALL_ID,
    subagent: "flashcard-author",
  },
  summary: {
    noteCount: 1,
    cardCount: 1,
    dueCounts: { new: 1, learning: 0, review: 0 },
    reviewAvailable: true,
  },
}

export const FLASHCARD_DECKS_ALL: ArtifactsListResponse = {
  artifacts: [FLASHCARD_DECK_WITH_DUE, FLASHCARD_DECK_NO_DUE, FLASHCARD_DECK_SINGLE_CARD],
  loadErrors: [],
}

export const QUESTION_SET_QUIZ: QuestionSetArtifact = {
  artifactID: "01JQS000000000000000000001",
  kind: "question-set",
  title: "Fractions & Decimals Quiz",
  createdAt: "2025-04-20T11:00:00Z",
  updatedAt: "2025-04-20T11:00:00Z",
  origin: {
    kind: "tool",
    sessionID: STORY_SESSION_ID,
    messageID: "01JMSG00000000000000000004",
    callID: STORY_CALL_ID,
    subagent: "question-set-author",
  },
  summary: {
    groupType: "quiz",
    questionCount: 2,
  },
}

export const QUESTION_SET_PRACTICE: QuestionSetArtifact = {
  artifactID: "01JQS000000000000000000002",
  kind: "question-set",
  title: "Multiplication Practice",
  createdAt: "2025-04-21T16:00:00Z",
  updatedAt: "2025-04-21T16:00:00Z",
  origin: {
    kind: "tool",
    sessionID: STORY_SESSION_ID,
    messageID: "01JMSG00000000000000000005",
    callID: STORY_CALL_ID,
    subagent: "question-set-author",
  },
  summary: {
    groupType: "practice",
    questionCount: 1,
  },
}

export const QUESTION_SET_ASSESSMENT: QuestionSetArtifact = {
  artifactID: "01JQS000000000000000000003",
  kind: "question-set",
  title: "Algebra Readiness Assessment",
  createdAt: "2025-04-22T08:00:00Z",
  updatedAt: "2025-04-22T08:00:00Z",
  origin: {
    kind: "tool",
    sessionID: STORY_SESSION_ID,
    messageID: "01JMSG00000000000000000006",
    callID: STORY_CALL_ID,
    subagent: "question-set-author",
  },
  summary: {
    groupType: "assessment",
    questionCount: 8,
  },
}

export const QUESTION_SETS_ALL: ArtifactsListResponse = {
  artifacts: [QUESTION_SET_QUIZ, QUESTION_SET_PRACTICE, QUESTION_SET_ASSESSMENT],
  loadErrors: [],
}
