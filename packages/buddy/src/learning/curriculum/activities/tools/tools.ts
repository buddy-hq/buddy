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
} from "./catalog"

const activityTools = [
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
] as const

export { activityTools }
