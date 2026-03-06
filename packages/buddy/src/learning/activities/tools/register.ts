import { createToolRegistrar } from "../../shared/create-tool-registrar.js"
import {
  activityAnalogyTool,
  activityConceptContrastTool,
  activityDebugAttemptTool,
  activityExplanationTool,
  activityGuidedPracticeTool,
  activityIndependentPracticeTool,
  activityMasteryCheckTool,
  activityReflectionTool,
  activityRetrievalCheckTool,
  activityStepwiseSolveTool,
  activityTransferCheckTool,
  activityWorkedExampleTool,
} from "./index.js"

export const ensureActivityToolsRegistered = createToolRegistrar([
  activityExplanationTool,
  activityWorkedExampleTool,
  activityConceptContrastTool,
  activityAnalogyTool,
  activityGuidedPracticeTool,
  activityIndependentPracticeTool,
  activityDebugAttemptTool,
  activityStepwiseSolveTool,
  activityMasteryCheckTool,
  activityReflectionTool,
  activityRetrievalCheckTool,
  activityTransferCheckTool,
])
