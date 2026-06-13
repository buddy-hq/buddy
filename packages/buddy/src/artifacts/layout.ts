const ARTIFACT_CONTENT_FILES = {
  mermaidSource: "source.mmd",
  questionSet: "question-set.json",
  flashcardDeck: "deck.json",
  flashcardPendingReview: "pending-review.json",
  htmlWidget: "index.html",
  figureSvg: "figure.svg",
} as const

const ARTIFACT_CONTENT_DIRECTORIES = {
  mermaidRenders: "renders",
  questionSetAttempts: "attempts",
  flashcardReviews: "reviews",
} as const

const ARTIFACT_RUNTIME_DIRECTORIES = {
  mermaidRepairRequests: "mermaid-repair-requests",
} as const

export { ARTIFACT_CONTENT_DIRECTORIES, ARTIFACT_CONTENT_FILES, ARTIFACT_RUNTIME_DIRECTORIES }
