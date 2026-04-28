import { renderMermaidTool } from "./render-mermaid"
import {
  defineLearningToolGroup,
  staticLearningTools,
} from "../../../../tools/learning-tool-group-definition"

const mermaidLearningToolGroup = defineLearningToolGroup({
  group: "mermaid",
  tools: [renderMermaidTool],
})

const mermaidTools = staticLearningTools(mermaidLearningToolGroup)

export { mermaidLearningToolGroup, mermaidTools }
