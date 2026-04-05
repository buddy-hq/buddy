import { renderSavedQuestionSetTool } from "./render-saved-question-set"
import { saveQuestionSetTool } from "./save-question-set"

const questionSetTools = [saveQuestionSetTool, renderSavedQuestionSetTool] as const

export { questionSetTools }
