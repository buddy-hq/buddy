import { buildSystemPrompt } from './system-prompt'
import { buildTurnPrompt } from './turn-prompt'
import type { PromptTurnSnapshot, SystemPromptCtx } from './prompt-context'

export type LearningPromptBuild = {
  systemContext: string
  turnReminder?: string
}

export type BuildLearningSystemPromptInput = SystemPromptCtx

export async function buildLearningSystemPrompt(
  input: BuildLearningSystemPromptInput,
): Promise<LearningPromptBuild> {
  const systemBuild = await buildSystemPrompt(input)
  const currentTurn: PromptTurnSnapshot = {
    persona: input.persona,
    intent: input.intent,
    workspaceState: input.teachingContext?.active ? 'interactive' : 'chat',
  }

  const turnReminder = buildTurnPrompt({
    priorTurn: input.priorTurn,
    currentTurn,
    changedSinceCheckpoint: systemBuild.changedSinceCheckpoint,
  })

  return {
    systemContext: systemBuild.systemContext,
    ...(turnReminder ? { turnReminder } : {}),
  }
}
