import FLASHCARD_AUTHOR_PROMPT from "./prompt.p.md"
import { defineBuddySubagent } from "../define-buddy-subagent"

export const FLASHCARD_AUTHOR_AGENT = defineBuddySubagent({
  key: "flashcard-author",
  description:
    "Agent specialized in building flashcards. Generates structured flashcard decks (basic and cloze), persists them, and when the delegated task names resources it should ingest their prepared full text before authoring cards.",
  prompt: FLASHCARD_AUTHOR_PROMPT,
  permission: {
    question: "allow",
    learner_snapshot_read: "allow",
    pedagogy_prepare_resource: "deny",
    pedagogy_resource_ingest_full_text: "allow",
    save_flashcard_deck: "allow",
    learner_practice_record: "deny",
    learner_assessment_record: "deny",
    task: "deny",
    todoread: "deny",
    todowrite: "deny",
  },
})
