import { getBuddyClient, requireBuddyData } from "@/lib/buddy-client"
import {
  buildNotebookLearnerMemoryPatch,
  resolveNotebookLearnerMemorySelection,
} from "@/state/learner-memory-settings"

type TLearnerMemoryGlobalConfig = Parameters<typeof resolveNotebookLearnerMemorySelection>[0]

type LearnerMemoryBootstrapInput = {
  directory: string
  enabled?: boolean
  autoExtract?: boolean
}

export function buildLearnerMemoryNotebookBootstrapPatch(input: {
  globalConfig: TLearnerMemoryGlobalConfig
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
  const projectPatch = buildLearnerMemoryNotebookBootstrapPatch({
    globalConfig,
    enabled,
    autoExtract,
  })

  if (!projectPatch) {
    return
  }
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
