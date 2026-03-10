import { registerBuddyTools } from "./register-buddy-tools"
import { assertLearningToolCatalog, getLearningToolGroup, type LearningToolGroup } from "./tool-catalog"

type LearningToolRegistrationFlags = {
  registerActivityTools: boolean
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

function registerToolGroup(input: {
  enabled: boolean
  directory: string
  group: LearningToolGroup
  warning: string
  registrations: Promise<void>[]
}): void {
  if (!input.enabled) return

  input.registrations.push(
    registerBuddyTools(input.directory, getLearningToolGroup(input.group)).catch((error) => {
      warnToolRegistrationFailure(input.warning, error)
    }),
  )
}

async function registerRuntimeTools(
  directory: string,
  flags: LearningToolRegistrationFlags,
): Promise<void> {
  assertLearningToolCatalog()
  const registrations: Promise<void>[] = []

  registerToolGroup({
    enabled: flags.registerActivityTools,
    directory,
    group: "activities",
    warning: "Failed to register Buddy activity tools into OpenCode runtime:",
    registrations,
  })

  registerToolGroup({
    enabled: flags.registerCurriculumTools,
    directory,
    group: "curriculum",
    warning: "Failed to register Buddy curriculum tools into OpenCode runtime:",
    registrations,
  })

  registerToolGroup({
    enabled: flags.registerGoalTools,
    directory,
    group: "goals",
    warning: "Failed to register Buddy goal tools into OpenCode runtime:",
    registrations,
  })

  registerToolGroup({
    enabled: flags.registerLearnerTools,
    directory,
    group: "learner",
    warning: "Failed to register Buddy learner tools into OpenCode runtime:",
    registrations,
  })

  registerToolGroup({
    enabled: flags.registerTeachingTools,
    directory,
    group: "teaching",
    warning: "Failed to register Buddy teaching tools into OpenCode runtime:",
    registrations,
  })

  registerToolGroup({
    enabled: flags.registerFigureTools,
    directory,
    group: "figures",
    warning: "Failed to register Buddy figure tools into OpenCode runtime:",
    registrations,
  })

  registerToolGroup({
    enabled: flags.registerFreeformFigureTools,
    directory,
    group: "freeformFigures",
    warning: "Failed to register Buddy freeform figure tools into OpenCode runtime:",
    registrations,
  })

  if (registrations.length === 0) return
  await Promise.all(registrations)
}

export {
  registerRuntimeTools,
}
export type {
  LearningToolRegistrationFlags,
}
