import { getBuddyClient } from "@/lib/buddy-client"

type LearnerMemoryBootstrapInput = {
  directory: string
  enabled?: boolean
  autoExtract?: boolean
}

export async function bootstrapLearnerMemoryForNotebook({
  directory,
  enabled,
  autoExtract,
}: LearnerMemoryBootstrapInput) {
  if (!enabled) {
    return
  }

  await getBuddyClient(directory).config.update({
    body: {
      learner_memory: {
        enabled: true,
        auto_extract: Boolean(autoExtract),
      },
    },
  })
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
