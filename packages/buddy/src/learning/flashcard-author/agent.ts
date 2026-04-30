import FLASHCARD_AUTHOR_PROMPT from "./prompt.p.md"
import { defineBuddySubagent } from "../define-buddy-subagent"

export const FLASHCARD_AUTHOR_AGENT = defineBuddySubagent({
  key: "flashcard-author",
  description:
    "Agent specialized in building flashcards. Generates structured flashcard decks (basic and cloze), persists them, and when the delegated task names resources it should ingest their prepared full text before authoring cards.",
  prompt: FLASHCARD_AUTHOR_PROMPT,
  permission: {
    question: "allow",
    learner_memory_search: "allow",
    learner_memory_update: "allow",
    pedagogy_prepare_resource: "deny",
    pedagogy_resource_ingest_full_text: "allow",
    save_flashcard_deck: "allow",
    task: "deny",
    todoread: "deny",
    todowrite: "deny",
  },
})
