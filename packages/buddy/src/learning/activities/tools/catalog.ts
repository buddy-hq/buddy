import {
  analogyOutput,
  conceptContrastOutput,
  debugAttemptOutput,
  explanationOutput,
  guidedPracticeOutput,
  independentPracticeOutput,
  masteryCheckOutput,
  reflectionOutput,
  retrievalCheckOutput,
  stepwiseSolveOutput,
  transferCheckOutput,
  workedExampleOutput,
} from "./catalog/builders.js"
import { createActivityTool } from "./catalog/factory.js"

const activityExplanationTool = createActivityTool({
  id: "activity_explanation",
  intent: "learn",
  description: "Build a concise explanation plan grounded in the current learner state and active goals.",
  buildOutput: explanationOutput,
})

const activityWorkedExampleTool = createActivityTool({
  id: "activity_worked_example",
  intent: "learn",
  description: "Build a worked-example teaching plan for the current learning goal.",
  buildOutput: workedExampleOutput,
})

const activityConceptContrastTool = createActivityTool({
  id: "activity_concept_contrast",
  intent: "learn",
  description: "Build a concept-contrast teaching plan for two nearby ideas.",
  buildOutput: conceptContrastOutput,
})

const activityAnalogyTool = createActivityTool({
  id: "activity_analogy",
  intent: "learn",
  description: "Build a bounded-analogy teaching plan for the current learning goal.",
  buildOutput: analogyOutput,
})

const activityGuidedPracticeTool = createActivityTool({
  id: "activity_guided_practice",
  intent: "practice",
  description: "Generate a guided-practice plan for the active learning goal.",
  buildOutput: guidedPracticeOutput,
})

const activityIndependentPracticeTool = createActivityTool({
  id: "activity_independent_practice",
  intent: "practice",
  description: "Generate an independent-practice task for the active learning goal.",
  buildOutput: independentPracticeOutput,
})

const activityDebugAttemptTool = createActivityTool({
  id: "activity_debug_attempt",
  intent: "practice",
  description: "Generate a structured debug-attempt plan for code practice.",
  buildOutput: debugAttemptOutput,
})

const activityStepwiseSolveTool = createActivityTool({
  id: "activity_stepwise_solve",
  intent: "practice",
  description: "Generate a stepwise mathematical solve plan for the active goal.",
  buildOutput: stepwiseSolveOutput,
})

const activityMasteryCheckTool = createActivityTool({
  id: "activity_mastery_check",
  intent: "assess",
  description: "Generate a concise mastery check with evidence criteria for the active goal.",
  buildOutput: masteryCheckOutput,
})

const activityReflectionTool = createActivityTool({
  id: "activity_reflection",
  intent: "assess",
  description: "Generate a reflection-based assessment prompt for the active goal.",
  buildOutput: reflectionOutput,
})

const activityRetrievalCheckTool = createActivityTool({
  id: "activity_retrieval_check",
  intent: "assess",
  description: "Generate a lightweight retrieval check for the active goal.",
  buildOutput: retrievalCheckOutput,
})

const activityTransferCheckTool = createActivityTool({
  id: "activity_transfer_check",
  intent: "assess",
  description: "Generate a transfer check that changes one meaningful condition.",
  buildOutput: transferCheckOutput,
})

export {
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
}
