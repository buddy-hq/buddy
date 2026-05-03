import QUESTION_SET_AUTHOR_PROMPT from "./question-set-author.md"
import { defineBuddySubagent } from "../../../runtime/define-buddy-subagent"
import { saveQuestionSetTool } from "../tools/save-question-set"

export const QUESTION_SET_AUTHOR_AGENT = defineBuddySubagent({
  key: "question-set-author",
  description: "Generates structured MCQ question sets and persists them as artifacts.",
  prompt: QUESTION_SET_AUTHOR_PROMPT,
  tools: [saveQuestionSetTool],
  skills: [],
  subagents: [],
  permission: {
    question: "allow",
    task: "deny",
    todoread: "deny",
    todowrite: "deny",
  },
})
