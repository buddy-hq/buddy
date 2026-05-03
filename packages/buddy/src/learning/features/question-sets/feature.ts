import { defineBuddyFeature } from "../../runtime/define-buddy-feature"
import { QUESTION_SET_AUTHOR_AGENT } from "./subagents/question-set-author"
import { saveQuestionSetTool } from "./tools/save-question-set"

export const questionSetsFeature = defineBuddyFeature({
  id: "question-sets",
  tools: [saveQuestionSetTool],
  skills: [],
  subagents: [QUESTION_SET_AUTHOR_AGENT],
  surfaces: ["question-set"],
})
