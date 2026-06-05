import type { FlashcardDecksListResponse } from "@buddy/sdk"
import type { QuestionSetArtifactsListResponse } from "@buddy/sdk"

export const STORY_DIRECTORY = "/home/user/project"
export const STORY_SESSION_ID = "01JTESTSESSION0000000000000001"
export const STORY_CALL_ID = "01JTESTCALL00000000000000000001"

export const FLASHCARD_DECK_NO_DUE: FlashcardDecksListResponse["decks"][number] = {
  deckID: "01JDECK00000000000000000001",
  kind: "flashcard-deck.v1",
  title: "Photosynthesis Basics",
  noteCount: 5,
  cardCount: 8,
  dueCounts: { new: 0, learning: 0, review: 0 },
  reviewAvailable: false,
  createdAt: "2025-04-20T10:00:00Z",
  createdBy: {
    sessionID: STORY_SESSION_ID,
    messageID: "01JMSG00000000000000000001",
    callID: STORY_CALL_ID,
    subagent: "flashcard-author",
  },
}

export const FLASHCARD_DECK_WITH_DUE: FlashcardDecksListResponse["decks"][number] = {
  deckID: "01JDECK00000000000000000002",
  kind: "flashcard-deck.v1",
  title: "Cell Division & Mitosis",
  noteCount: 10,
  cardCount: 15,
  dueCounts: { new: 3, learning: 2, review: 1 },
  reviewAvailable: true,
  createdAt: "2025-04-21T14:30:00Z",
  createdBy: {
    sessionID: STORY_SESSION_ID,
    messageID: "01JMSG00000000000000000002",
    callID: STORY_CALL_ID,
    subagent: "flashcard-author",
  },
}

export const FLASHCARD_DECK_SINGLE_CARD: FlashcardDecksListResponse["decks"][number] = {
  deckID: "01JDECK00000000000000000003",
  kind: "flashcard-deck.v1",
  title: "Quick Review: DNA",
  noteCount: 1,
  cardCount: 1,
  dueCounts: { new: 1, learning: 0, review: 0 },
  reviewAvailable: true,
  createdAt: "2025-04-22T09:00:00Z",
  createdBy: {
    sessionID: STORY_SESSION_ID,
    messageID: "01JMSG00000000000000000003",
    callID: STORY_CALL_ID,
    subagent: "flashcard-author",
  },
}

export const FLASHCARD_DECKS_ALL: FlashcardDecksListResponse = {
  decks: [FLASHCARD_DECK_WITH_DUE, FLASHCARD_DECK_NO_DUE, FLASHCARD_DECK_SINGLE_CARD],
  loadErrors: [],
}

export const QUESTION_SET_QUIZ: QuestionSetArtifactsListResponse["artifacts"][number] = {
  artifactID: "01JQS000000000000000000001",
  kind: "question-set.v1",
  groupType: "quiz",
  title: "Fractions & Decimals Quiz",
  questions: [
    {
      id: "q1",
      type: "mcq",
      prompt: "What is 1/2 + 1/4?",
      goalIds: ["goal-1"],
      explanation: "1/2 + 1/4 = 2/4 + 1/4 = 3/4",
      payload: {
        multipleSelect: false,
        choices: [
          { id: "a", content: "2/6" },
          { id: "b", content: "3/4" },
          { id: "c", content: "1/3" },
          { id: "d", content: "1/2" },
        ],
      },
    },
    {
      id: "q2",
      type: "mcq",
      prompt: "Convert 0.75 to a fraction.",
      goalIds: ["goal-1", "goal-2"],
      payload: {
        multipleSelect: false,
        choices: [
          { id: "a", content: "3/4" },
          { id: "b", content: "7/10" },
          { id: "c", content: "1/4" },
        ],
      },
    },
  ],
  createdAt: "2025-04-20T11:00:00Z",
  createdBy: {
    sessionID: STORY_SESSION_ID,
    messageID: "01JMSG00000000000000000004",
    callID: STORY_CALL_ID,
    subagent: "question-set-author",
  },
}

export const QUESTION_SET_PRACTICE: QuestionSetArtifactsListResponse["artifacts"][number] = {
  artifactID: "01JQS000000000000000000002",
  kind: "question-set.v1",
  groupType: "practice",
  title: "Multiplication Practice",
  questions: [
    {
      id: "q1",
      type: "mcq",
      prompt: "What is 7 x 8?",
      goalIds: ["goal-3"],
      payload: {
        multipleSelect: false,
        choices: [
          { id: "a", content: "54" },
          { id: "b", content: "56" },
          { id: "c", content: "48" },
        ],
      },
    },
  ],
  createdAt: "2025-04-21T16:00:00Z",
  createdBy: {
    sessionID: STORY_SESSION_ID,
    messageID: "01JMSG00000000000000000005",
    callID: STORY_CALL_ID,
    subagent: "question-set-author",
  },
}

export const QUESTION_SET_ASSESSMENT: QuestionSetArtifactsListResponse["artifacts"][number] = {
  artifactID: "01JQS000000000000000000003",
  kind: "question-set.v1",
  groupType: "assessment",
  title: "Algebra Readiness Assessment",
  questions: Array.from({ length: 8 }, (_, i) => ({
    id: `q${i + 1}`,
    type: "mcq" as const,
    prompt: `Assessment question ${i + 1}`,
    goalIds: ["goal-4"],
    payload: {
      multipleSelect: false,
      choices: [
        { id: `a${i}`, content: `Option A` },
        { id: `b${i}`, content: `Option B` },
        { id: `c${i}`, content: `Option C` },
      ],
    },
  })),
  createdAt: "2025-04-22T08:00:00Z",
  createdBy: {
    sessionID: STORY_SESSION_ID,
    messageID: "01JMSG00000000000000000006",
    callID: STORY_CALL_ID,
    subagent: "question-set-author",
  },
}

export const QUESTION_SETS_ALL: QuestionSetArtifactsListResponse = {
  artifacts: [QUESTION_SET_QUIZ, QUESTION_SET_PRACTICE, QUESTION_SET_ASSESSMENT],
  loadErrors: [],
}
