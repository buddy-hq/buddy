import QUESTION_SET_AUTHOR_PROMPT from "./prompt.p.md"
import { defineBuddySubagent } from "../define-buddy-subagent"

export const QUESTION_SET_AUTHOR_AGENT = defineBuddySubagent({
  key: "question-set-author",
  description: "Generates structured MCQ question sets and persists them as artifacts.",
  prompt: QUESTION_SET_AUTHOR_PROMPT,
  permission: {
    question: "allow",
    learner_memory_search: "allow",
    learner_memory_update: "allow",
    save_question_set: "allow",
    task: "deny",
    todoread: "deny",
    todowrite: "deny",
  },
})
