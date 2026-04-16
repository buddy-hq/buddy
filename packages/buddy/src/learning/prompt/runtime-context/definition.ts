import type { PromptContext } from "../context"

export type RuntimeCheckpointStatus = {
  changedSinceLastCheckpoint: boolean
  trackedFiles: string[]
}

export type RuntimeSectionContext = PromptContext & {
  hasEditor: boolean
  checkpointStatus?: RuntimeCheckpointStatus
}

export type RuntimeSectionDefinition = {
  key: string
  when?: (context: RuntimeSectionContext) => boolean
  render: (context: RuntimeSectionContext) => string | undefined
}

export function defineRuntimeSection<const T extends RuntimeSectionDefinition>(definition: T): T {
  return definition
}
