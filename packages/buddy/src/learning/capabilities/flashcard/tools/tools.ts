import { saveFlashcardDeckTool } from "./save-flashcard-deck"
import {
  defineLearningToolGroup,
  staticLearningTools,
} from "../../../tools/learning-tool-group-definition"

const flashcardLearningToolGroup = defineLearningToolGroup({
  group: "flashcard",
  tools: [saveFlashcardDeckTool],
})

const flashcardTools = staticLearningTools(flashcardLearningToolGroup)

export { flashcardLearningToolGroup, flashcardTools }
