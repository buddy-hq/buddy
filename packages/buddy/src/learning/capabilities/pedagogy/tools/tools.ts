import { pedagogyDebugAttemptTool } from "./definitions/debug-attempt"
import { pedagogyGuidedPracticeTool } from "./definitions/guided-practice"
import { pedagogyIndependentPracticeTool } from "./definitions/independent-practice"
import { pedagogyMasteryCheckTool } from "./definitions/mastery-check"
import { pedagogyReflectionTool } from "./definitions/reflection"
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
  pedagogyRetrievalCheckTool,
  pedagogyTransferCheckTool,
] as const

export { pedagogyTools }
