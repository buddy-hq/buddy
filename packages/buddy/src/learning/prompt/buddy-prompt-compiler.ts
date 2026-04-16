import { getIntentPrompt } from "../intents/get-intent-prompt"
import type { PromptContext } from "./context"
import { buildBuddyRuntimeContext } from "./runtime-context"
import { buildBuddyUserPrelude, type BuddyUserPreludePart } from "./user-prelude"

export type BuddyPromptEnvelope = {
  systemContext: string
  userPreludeParts: readonly BuddyUserPreludePart[]
  changedSinceCheckpoint?: boolean
}

export async function buildBuddyPromptEnvelope(input: PromptContext): Promise<BuddyPromptEnvelope> {
  const runtimeContext = await buildBuddyRuntimeContext(input)
  const intentSection = `<student_intent>\n${getIntentPrompt(input.intent)}\n</student_intent>`
  const systemContext = [intentSection, runtimeContext.runtimeContext].filter(Boolean).join("\n\n")

  const userPreludeParts = buildBuddyUserPrelude({
    context: input,
    changedSinceCheckpoint: runtimeContext.changedSinceCheckpoint,
  })

  return {
    systemContext,
    userPreludeParts,
    changedSinceCheckpoint: runtimeContext.changedSinceCheckpoint,
  }
}
