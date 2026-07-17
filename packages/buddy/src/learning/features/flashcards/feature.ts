import { defineBuddyFeature } from "../../runtime/define-buddy-feature"
import "./storage/read-deck"
import { FLASHCARD_AUTHOR_AGENT } from "./subagents/flashcard-author"

export const flashcardsFeature = defineBuddyFeature({
  id: "flashcards",
  tools: [],
  skills: [],
  subagents: [FLASHCARD_AUTHOR_AGENT],
  surfaces: ["flashcard"],
})
