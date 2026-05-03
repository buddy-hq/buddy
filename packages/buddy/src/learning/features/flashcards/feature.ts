import { defineBuddyFeature } from "../../runtime/define-buddy-feature"
import { FLASHCARD_AUTHOR_AGENT } from "./subagents/flashcard-author"

export const flashcardsFeature = defineBuddyFeature({
  id: "flashcards",
  tools: [],
  skills: [],
  subagents: [FLASHCARD_AUTHOR_AGENT],
  surfaces: ["flashcard"],
})
