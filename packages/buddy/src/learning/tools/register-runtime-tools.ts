import { registerBuddyTools, unregisterBuddyTools } from "./register-buddy-tools"
import { assertUniqueLearningToolIds } from "./tool-catalog"
import { allLearningToolGroups, type LearningToolGroup } from "./learning-tool-group-policies"
import {
  allKnownLearningTools,
  getRegisteredLearningToolGroup as getLearningToolGroup,
  getRegisteredLearningToolGroupDescriptor as getLearningToolGroupDescriptor,
} from "./tool-registry"

type LearningToolRegistrationFlags = Record<LearningToolGroup, boolean>

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
  assertUniqueLearningToolIds(allKnownLearningTools())
  const registrations: Promise<void>[] = []

  for (const group of allLearningToolGroups()) {
    const policy = getLearningToolGroupDescriptor(group)

    registerToolGroup({
      enabled: flags[group],
      directory,
      group,
      warning: policy.registerWarning,
      registrations,
    })

    if (policy.unregisterWarning) {
      unregisterToolGroup({
        enabled: flags[group],
        directory,
        group,
        warning: policy.unregisterWarning,
        registrations,
      })
    }
  }

  if (registrations.length === 0) return
  await Promise.all(registrations)
}

export { registerRuntimeTools }
export type { LearningToolRegistrationFlags }
