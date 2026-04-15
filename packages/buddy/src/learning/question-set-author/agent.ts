import QUESTION_SET_AUTHOR_PROMPT from "./prompt.p.md"
import { defineBuddySubagent } from "../define-buddy-subagent"

export const QUESTION_SET_AUTHOR_AGENT = defineBuddySubagent({
  key: "question-set-author",
  description: "Generates structured MCQ question sets and persists them as artifacts.",
  prompt: QUESTION_SET_AUTHOR_PROMPT,
  permission: {
    question: "allow",
    learner_snapshot_read: "allow",
    save_question_set: "allow",
    render_saved_question_set: "deny",
    learner_practice_record: "deny",
    learner_assessment_record: "deny",
    task: "deny",
    todoread: "deny",
    todowrite: "deny",
  },
})
