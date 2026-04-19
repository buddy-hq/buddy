import { pedagogyDebugAttemptTool } from "./definitions/debug-attempt"
import { pedagogyGuidedPracticeTool } from "./definitions/guided-practice"
import { pedagogyIndependentPracticeTool } from "./definitions/independent-practice"
import { pedagogyMasteryCheckTool } from "./definitions/mastery-check"
import { pedagogyPrepareResourceTool } from "./definitions/prepare-resource"
import { pedagogyReflectionTool } from "./definitions/reflection"
import { pedagogyResourceIngestFullTextTool } from "./definitions/resource-ingest-full-text"
import { pedagogyRetrievalCheckTool } from "./definitions/retrieval-check"
import { pedagogyStepwiseSolveTool } from "./definitions/stepwise-solve"
import { pedagogyTransferCheckTool } from "./definitions/transfer-check"

const pedagogyTools = [
  pedagogyGuidedPracticeTool,
  pedagogyIndependentPracticeTool,
  pedagogyDebugAttemptTool,
  pedagogyStepwiseSolveTool,
  pedagogyMasteryCheckTool,
  pedagogyReflectionTool,
  pedagogyPrepareResourceTool,
  pedagogyRetrievalCheckTool,
  pedagogyResourceIngestFullTextTool,
  pedagogyTransferCheckTool,
] as const

export { pedagogyTools }
