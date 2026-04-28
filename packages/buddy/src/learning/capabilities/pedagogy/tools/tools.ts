import {
  dynamicPedagogyDebugAttemptTool,
  pedagogyDebugAttemptTool,
} from "./definitions/debug-attempt"
import { pedagogyPrepareResourceTool } from "./definitions/prepare-resource"
import { dynamicPedagogyReflectionTool, pedagogyReflectionTool } from "./definitions/reflection"
import { pedagogyResourceIngestFullTextTool } from "./definitions/resource-ingest-full-text"
import {
  dynamicPedagogyStepwiseSolveTool,
  pedagogyStepwiseSolveTool,
} from "./definitions/stepwise-solve"
import {
  defineLearningToolGroup,
  staticLearningTools,
} from "../../../tools/learning-tool-group-definition"

const pedagogyLearningToolGroup = defineLearningToolGroup({
  group: "pedagogy",
  tools: [
    pedagogyDebugAttemptTool,
    pedagogyStepwiseSolveTool,
    pedagogyReflectionTool,
    pedagogyPrepareResourceTool,
    pedagogyResourceIngestFullTextTool,
    dynamicPedagogyDebugAttemptTool,
    dynamicPedagogyReflectionTool,
    dynamicPedagogyStepwiseSolveTool,
  ],
})

const pedagogyTools = staticLearningTools(pedagogyLearningToolGroup)

export { pedagogyLearningToolGroup, pedagogyTools }
