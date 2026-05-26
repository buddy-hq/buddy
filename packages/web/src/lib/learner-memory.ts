import { getBuddyClient, requireBuddyData } from "@/lib/buddy-client"
import {
  buildNotebookLearnerMemoryPatch,
  resolveNotebookLearnerMemorySelection,
} from "@/state/learner-memory-settings"
import { readLearnerMemoryMasterEnabled } from "@/state/project-config-readers"

type LearnerMemoryBootstrapInput = {
  directory: string
  enabled?: boolean
  autoExtract?: boolean
}

type LearnerMemoryBootstrapPatch = {
  learner_memory: {
    master_enabled: boolean
  }
}

export function buildLearnerMemoryGlobalBootstrapPatch(input: {
  globalConfig: Record<string, unknown>
  enabled?: boolean
}): LearnerMemoryBootstrapPatch | undefined {
  if (!input.enabled || readLearnerMemoryMasterEnabled(input.globalConfig, false)) {
    return undefined
  }

  return {
    learner_memory: {
      master_enabled: true,
    },
  }
}

export function buildLearnerMemoryNotebookBootstrapPatch(input: {
  globalConfig: Record<string, unknown>
  enabled?: boolean
  autoExtract?: boolean
}) {
  const defaults = resolveNotebookLearnerMemorySelection(input.globalConfig, {})
  const enabled = input.enabled ?? defaults.enabled
  const autoExtract = enabled ? (input.autoExtract ?? defaults.autoExtract) : false

  return buildNotebookLearnerMemoryPatch({
    globalConfig: input.globalConfig,
    rawProjectConfig: {},
    enabled,
    autoExtract,
  })
}

export async function bootstrapLearnerMemoryForNotebook({
  directory,
  enabled,
  autoExtract,
}: LearnerMemoryBootstrapInput) {
  const globalConfig = requireBuddyData(await getBuddyClient().global.config.get())
  const globalPatch = buildLearnerMemoryGlobalBootstrapPatch({
    globalConfig,
    enabled,
  })
  const projectPatch = buildLearnerMemoryNotebookBootstrapPatch({
    globalConfig,
    enabled,
    autoExtract,
  })

  if (!globalPatch && !projectPatch) {
    return
  }

  if (globalPatch) {
    requireBuddyData(
      await getBuddyClient().global.config.patch({
        body: globalPatch,
      }),
    )
  }

  if (projectPatch) {
    requireBuddyData(
      await getBuddyClient(directory).config.update({
        body: projectPatch,
      }),
    )
  }
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
