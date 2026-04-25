import { pedagogyDebugAttemptTool } from "./definitions/debug-attempt"
import { pedagogyPrepareResourceTool } from "./definitions/prepare-resource"
import { pedagogyReflectionTool } from "./definitions/reflection"
import { pedagogyResourceIngestFullTextTool } from "./definitions/resource-ingest-full-text"
import { pedagogyStepwiseSolveTool } from "./definitions/stepwise-solve"

const pedagogyTools = [
  pedagogyDebugAttemptTool,
  pedagogyStepwiseSolveTool,
  pedagogyReflectionTool,
  pedagogyPrepareResourceTool,
  pedagogyResourceIngestFullTextTool,
] as const

export { pedagogyTools }
