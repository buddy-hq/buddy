import { defineBuddyFeature } from "../../runtime/define-buddy-feature"
import { QUESTION_SET_AUTHOR_AGENT } from "./subagents/question-set-author"

export const questionSetsFeature = defineBuddyFeature({
  id: "question-sets",
  tools: [],
  skills: [],
  subagents: [QUESTION_SET_AUTHOR_AGENT],
  surfaces: ["question-set"],
})
