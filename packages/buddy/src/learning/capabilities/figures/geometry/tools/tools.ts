import { renderFigureTool } from "./render-figure"
import {
  defineLearningToolGroup,
  staticLearningTools,
} from "../../../../tools/learning-tool-group-definition"

const figureLearningToolGroup = defineLearningToolGroup({
  group: "figures",
  tools: [renderFigureTool],
})

const figureTools = staticLearningTools(figureLearningToolGroup)

export { figureLearningToolGroup, figureTools }
