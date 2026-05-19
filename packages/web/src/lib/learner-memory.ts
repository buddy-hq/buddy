import { getBuddyClient, requireBuddyData } from "@/lib/buddy-client"

type LearnerMemoryBootstrapInput = {
  directory: string
  enabled?: boolean
  autoExtract?: boolean
}

type LearnerMemoryBootstrapPatch = {
  learner_memory: {
    master_enabled?: boolean
    enabled?: boolean
    auto_extract?: boolean
  }
}

export function buildLearnerMemoryGlobalBootstrapPatch(
  input: LearnerMemoryBootstrapInput,
): LearnerMemoryBootstrapPatch | undefined {
  if (!input.enabled) {
    return undefined
  }

  return {
    learner_memory: {
      master_enabled: true,
    },
  }
}

export function buildLearnerMemoryProjectBootstrapPatch(
  input: LearnerMemoryBootstrapInput,
): LearnerMemoryBootstrapPatch | undefined {
  if (!input.enabled) {
    return undefined
  }

  return {
    learner_memory: {
      enabled: true,
      auto_extract: Boolean(input.autoExtract),
    },
  }
}

export async function bootstrapLearnerMemoryForNotebook({
  directory,
  enabled,
  autoExtract,
}: LearnerMemoryBootstrapInput) {
  const globalPatch = buildLearnerMemoryGlobalBootstrapPatch({
    directory,
    enabled,
    autoExtract,
  })
  const projectPatch = buildLearnerMemoryProjectBootstrapPatch({
    directory,
    enabled,
    autoExtract,
  })

  if (!globalPatch || !projectPatch) {
    return
  }

  requireBuddyData(
    await getBuddyClient().global.config.patch({
      body: globalPatch,
    }),
  )
  requireBuddyData(
    await getBuddyClient(directory).config.update({
      body: projectPatch,
    }),
  )
}

export async function bootstrapLearnerMemoryForNotebookBestEffort(
  input: LearnerMemoryBootstrapInput,
) {
  try {
    await bootstrapLearnerMemoryForNotebook(input)
  } catch (error) {
    console.warn("Failed to bootstrap learner memory for notebook", {
      directory: input.directory,
      error,
    })
  }
}
