import type { PromptContext } from "../context"
import BUDDY_RUNTIME_CONTEXT_TEMPLATE_SOURCE from "./index.t.md"
import { calculatorSection } from "./calculator-context"
import type { RuntimeSectionContext, RuntimeSectionDefinition } from "./definition"
import { modelSection } from "./model-context"
import { personalizationSection } from "./personalization-context"
import { resourcesSection } from "./resource-context"
import {
  getCheckpointStatus,
  teachingPolicySection,
  teachingWorkspaceSection,
} from "./teaching-workspace-context"
import { teachingWorkspaceStateSection } from "./teaching-workspace-state-context"
import { definePromptTemplate } from "../template/engine"

export type BuddyRuntimeContextBuild = {
  runtimeContext: string
  changedSinceCheckpoint?: boolean
}

const BUDDY_RUNTIME_CONTEXT_TEMPLATE_NAME = "learning/prompt/runtime-context/index.t.md"

const BUDDY_RUNTIME_CONTEXT_TEMPLATE = definePromptTemplate({
  source: BUDDY_RUNTIME_CONTEXT_TEMPLATE_SOURCE,
  debugName: BUDDY_RUNTIME_CONTEXT_TEMPLATE_NAME,
})

export async function buildBuddyRuntimeContext(
  input: PromptContext,
): Promise<BuddyRuntimeContextBuild> {
  const hasEditor = input.visibleSurfaces.includes("editor")

  const checkpointStatusPromise =
    input.teachingContext?.active && hasEditor
      ? getCheckpointStatus(input.directory, input.teachingContext.sessionID)
      : Promise.resolve(undefined)

  const checkpointStatus = await checkpointStatusPromise
  const runtimeInput: RuntimeSectionContext = {
    ...input,
    hasEditor,
    checkpointStatus,
  }

  const runtimeSections = await Promise.all(
    RUNTIME_SECTIONS.map(async (definition) => {
      if (definition.when && !definition.when(runtimeInput)) {
        return undefined
      }
      return definition.render(runtimeInput)
    }),
  )

  return {
    runtimeContext: BUDDY_RUNTIME_CONTEXT_TEMPLATE.render({
      runtime_sections: runtimeSections
        .filter((section: string | undefined): section is string => !!section)
        .join("\n\n"),
    }),
    changedSinceCheckpoint: checkpointStatus?.changedSinceLastCheckpoint,
  }
}

const RUNTIME_SECTIONS: readonly RuntimeSectionDefinition[] = [
  teachingWorkspaceStateSection,
  modelSection,
  personalizationSection,
  calculatorSection,
  resourcesSection,
  teachingPolicySection,
  teachingWorkspaceSection,
]
