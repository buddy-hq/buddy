import { ensureActivityToolsRegistered } from "../activities/tools/register.js"
import { ensureCurriculumToolsRegistered } from "../curriculum/tools/register.js"
import { ensureFigureToolsRegistered } from "../figures/tools/register.js"
import { ensureFreeformFigureToolsRegistered } from "../freeform-figures/tools/register.js"
import { ensureGoalToolsRegistered } from "../goals/tools/register.js"
import { ensureLearnerToolsRegistered } from "../learner/tools/register.js"
import { ensureTeachingToolsRegistered } from "../teaching/tools/register.js"

type LearningToolRegistrationFlags = {
  registerCurriculumTools: boolean
  registerFigureTools: boolean
  registerFreeformFigureTools: boolean
  registerGoalTools: boolean
  registerLearnerTools: boolean
  registerTeachingTools: boolean
}

function warnToolRegistrationFailure(message: string, error: unknown): void {
  console.warn(message, error)
}

function registerTool(input: {
  enabled: boolean
  task: () => Promise<void>
  warning: string
  registrations: Promise<void>[]
}): void {
  if (!input.enabled) return
  input.registrations.push(
    input.task().catch((error) => {
      warnToolRegistrationFailure(input.warning, error)
    }),
  )
}

async function registerLearningRuntimeTools(
  directory: string,
  flags: LearningToolRegistrationFlags,
): Promise<void> {
  const registrations: Promise<void>[] = []

  registerTool({
    enabled: flags.registerCurriculumTools,
    task: () => ensureCurriculumToolsRegistered(directory),
    warning: "Failed to register Buddy curriculum tools into OpenCode runtime:",
    registrations,
  })

  registerTool({
    enabled: flags.registerGoalTools,
    task: () => ensureGoalToolsRegistered(directory),
    warning: "Failed to register Buddy goal tools into OpenCode runtime:",
    registrations,
  })

  registerTool({
    enabled: flags.registerLearnerTools,
    task: () => ensureLearnerToolsRegistered(directory),
    warning: "Failed to register Buddy learner tools into OpenCode runtime:",
    registrations,
  })

  registerTool({
    enabled: flags.registerLearnerTools,
    task: () => ensureActivityToolsRegistered(directory),
    warning: "Failed to register Buddy activity tools into OpenCode runtime:",
    registrations,
  })

  registerTool({
    enabled: flags.registerTeachingTools,
    task: () => ensureTeachingToolsRegistered(directory),
    warning: "Failed to register Buddy teaching tools into OpenCode runtime:",
    registrations,
  })

  registerTool({
    enabled: flags.registerFigureTools,
    task: () => ensureFigureToolsRegistered(directory),
    warning: "Failed to register Buddy figure tools into OpenCode runtime:",
    registrations,
  })

  registerTool({
    enabled: flags.registerFreeformFigureTools,
    task: () => ensureFreeformFigureToolsRegistered(directory),
    warning: "Failed to register Buddy freeform figure tools into OpenCode runtime:",
    registrations,
  })

  if (registrations.length === 0) return
  await Promise.all(registrations)
}

export {
  registerLearningRuntimeTools,
}
export type {
  LearningToolRegistrationFlags,
}
