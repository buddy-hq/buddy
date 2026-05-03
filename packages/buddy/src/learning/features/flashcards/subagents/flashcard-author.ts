import FLASHCARD_AUTHOR_PROMPT from "./flashcard-author.md"
import { defineBuddySubagent } from "../../../runtime/define-buddy-subagent"
import { ingestFullTextTool } from "../../reading/tools/ingest-full-text"
import { saveFlashcardDeckTool } from "../tools/save-flashcard-deck"

export const FLASHCARD_AUTHOR_AGENT = defineBuddySubagent({
  key: "flashcard-author",
  description:
    "Agent specialized in building flashcards. Generates structured flashcard decks (basic and cloze), persists them, and when the delegated task names resources it should ingest their prepared full text before authoring cards.",
  prompt: FLASHCARD_AUTHOR_PROMPT,
  tools: [ingestFullTextTool, saveFlashcardDeckTool],
  skills: [],
  subagents: [],
  permission: {
    question: "allow",
    task: "deny",
    todoread: "deny",
    todowrite: "deny",
  },
})
