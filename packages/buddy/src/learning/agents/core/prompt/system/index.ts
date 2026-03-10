import {
  buildSystemContext,
} from "./system-context"
import {
  buildTurnReminder,
} from "./turn-reminder"
import type {
  PromptBuildContext,
  PromptRuntimeState,
} from "./prompt-build-context"

export type {
  SystemContextBuild,
} from "./system-context"
export type {
  PromptBuildContext,
  PromptRuntimeState,
} from "./prompt-build-context"
export {
  buildSystemContext,
  buildTurnReminder,
}

export type LearningPromptBuild = {
  systemContext: string
  turnReminder?: string
}

export type BuildLearningSystemPromptInput = PromptBuildContext

export async function buildLearningSystemPrompt(input: BuildLearningSystemPromptInput): Promise<LearningPromptBuild> {
  const systemBuild = await buildSystemContext(input)
  const currentState: PromptRuntimeState = {
    persona: input.runtime.profile.persona,
    intentOverride: input.runtime.intentOverride,
    workspaceState: input.workspace.teachingContext?.active ? "interactive" : "chat",
  }

  const turnReminder = buildTurnReminder({
    previousState: input.previousState,
    currentState,
    activityBundle: input.runtime.activityBundle,
    changedSinceCheckpoint: systemBuild.changedSinceCheckpoint,
  })

  return {
    systemContext: systemBuild.systemContext,
    ...(turnReminder ? { turnReminder } : {}),
  }
}
