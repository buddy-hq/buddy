import { registerBuddyTools, unregisterBuddyTools } from './register-buddy-tools'
import {
  assertLearningToolCatalog,
  getLearningToolGroup,
  type LearningToolGroup,
} from './tool-catalog'

type LearningToolRegistrationFlags = {
  registerPedagogyTools: boolean
  registerCurriculumTools: boolean
  registerFigureTools: boolean
  registerFreeformFigureTools: boolean
  registerGoalTools: boolean
  registerLearnerTools: boolean
  registerTeachingTools: boolean
  registerMathTools: boolean
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

function unregisterToolGroup(input: {
  enabled: boolean
  directory: string
  group: LearningToolGroup
  warning: string
  registrations: Promise<void>[]
}): void {
  if (input.enabled) return

  input.registrations.push(
    unregisterBuddyTools(
      input.directory,
      getLearningToolGroup(input.group).map((tool) => tool.id),
    ).catch((error) => {
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
    enabled: flags.registerPedagogyTools,
    directory,
    group: 'pedagogy',
    warning: 'Failed to register Buddy pedagogy tools into OpenCode runtime:',
    registrations,
  })

  registerToolGroup({
    enabled: flags.registerCurriculumTools,
    directory,
    group: 'curriculum',
    warning: 'Failed to register Buddy curriculum tools into OpenCode runtime:',
    registrations,
  })

  registerToolGroup({
    enabled: flags.registerGoalTools,
    directory,
    group: 'goals',
    warning: 'Failed to register Buddy goal tools into OpenCode runtime:',
    registrations,
  })

  registerToolGroup({
    enabled: flags.registerLearnerTools,
    directory,
    group: 'learner',
    warning: 'Failed to register Buddy learner tools into OpenCode runtime:',
    registrations,
  })

  registerToolGroup({
    enabled: flags.registerTeachingTools,
    directory,
    group: 'teaching',
    warning: 'Failed to register Buddy teaching tools into OpenCode runtime:',
    registrations,
  })

  registerToolGroup({
    enabled: flags.registerFigureTools,
    directory,
    group: 'figures',
    warning: 'Failed to register Buddy figure tools into OpenCode runtime:',
    registrations,
  })

  registerToolGroup({
    enabled: flags.registerFreeformFigureTools,
    directory,
    group: 'freeformFigures',
    warning: 'Failed to register Buddy freeform figure tools into OpenCode runtime:',
    registrations,
  })

  registerToolGroup({
    enabled: flags.registerMathTools,
    directory,
    group: 'math',
    warning: 'Failed to register Buddy math tools into OpenCode runtime:',
    registrations,
  })
  unregisterToolGroup({
    enabled: flags.registerMathTools,
    directory,
    group: 'math',
    warning: 'Failed to unregister Buddy math tools from OpenCode runtime:',
    registrations,
  })

  if (registrations.length === 0) return
  await Promise.all(registrations)
}

export { registerRuntimeTools }
export type { LearningToolRegistrationFlags }
