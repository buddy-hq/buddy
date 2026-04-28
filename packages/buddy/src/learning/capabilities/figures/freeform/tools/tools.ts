import { renderFreeformFigureTool } from "./render-freeform-figure"
import {
  defineLearningToolGroup,
  staticLearningTools,
} from "../../../../tools/learning-tool-group-definition"

const freeformFigureLearningToolGroup = defineLearningToolGroup({
  group: "freeformFigures",
  tools: [renderFreeformFigureTool],
})

const freeformFigureTools = staticLearningTools(freeformFigureLearningToolGroup)

export { freeformFigureLearningToolGroup, freeformFigureTools }
